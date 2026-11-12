"use client";

import {
  ArrowLeft,
  Check as CheckIcon,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CheckEditor } from "@/components/admin/CheckEditor";
import { TopologyBuilder } from "@/components/admin/TopologyBuilder";
import { CommandsEditor, StepsEditor } from "@/components/admin/StepsEditor";
import type { Check } from "@/engine/checks";
import { Network, shortIf } from "@/engine/network";
import { getLab, listLabs, type LabMeta } from "@/lib/labs";
import { LEVELS, getTp, saveTp, type AddrRow, type Tp } from "@/lib/tps";

type Form = Omit<Tp, "id" | "updatedAt">;
const EMPTY_NET = JSON.stringify(new Network().toJSON());
const EMPTY: Form = {
  title: "",
  level: "CCNA 1",
  summary: "",
  statement: "",
  topology: EMPTY_NET,
  checks: [],
  published: false,
  position: 1,
  image: "",
  context: "",
  objectives: "",
  addressing: [],
  tips: "",
  steps: [],
  commands: [],
};

/** Réduit une image (WebP, 1600 px max) pour qu'elle tienne dans le document du TP. */
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ko;
      i.src = url;
    });
    for (const [max, q] of [
      [1600, 0.85],
      [1400, 0.75],
      [1100, 0.7],
      [900, 0.6],
    ] as const) {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/webp", q);
      if (out.length < 650_000) return out;
    }
    throw new Error("trop lourde");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Editor() {
  const id = useSearchParams().get("id") ?? undefined;
  const router = useRouter();
  const { user } = useAuth();
  const [form, setForm] = useState<Form | null>(id ? null : EMPTY);
  const [labs, setLabs] = useState<LabMeta[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (id)
      getTp(id).then((t) => {
        if (!t) return setMsg("TP introuvable.");
        const { id: _i, updatedAt: _u, ...rest } = t;
        setForm({ ...EMPTY, ...rest, topology: rest.topology || EMPTY_NET });
      });
  }, [id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (user)
      listLabs(user.uid)
        .then(setLabs)
        .catch(() => {});
  }, [user]);

  // Équipements de la topologie de départ (pour choisir les critères)
  const net = useMemo(() => {
    try {
      return form?.topology
        ? Network.fromJSON(JSON.parse(form.topology))
        : null;
    } catch {
      return null;
    }
  }, [form?.topology]);
  const devices = net?.devices ?? [];

  if (!form)
    return <Loader2 className="mx-auto mt-20 animate-spin text-kora-200" />;
  const set = (patch: Partial<Form>) => (
    setForm({ ...form, ...patch }),
    setDirty(true)
  );

  const setImage = async (f?: File | null) => {
    if (!f || !f.type.startsWith("image/"))
      return setMsg("Choisissez une image (PNG, JPG, WebP).");
    try {
      set({ image: await compressImage(f) });
      setMsg("Photo de la topologie ajoutée ✓ (pensez à enregistrer)");
    } catch {
      setMsg("Image illisible ou trop lourde.");
    }
  };

  const addrSet = (i: number, patch: Partial<AddrRow>) =>
    set({
      addressing: form.addressing.map((r, k) =>
        k === i ? { ...r, ...patch } : r,
      ),
    });
  const fillAddressing = () => {
    if (!net) return;
    const rows: AddrRow[] = [];
    for (const d of net.devices) {
      if (d.kind === "router")
        for (const i of d.ifaces.filter((x) =>
          net.links.some(
            (l) =>
              (l.a.dev === d.id && l.a.iface === x.name) ||
              (l.b.dev === d.id && l.b.iface === x.name),
          ),
        ))
          rows.push({
            device: d.hostname,
            iface: shortIf(i.name),
            ip: "",
            mask: "",
            gw: "",
          });
      else if (d.kind === "pc")
        rows.push({
          device: d.hostname,
          iface: d.ifaces[0].name === "Wireless0" ? "Wi-Fi" : "NIC",
          ip: "",
          mask: "",
          gw: "",
        });
    }
    set({
      addressing: [
        ...form.addressing,
        ...rows.filter(
          (r) =>
            !form.addressing.some(
              (x) => x.device === r.device && x.iface === r.iface,
            ),
        ),
      ],
    });
  };

  const pickLab = async (labId: string) => {
    const lab = await getLab(labId);
    if (lab)
      (set({ topology: lab.data }),
        setMsg(`Topologie importée depuis « ${lab.name} ».`));
  };

  const importFile = async (f: File) => {
    try {
      const text = await f.text();
      Network.fromJSON(JSON.parse(text));
      set({ topology: text });
      setMsg(`Topologie importée depuis « ${f.name} ».`);
    } catch {
      setMsg("Ce fichier n'est pas un lab KoraLab valide.");
    }
  };

  const save = async () => {
    if (!form.title.trim()) return setMsg("Le titre est obligatoire.");
    if (!devices.length)
      return setMsg("Ajoutez au moins un équipement à la topologie.");
    setBusy(true);
    try {
      const newId = await saveTp({ ...form, title: form.title.trim() }, id);
      setMsg("TP enregistré ✓");
      setDirty(false);
      if (!id) router.replace(`/admin/tps/editer?id=${newId}`);
    } catch (e) {
      console.error(e);
      setMsg("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-kora-300";
  const card =
    "scroll-mt-24 space-y-3 rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8";
  const steps: [string, string, boolean][] = [
    ["infos", "Informations", !!form.title.trim()],
    ["topo", "Topologie", devices.length > 0],
    ["enonce", "Énoncé", !!(form.context || form.objectives || form.statement)],
    ["criteres", "Critères", form.checks.length > 0],
    ["etapes", "Étapes", form.steps.length > 0],
  ];
  /** Garde les étapes rattachées aux bons critères quand un critère est supprimé. */
  const setChecks = (next: Check[]) => {
    const old = form.checks;
    const remap = (i: number) => {
      const j = next.indexOf(old[i]);
      if (j >= 0) return j;
      return next.length === old.length ? i : -1;
    };
    set({ checks: next, steps: form.steps.map((st) => ({ ...st, checks: st.checks.map(remap).filter((x) => x >= 0) })) });
  };

  return (
    <div
      className="mx-auto max-w-5xl pb-16"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          save();
        }
      }}
      onPaste={(e) => {
        const f = [...e.clipboardData.files].find((x) =>
          x.type.startsWith("image/"),
        );
        if (f) (e.preventDefault(), setImage(f));
      }}
    >
      {/* En-tête collant : étapes et enregistrement */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-white/8 bg-ink-950/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/tps"
            className="flex items-center gap-1.5 text-sm text-kora-300 hover:text-white"
          >
            <ArrowLeft size={15} /> Tous les TP
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold">
            {form.title.trim() || (id ? "Modifier le TP" : "Nouveau TP")}
          </h1>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => set({ published: e.target.checked })}
              className="h-4 w-4 accent-kora-500"
            />
            Publié
          </label>
          {id && (
            <Link
              href={`/tp?id=${id}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-kora-200 ring-1 ring-white/10 hover:text-white"
            >
              <ExternalLink size={14} /> Tester
            </Link>
          )}
          <button
            onClick={save}
            disabled={busy}
            title="Ctrl+S"
            className="flex items-center gap-2 rounded-xl bg-kora-500 px-4 py-2 font-semibold text-white hover:bg-kora-400 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}{" "}
            Enregistrer
            {dirty && (
              <span
                className="h-2 w-2 rounded-full bg-amber-300"
                title="Modifications non enregistrées"
              />
            )}
          </button>
        </div>
        <nav className="mt-2 flex gap-1 overflow-x-auto text-xs">
          {steps.map(([k, label, ok], i) => (
            <a
              key={k}
              href={`#${k}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 ring-1 ${ok ? "text-ok ring-ok/30" : "text-kora-200/70 ring-white/10"} hover:bg-white/5`}
            >
              {ok ? <CheckIcon size={12} /> : <span>{i + 1}.</span>} {label}
            </a>
          ))}
        </nav>
      </div>
      {msg && (
        <p className="mt-4 flex items-center justify-between rounded-xl bg-white/[.06] px-4 py-2.5 text-sm text-kora-200">
          {msg}
          <button
            onClick={() => setMsg("")}
            aria-label="Fermer"
            className="text-kora-200/60 hover:text-white"
          >
            <X size={14} />
          </button>
        </p>
      )}

      {/* 1. Informations */}
      <section id="infos" className={`mt-6 ${card}`}>
        <h2 className="font-semibold">1. Informations</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_100px]">
          <label className="text-sm text-kora-200/80">
            Titre
            <input
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              className={`${input} mt-1`}
              placeholder="TP 01 — Configuration de base d'un routeur"
            />
          </label>
          <label className="text-sm text-kora-200/80">
            Niveau
            <select
              value={form.level}
              onChange={(e) => set({ level: e.target.value })}
              className={`${input} mt-1`}
            >
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-kora-200/80">
            Ordre
            <input
              type="number"
              min={0}
              value={form.position}
              onChange={(e) => set({ position: Number(e.target.value) })}
              className={`${input} mt-1`}
            />
          </label>
        </div>
        <label className="block text-sm text-kora-200/80">
          Résumé (une phrase, affichée dans le catalogue)
          <input
            value={form.summary}
            onChange={(e) => set({ summary: e.target.value })}
            className={`${input} mt-1`}
            placeholder="Adressage, interfaces et premier ping entre deux réseaux."
          />
        </label>
      </section>

      {/* 2. Topologie */}
      <section id="topo" className={`mt-6 ${card}`}>
        <h2 className="font-semibold">2. Topologie</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* Photo */}
          <div>
            <p className="mb-1.5 text-sm text-kora-200/80">
              Photo / schéma de la topologie
            </p>
            {form.image ? (
              <div className="relative overflow-hidden rounded-xl bg-white ring-1 ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.image}
                  alt="Topologie"
                  className="max-h-80 w-full object-contain"
                />
                <div className="absolute right-2 top-2 flex gap-1">
                  <button
                    onClick={() => imgInput.current?.click()}
                    className="rounded-lg bg-ink-900/85 px-2 py-1 text-xs text-white hover:bg-ink-900"
                  >
                    Remplacer
                  </button>
                  <button
                    onClick={() => set({ image: "" })}
                    aria-label="Retirer la photo"
                    className="rounded-lg bg-ink-900/85 p-1.5 text-white hover:text-ko"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => imgInput.current?.click()}
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => (
                  e.preventDefault(),
                  setDrag(false),
                  setImage(e.dataTransfer.files[0])
                )}
                className={`grid h-56 w-full place-items-center rounded-xl border-2 border-dashed text-center text-sm transition ${drag ? "border-kora-300 bg-kora-500/10 text-white" : "border-white/15 text-kora-200/70 hover:border-kora-300/60 hover:text-white"}`}
              >
                <span>
                  <ImagePlus size={30} className="mx-auto mb-2 text-kora-300" />
                  Glissez l&apos;image ici, collez-la (Ctrl+V)
                  <br />
                  ou cliquez pour la choisir
                </span>
              </button>
            )}
            <input
              ref={imgInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => (
                setImage(e.target.files?.[0]),
                (e.target.value = "")
              )}
            />
          </div>

          {/* Équipements et câbles */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-kora-200/80">
                Équipements de départ ({devices.length})
              </p>
              <div className="flex gap-1.5">
                <select
                  defaultValue=""
                  onChange={(e) => (
                    e.target.value && pickLab(e.target.value),
                    (e.target.value = "")
                  )}
                  className="rounded-lg bg-ink-900 px-2 py-1 text-xs text-kora-200 outline-none ring-1 ring-white/10"
                >
                  <option value="">Reprendre un de mes labs…</option>
                  {labs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.devices} équipements)
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => file.current?.click()}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-kora-200 ring-1 ring-white/10 hover:text-white"
                >
                  <Upload size={12} /> Fichier
                </button>
                <input
                  ref={file}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => (
                    e.target.files?.[0] && importFile(e.target.files[0]),
                    (e.target.value = "")
                  )}
                />
              </div>
            </div>
            {net && (
              <TopologyBuilder
                key={form.topology.length}
                net={net}
                onChange={(n) => set({ topology: JSON.stringify(n.toJSON()) })}
                onRemoved={(devId) =>
                  setForm(
                    (f) =>
                      f && {
                        ...f,
                        checks: f.checks.filter(
                          (c) => !JSON.stringify(c).includes(`"${devId}"`),
                        ),
                      },
                  )
                }
              />
            )}
          </div>
        </div>
      </section>

      {/* 3. Énoncé */}
      <section id="enonce" className={`mt-6 ${card}`}>
        <h2 className="font-semibold">3. Énoncé</h2>
        <label className="block text-sm text-kora-200/80">
          Contexte
          <textarea
            value={form.context}
            onChange={(e) => set({ context: e.target.value })}
            rows={3}
            className={`${input} mt-1`}
            placeholder="Kora Logistique (entreprise fictive) ouvre un nouveau site à Cotonou…"
          />
        </label>
        <label className="block text-sm text-kora-200/80">
          Objectifs (un par ligne, numérotés automatiquement)
          <textarea
            value={form.objectives}
            onChange={(e) => set({ objectives: e.target.value })}
            rows={6}
            className={`${input} mt-1`}
            placeholder={
              "Nommer le routeur R1\nConfigurer G0/0/0 en 192.168.1.1/24\nVérifier le ping entre PC1 et PC2"
            }
          />
        </label>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-sm text-kora-200/80">Table d&apos;adressage</p>
            {net && net.devices.length > 0 && (
              <button
                onClick={fillAddressing}
                className="text-xs text-kora-300 hover:text-white"
              >
                Pré-remplir depuis la topologie
              </button>
            )}
          </div>
          {form.addressing.length > 0 && (
            <div className="space-y-1.5">
              {form.addressing.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_1.2fr_1.2fr_1.2fr_auto] gap-1.5"
                >
                  {(["device", "iface", "ip", "mask", "gw"] as const).map(
                    (k) => (
                      <input
                        key={k}
                        value={r[k]}
                        onChange={(e) => addrSet(i, { [k]: e.target.value })}
                        placeholder={
                          {
                            device: "Équipement",
                            iface: "Interface",
                            ip: "Adresse IP",
                            mask: "Masque",
                            gw: "Passerelle",
                          }[k]
                        }
                        list={k === "device" ? "tp-devices" : undefined}
                        className="min-w-0 rounded-lg bg-ink-900 px-2 py-1.5 font-mono text-xs outline-none ring-1 ring-white/10 focus:ring-kora-300"
                      />
                    ),
                  )}
                  <button
                    onClick={() =>
                      set({
                        addressing: form.addressing.filter((_, k) => k !== i),
                      })
                    }
                    aria-label="Supprimer la ligne"
                    className="px-1 text-kora-200/50 hover:text-ko"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <datalist id="tp-devices">
            {devices.map((d) => (
              <option key={d.id} value={d.hostname} />
            ))}
          </datalist>
          <button
            onClick={() =>
              set({
                addressing: [
                  ...form.addressing,
                  { device: "", iface: "", ip: "", mask: "", gw: "" },
                ],
              })
            }
            className="mt-1.5 flex items-center gap-1 text-sm text-kora-300 hover:text-white"
          >
            <Plus size={14} /> Ajouter une ligne
          </button>
        </div>
        <label className="block text-sm text-kora-200/80">
          Consignes complémentaires (facultatif)
          <textarea
            value={form.statement}
            onChange={(e) => set({ statement: e.target.value })}
            rows={4}
            className={`${input} mt-1 font-mono`}
            placeholder="Tout autre texte à afficher à l'étudiant."
          />
        </label>
        <label className="block text-sm text-kora-200/80">
          Astuces (une par ligne, repliées par défaut)
          <textarea
            value={form.tips}
            onChange={(e) => set({ tips: e.target.value })}
            rows={3}
            className={`${input} mt-1`}
            placeholder={
              "Les interfaces d'un routeur sont éteintes par défaut : no shutdown\nshow ip interface brief résume l'état des interfaces"
            }
          />
        </label>
      </section>

      {/* 4. Critères */}
      <section id="criteres" className={`mt-6 ${card}`}>
        <h2 className="font-semibold">
          4. Critères de vérification ({form.checks.length})
        </h2>
        <p className="text-sm text-kora-200/70">
          Quand l&apos;étudiant clique sur « Vérifier », chaque critère est
          testé sur sa topologie. Score = critères réussis / total.
        </p>
        <CheckEditor
          checks={form.checks}
          devices={devices}
          onChange={setChecks}
        />
      </section>

      {/* 5. Étapes guidées */}
      <section id="etapes" className={`mt-6 ${card}`}>
        <h2 className="font-semibold">5. Étapes guidées ({form.steps.length})</h2>
        <p className="text-sm text-kora-200/70">
          L&apos;étudiant voit les étapes une par une, avec une coche verte quand les critères de l&apos;étape sont réussis. Sans étape, l&apos;énoncé classique s&apos;affiche.
        </p>
        <StepsEditor steps={form.steps} checks={form.checks} devices={devices} onChange={(steps) => set({ steps })} />
        <div className="border-t border-white/8 pt-4">
          <h3 className="mb-1 text-sm font-semibold">Résumé des commandes ({form.commands.length})</h3>
          <p className="mb-2 text-xs text-kora-200/60">Affiché à l&apos;étudiant, jamais traduit automatiquement par le navigateur.</p>
          <CommandsEditor commands={form.commands} onChange={(commands) => set({ commands })} />
        </div>
      </section>
    </div>
  );
}

export default function EditTpPage() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}

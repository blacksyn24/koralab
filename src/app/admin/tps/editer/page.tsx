"use client";

import { ArrowLeft, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CHECK_TYPES, describe, type Check } from "@/engine/checks";
import { Network, SVI } from "@/engine/network";
import { getLab, listLabs, type LabMeta } from "@/lib/labs";
import { LEVELS, getTp, saveTp } from "@/lib/tps";

type Form = { title: string; level: string; summary: string; statement: string; topology: string; checks: Check[]; published: boolean; position: number };
const EMPTY: Form = { title: "", level: "CCNA 1", summary: "", statement: "", topology: "", checks: [], published: false, position: 1 };

function blank(type: Check["type"], device: string): Check {
  switch (type) {
    case "hostname":
      return { type, device, value: "" };
    case "ip":
      return { type, device, iface: "", ip: "", mask: "" };
    case "up":
      return { type, device, iface: "" };
    case "gateway":
      return { type, device, value: "" };
    case "route":
      return { type, device, network: "", mask: "" };
    case "ping":
      return { type, device, to: "" };
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

  useEffect(() => {
    if (id)
      getTp(id).then((t) => {
        if (!t) return setMsg("TP introuvable.");
        const { id: _i, updatedAt: _u, ...rest } = t;
        setForm(rest);
      });
  }, [id]);
  useEffect(() => {
    if (user) listLabs(user.uid).then(setLabs).catch(() => {});
  }, [user]);

  // Équipements de la topologie de départ (pour choisir les critères)
  const net = useMemo(() => {
    try {
      return form?.topology ? Network.fromJSON(JSON.parse(form.topology)) : null;
    } catch {
      return null;
    }
  }, [form?.topology]);
  const devices = net?.devices ?? [];
  const nameOf = (devId: string) => devices.find((d) => d.id === devId)?.hostname ?? "?";

  if (!form) return <Loader2 className="mx-auto mt-20 animate-spin text-kora-200" />;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setCheck = (i: number, c: Check) => set({ checks: form.checks.map((x, k) => (k === i ? c : x)) });

  const pickLab = async (labId: string) => {
    const lab = await getLab(labId);
    if (lab) (set({ topology: lab.data }), setMsg(`Topologie importée depuis « ${lab.name} ».`));
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
    if (!form.topology) return setMsg("Choisissez une topologie de départ.");
    setBusy(true);
    try {
      const newId = await saveTp({ ...form, title: form.title.trim() }, id);
      setMsg("TP enregistré ✓");
      if (!id) router.replace(`/admin/tps/editer?id=${newId}`);
    } catch (e) {
      console.error(e);
      setMsg("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-kora-300";

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <Link href="/admin/tps" className="flex items-center gap-1.5 text-sm text-kora-300 hover:text-white">
        <ArrowLeft size={15} /> Tous les TP
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{id ? "Modifier le TP" : "Nouveau TP"}</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.published} onChange={(e) => set({ published: e.target.checked })} className="h-4 w-4 accent-kora-500" />
            Publié
          </label>
          {id && (
            <Link href={`/tp?id=${id}`} className="rounded-xl px-3 py-2 text-sm text-kora-200 ring-1 ring-white/10 hover:text-white">
              Tester
            </Link>
          )}
          <button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-xl bg-kora-500 px-4 py-2 font-semibold text-white hover:bg-kora-400 disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
          </button>
        </div>
      </div>
      {msg && <p className="mt-4 rounded-xl bg-white/[.06] px-4 py-2.5 text-sm text-kora-200">{msg}</p>}

      {/* Informations */}
      <section className="mt-6 space-y-3 rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
        <h2 className="font-semibold">1. Informations</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_100px]">
          <label className="text-sm text-kora-200/80">
            Titre
            <input value={form.title} onChange={(e) => set({ title: e.target.value })} className={`${input} mt-1`} placeholder="TP 01 — Configuration de base d'un routeur" />
          </label>
          <label className="text-sm text-kora-200/80">
            Niveau
            <select value={form.level} onChange={(e) => set({ level: e.target.value })} className={`${input} mt-1`}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-kora-200/80">
            Ordre
            <input type="number" min={0} value={form.position} onChange={(e) => set({ position: Number(e.target.value) })} className={`${input} mt-1`} />
          </label>
        </div>
        <label className="block text-sm text-kora-200/80">
          Résumé (une phrase, affichée dans le catalogue)
          <input value={form.summary} onChange={(e) => set({ summary: e.target.value })} className={`${input} mt-1`} />
        </label>
        <label className="block text-sm text-kora-200/80">
          Énoncé (affiché à côté du labo pendant le TP)
          <textarea
            value={form.statement}
            onChange={(e) => set({ statement: e.target.value })}
            rows={12}
            className={`${input} mt-1 font-mono`}
            placeholder={"Contexte : …\n\nObjectifs :\n1. Nommer le routeur R1\n2. Configurer G0/0/0 en 192.168.1.1/24\n\nTable d'adressage :\n…"}
          />
        </label>
      </section>

      {/* Topologie */}
      <section className="mt-6 space-y-3 rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
        <h2 className="font-semibold">2. Topologie de départ</h2>
        <p className="text-sm text-kora-200/70">
          Construisez la topologie dans le labo (équipements, câbles, éventuellement une configuration de départ), enregistrez-la dans « Mes labs », puis choisissez-la ici.
        </p>
        <div className="flex flex-wrap gap-2">
          <select defaultValue="" onChange={(e) => e.target.value && pickLab(e.target.value)} className={`${input} !w-auto`}>
            <option value="">Choisir un de mes labs…</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.devices} équipements)
              </option>
            ))}
          </select>
          <button onClick={() => file.current?.click()} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-kora-200 ring-1 ring-white/10 hover:text-white">
            <Upload size={15} /> Importer un fichier
          </button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => (e.target.files?.[0] && importFile(e.target.files[0]), (e.target.value = ""))} />
        </div>
        {net ? (
          <p className="text-sm text-ok">
            ✓ {devices.length} équipements : {devices.map((d) => d.hostname).join(", ")} · {net.links.length} câbles
          </p>
        ) : (
          <p className="text-sm text-amber-300">Aucune topologie pour l&apos;instant.</p>
        )}
      </section>

      {/* Critères */}
      <section className="mt-6 space-y-3 rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">3. Critères de vérification ({form.checks.length})</h2>
          <button
            disabled={!devices.length}
            onClick={() => set({ checks: [...form.checks, blank("ping", devices[0]?.id ?? "")] })}
            className="flex items-center gap-1.5 rounded-lg bg-kora-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-kora-400 disabled:opacity-40"
          >
            <Plus size={15} /> Ajouter
          </button>
        </div>
        <p className="text-sm text-kora-200/70">Quand l&apos;étudiant clique sur « Vérifier », chaque critère est testé sur sa topologie. Score = critères réussis / total.</p>
        {form.checks.map((c, i) => {
          const dev = devices.find((d) => d.id === c.device);
          const ifaces = dev ? [...dev.ifaces.map((x) => x.name), ...(dev.svi ? [SVI] : [])] : [];
          return (
            <div key={i} className="space-y-2 rounded-xl bg-ink-900/70 p-3 ring-1 ring-white/8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-kora-300">#{i + 1}</span>
                <select value={c.type} onChange={(e) => setCheck(i, blank(e.target.value as Check["type"], c.device))} className={`${input} !w-auto`}>
                  {CHECK_TYPES.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select value={c.device} onChange={(e) => setCheck(i, { ...c, device: e.target.value } as Check)} className={`${input} !w-auto`}>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.hostname}
                    </option>
                  ))}
                </select>
                {(c.type === "ip" || c.type === "up") && (
                  <select value={c.iface} onChange={(e) => setCheck(i, { ...c, iface: e.target.value })} className={`${input} !w-auto`}>
                    <option value="">Interface…</option>
                    {ifaces.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                )}
                {c.type === "ip" && (
                  <>
                    <input value={c.ip} onChange={(e) => setCheck(i, { ...c, ip: e.target.value.trim() })} placeholder="IP" className={`${input} !w-36 font-mono`} />
                    <input value={c.mask} onChange={(e) => setCheck(i, { ...c, mask: e.target.value.trim() })} placeholder="Masque" className={`${input} !w-40 font-mono`} />
                  </>
                )}
                {(c.type === "hostname" || c.type === "gateway") && (
                  <input value={c.value} onChange={(e) => setCheck(i, { ...c, value: e.target.value.trim() })} placeholder={c.type === "hostname" ? "Nom attendu" : "IP de la passerelle"} className={`${input} !w-44 font-mono`} />
                )}
                {c.type === "route" && (
                  <>
                    <input value={c.network} onChange={(e) => setCheck(i, { ...c, network: e.target.value.trim() })} placeholder="Réseau" className={`${input} !w-36 font-mono`} />
                    <input value={c.mask} onChange={(e) => setCheck(i, { ...c, mask: e.target.value.trim() })} placeholder="Masque" className={`${input} !w-40 font-mono`} />
                  </>
                )}
                {c.type === "ping" && <input value={c.to} onChange={(e) => setCheck(i, { ...c, to: e.target.value.trim() })} placeholder="IP à pinguer" className={`${input} !w-40 font-mono`} />}
                <button onClick={() => set({ checks: form.checks.filter((_, k) => k !== i) })} title="Supprimer" className="ml-auto rounded-lg p-2 text-ko/80 hover:bg-white/8 hover:text-ko">
                  <Trash2 size={15} />
                </button>
              </div>
              <p className="text-xs text-kora-200/60">→ {describe(c, nameOf)}</p>
            </div>
          );
        })}
        {!devices.length && <p className="text-sm text-kora-200/60">Choisissez d&apos;abord une topologie pour ajouter des critères.</p>}
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

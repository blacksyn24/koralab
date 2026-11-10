"use client";

import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CheckEditor } from "@/components/admin/CheckEditor";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Check } from "@/engine/checks";
import { Network } from "@/engine/network";
import { getHackathon, getSecrets, saveHackathon, type Challenge } from "@/lib/hackathons";
import { getLab, listLabs, type LabMeta } from "@/lib/labs";
import { askConfirm } from "@/components/Dialog";

type Form = { title: string; summary: string; description: string; rules: string; startAt: string; endAt: string; published: boolean; challenges: Challenge[] };

/** Date -> valeur d'un champ datetime-local (heure locale). */
const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const DEFAULT_RULES = `• Épreuves individuelles : chaque participant travaille seul.
• Les épreuves s'ouvrent au début du hackathon et ferment à la fin : aucune soumission n'est acceptée après.
• Cliquez sur « Soumettre » autant de fois que vous voulez (une fois toutes les 10 secondes) : seul votre meilleur score par épreuve compte.
• Points partiels : chaque critère réussi rapporte une part des points de l'épreuve.
• En cas d'égalité, le premier à avoir atteint son score passe devant.
• Toute tentative de triche entraîne l'exclusion.`;

function newChallenge(n: number): Challenge {
  return { id: `c${Date.now().toString(36)}${n}`, title: `Épreuve ${n}`, statement: "", points: 100, topology: "" };
}

function Editor() {
  const id = useSearchParams().get("id") ?? undefined;
  const router = useRouter();
  const { user } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [checks, setChecks] = useState<Record<string, Check[]>>({});
  const [open, setOpen] = useState(0);
  const [labs, setLabs] = useState<LabMeta[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      const start = new Date(Date.now() + 7 * 86400000);
      start.setHours(9, 0, 0, 0);
      setForm({
        title: "",
        summary: "",
        description: "",
        rules: DEFAULT_RULES,
        startAt: toLocal(start),
        endAt: toLocal(new Date(start.getTime() + 3 * 3600000)),
        published: false,
        challenges: [newChallenge(1)],
      });
      return;
    }
    Promise.all([getHackathon(id), getSecrets(id)]).then(([h, s]) => {
      if (!h) return setMsg("Hackathon introuvable.");
      setForm({ ...h, startAt: toLocal(h.startAt), endAt: toLocal(h.endAt) });
      setChecks(s);
    });
  }, [id]);
  useEffect(() => {
    if (user) listLabs(user.uid).then(setLabs).catch(() => {});
  }, [user]);

  const current = form?.challenges[open];
  const devices = useMemo(() => {
    try {
      return current?.topology ? Network.fromJSON(JSON.parse(current.topology)).devices : [];
    } catch {
      return [];
    }
  }, [current?.topology]);

  if (!form) return msg ? <p className="text-ko">{msg}</p> : <Loader2 className="mx-auto mt-20 animate-spin text-kora-200" />;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setChallenge = (i: number, patch: Partial<Challenge>) => set({ challenges: form.challenges.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= form.challenges.length) return;
    const next = [...form.challenges];
    [next[i], next[j]] = [next[j], next[i]];
    set({ challenges: next });
    setOpen(j);
  };

  const save = async () => {
    const start = new Date(form.startAt);
    const end = new Date(form.endAt);
    if (!form.title.trim()) return setMsg("Le titre est obligatoire.");
    if (!(end > start)) return setMsg("La fin doit être après le début.");
    if (!form.challenges.length) return setMsg("Ajoutez au moins une épreuve.");
    const missing = form.challenges.find((c) => !c.topology || !(checks[c.id]?.length > 0));
    if (missing) return setMsg(`L'épreuve « ${missing.title} » doit avoir une topologie et au moins un critère.`);
    setBusy(true);
    try {
      const used = Object.fromEntries(form.challenges.map((c) => [c.id, checks[c.id] ?? []]));
      const hid = await saveHackathon({ ...form, title: form.title.trim(), startAt: start, endAt: end }, used, id);
      setMsg("Hackathon enregistré ✓");
      if (!id) router.replace(`/admin/hackathons/editer?id=${hid}`);
    } catch (e) {
      console.error(e);
      setMsg("Enregistrement impossible. Les règles Firestore sont-elles à jour ?");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-kora-300";
  const total = form.challenges.reduce((n, c) => n + (c.points || 0), 0);

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <Link href="/admin/hackathons" className="flex items-center gap-1.5 text-sm text-kora-300 hover:text-white">
        <ArrowLeft size={15} /> Tous les hackathons
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{id ? "Modifier le hackathon" : "Nouveau hackathon"}</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.published} onChange={(e) => set({ published: e.target.checked })} className="h-4 w-4 accent-kora-500" />
            Publié (visible des étudiants)
          </label>
          <button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-xl bg-kora-500 px-4 py-2 font-semibold text-white hover:bg-kora-400 disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
          </button>
        </div>
      </div>
      {msg && <p className="mt-4 rounded-xl bg-white/[.06] px-4 py-2.5 text-sm text-kora-200">{msg}</p>}

      <section className="mt-6 space-y-3 rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
        <h2 className="font-semibold">1. Informations</h2>
        <label className="block text-sm text-kora-200/80">
          Titre
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} className={`${input} mt-1`} placeholder="Hackathon Réseau KoraLab #1" />
        </label>
        <label className="block text-sm text-kora-200/80">
          Accroche (une phrase)
          <input value={form.summary} onChange={(e) => set({ summary: e.target.value })} className={`${input} mt-1`} placeholder="3 heures, 4 épreuves, un seul gagnant." />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-kora-200/80">
            Début
            <input type="datetime-local" value={form.startAt} onChange={(e) => set({ startAt: e.target.value })} className={`${input} mt-1`} />
          </label>
          <label className="text-sm text-kora-200/80">
            Fin
            <input type="datetime-local" value={form.endAt} onChange={(e) => set({ endAt: e.target.value })} className={`${input} mt-1`} />
          </label>
        </div>
        <label className="block text-sm text-kora-200/80">
          Présentation
          <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={5} className={`${input} mt-1`} placeholder="Thème, public visé, prix éventuels…" />
        </label>
        <label className="block text-sm text-kora-200/80">
          Règlement
          <textarea value={form.rules} onChange={(e) => set({ rules: e.target.value })} rows={7} className={`${input} mt-1`} />
        </label>
      </section>

      <section className="mt-6 rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            2. Épreuves ({form.challenges.length}) · {total} pts au total
          </h2>
          <button
            onClick={() => (set({ challenges: [...form.challenges, newChallenge(form.challenges.length + 1)] }), setOpen(form.challenges.length))}
            className="flex items-center gap-1.5 rounded-lg bg-kora-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-kora-400"
          >
            <Plus size={15} /> Ajouter une épreuve
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {form.challenges.map((c, i) => (
            <button key={c.id} onClick={() => setOpen(i)} className={`rounded-lg px-3 py-1.5 text-sm ${i === open ? "bg-kora-500 text-white" : "bg-white/[.06] text-kora-200 hover:text-white"}`}>
              {i + 1}. {c.title || "Sans titre"} · {c.points} pts
            </button>
          ))}
        </div>

        {current && (
          <div className="mt-4 space-y-3 rounded-xl bg-ink-950/60 p-4 ring-1 ring-white/8">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-sm text-kora-200/80">
                Titre de l&apos;épreuve
                <input value={current.title} onChange={(e) => setChallenge(open, { title: e.target.value })} className={`${input} mt-1`} />
              </label>
              <label className="w-28 text-sm text-kora-200/80">
                Points
                <input type="number" min={1} value={current.points} onChange={(e) => setChallenge(open, { points: Math.max(1, Number(e.target.value)) })} className={`${input} mt-1`} />
              </label>
              <div className="flex gap-1">
                <button onClick={() => move(open, -1)} title="Monter" className="rounded-lg p-2 text-kora-200 hover:bg-white/8">
                  <ArrowUp size={16} />
                </button>
                <button onClick={() => move(open, 1)} title="Descendre" className="rounded-lg p-2 text-kora-200 hover:bg-white/8">
                  <ArrowDown size={16} />
                </button>
                <button
                  onClick={async () => {
                    if (!(await askConfirm("Supprimer cette épreuve ?", { danger: true }))) return;
                    set({ challenges: form.challenges.filter((_, k) => k !== open) });
                    setOpen(Math.max(0, open - 1));
                  }}
                  title="Supprimer l'épreuve"
                  className="rounded-lg p-2 text-ko/80 hover:bg-white/8 hover:text-ko"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <label className="block text-sm text-kora-200/80">
              Énoncé (visible par les participants)
              <textarea value={current.statement} onChange={(e) => setChallenge(open, { statement: e.target.value })} rows={8} className={`${input} mt-1 font-mono`} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                defaultValue=""
                onChange={async (e) => {
                  const lab = e.target.value && (await getLab(e.target.value));
                  if (lab) (setChallenge(open, { topology: lab.data }), setMsg(`Topologie importée depuis « ${lab.name} ».`));
                  e.target.value = "";
                }}
                className={`${input} !w-auto`}
              >
                <option value="">Topologie : choisir un de mes labs…</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.devices} équipements)
                  </option>
                ))}
              </select>
              <span className={`text-sm ${devices.length ? "text-ok" : "text-amber-300"}`}>{devices.length ? `✓ ${devices.map((d) => d.hostname).join(", ")}` : "Aucune topologie"}</span>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-white">Critères de correction (secrets : jamais montrés aux participants)</p>
              <CheckEditor checks={checks[current.id] ?? []} devices={devices} onChange={(c) => setChecks({ ...checks, [current.id]: c })} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function EditHackathonPage() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}

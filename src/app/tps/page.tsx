"use client";

import { BookOpenCheck, CheckCircle2, Clock, Layers, ListChecks, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { BackButton } from "@/components/BackButton";
import { KoraLogo } from "@/components/Logo";
import { CATEGORIES, catalog } from "@/lib/catalog";
import { getProgress, listPublishedTps, type Progress } from "@/lib/tps";

/** Une carte du catalogue : TP officiel ou TP publié par un enseignant. */
type Card = { id: string; title: string; level: string; category: string; summary: string; difficulty?: string; minutes?: number; steps: number; checks: number; official: boolean };

const LEVEL_STYLE: Record<string, string> = {
  "CCNA 1": "bg-sky-100 text-sky-800 ring-sky-200",
  "CCNA 2": "bg-violet-100 text-violet-800 ring-violet-200",
  "CCNA 3": "bg-amber-100 text-amber-800 ring-amber-200",
};
const DIFF_DOTS: Record<string, number> = { Débutant: 1, Intermédiaire: 2, Avancé: 3 };
const TABS = ["Tous", "CCNA 1", "CCNA 2", "CCNA 3"] as const;

export default function TpsPage() {
  const { user } = useAuth();
  const [extra, setExtra] = useState<Card[]>([]);
  const [progress, setProgress] = useState<Progress>({});
  const [level, setLevel] = useState<(typeof TABS)[number]>("Tous");
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");

  const official: Card[] = useMemo(
    () => catalog().map((t) => ({ id: t.id, title: t.title, level: t.level, category: t.category, summary: t.summary, difficulty: t.difficulty, minutes: t.minutes, steps: t.brief.steps?.length ?? 0, checks: t.checks.length, official: true })),
    [],
  );

  useEffect(() => {
    listPublishedTps()
      .then((list) => setExtra(list.map((t) => ({ id: t.id, title: t.title, level: t.level, category: t.category || "Autres", summary: t.summary, steps: t.steps.length, checks: t.checks.length, official: false }))))
      .catch(() => setExtra([]));
  }, []);
  useEffect(() => {
    if (user)
      getProgress(user.uid)
        .then(setProgress)
        .catch(() => {});
  }, [user]);

  const all = [...official, ...extra];
  const byLevel = all.filter((t) => level === "Tous" || t.level === level);
  const needle = q.trim().toLowerCase();
  const shown = byLevel.filter((t) => (!cat || t.category === cat) && (!needle || `${t.title} ${t.summary} ${t.category}`.toLowerCase().includes(needle)));
  const cats = [...CATEGORIES, "Autres"].filter((c) => byLevel.some((t) => t.category === c));
  const done = all.filter((t) => progress[t.id]?.done).length;

  return (
    <main className="min-h-dvh bg-[#f5f5f7] text-ink-950">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/8 bg-ink-900/95 px-4 py-2.5 text-kora-50 backdrop-blur">
        <BackButton fallback="/" />
        <Link href="/" className="flex items-center gap-2 font-bold">
          <KoraLogo size={28} />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/lab" className="rounded-lg px-3 py-1.5 text-sm text-kora-200 hover:bg-white/8 hover:text-white">
            Labo libre
          </Link>
          <AccountMenu />
        </div>
      </header>

      {/* En-tête de page sombre, contenu clair */}
      <section className="bg-ink-950 text-kora-50">
        <div className="mx-auto max-w-6xl px-5 pb-10 pt-10">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-kora-300">Programme CCNA 1 · 2 · 3</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">TP guidés</h1>
          <p className="mt-2 max-w-2xl text-kora-200/80">
            {official.filter((t) => t.category !== "Dépannage").length} TP guidés et {official.filter((t) => t.category === "Dépannage").length} TP de dépannage, sur des scénarios d&apos;entreprises fictives. Chaque étape est vérifiée automatiquement sur votre réseau.
            {!user && " Connectez-vous pour garder votre progression."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="flex items-center gap-2 rounded-full bg-white/[.06] px-3 py-1.5 ring-1 ring-white/10">
              <BookOpenCheck size={15} className="text-kora-300" /> {all.length} TP
            </span>
            <span className="flex items-center gap-2 rounded-full bg-white/[.06] px-3 py-1.5 ring-1 ring-white/10">
              <Layers size={15} className="text-kora-300" /> {CATEGORIES.length} catégories
            </span>
            {user && (
              <span className="flex items-center gap-2 rounded-full bg-ok/15 px-3 py-1.5 text-ok ring-1 ring-ok/30">
                <CheckCircle2 size={15} /> {done} réussi{done > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8">
        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => (setLevel(t), setCat(""))}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${level === t ? "bg-ink-950 text-white" : "text-slate-600 hover:text-ink-950"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 focus-within:ring-kora-500 sm:max-w-xs">
            <Search size={16} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (VLAN, OSPF, NAT…)" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setCat("")} className={`rounded-full px-3 py-1 text-sm ring-1 transition ${!cat ? "bg-kora-500 text-white ring-kora-500" : "bg-white text-slate-600 ring-black/10 hover:text-ink-950"}`}>
            Toutes les catégories
          </button>
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c === cat ? "" : c)} className={`rounded-full px-3 py-1 text-sm ring-1 transition ${cat === c ? "bg-kora-500 text-white ring-kora-500" : "bg-white text-slate-600 ring-black/10 hover:text-ink-950"}`}>
              {c} <span className="opacity-60">{byLevel.filter((t) => t.category === c).length}</span>
            </button>
          ))}
        </div>

        {/* Liste par catégorie */}
        {shown.length === 0 ? (
          <p className="mt-12 text-center text-slate-500">Aucun TP ne correspond à votre recherche.</p>
        ) : (
          cats
            .filter((c) => shown.some((t) => t.category === c))
            .map((c) => (
              <div key={c} className="mt-9">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  {c}
                  <span className="text-sm font-normal text-slate-500">{shown.filter((t) => t.category === c).length} TP</span>
                </h2>
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shown
                    .filter((t) => t.category === c)
                    .map((t) => {
                      const p = progress[t.id];
                      return (
                        <li key={t.id}>
                          <Link href={`/tp?id=${t.id}`} className="group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-kora-500/40">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${LEVEL_STYLE[t.level] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>{t.level}</span>
                              {p?.done ? (
                                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                  <CheckCircle2 size={12} /> Réussi
                                </span>
                              ) : p ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                  {p.score}/{p.total}
                                </span>
                              ) : !t.official ? (
                                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                  <Sparkles size={12} /> Enseignant
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-3 font-semibold leading-snug text-ink-950 group-hover:text-kora-500">{t.title}</p>
                            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{t.summary}</p>
                            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                              {t.minutes && (
                                <span className="flex items-center gap-1">
                                  <Clock size={13} /> {t.minutes} min
                                </span>
                              )}
                              {t.steps > 0 && (
                                <span className="flex items-center gap-1">
                                  <ListChecks size={13} /> {t.steps} étapes · {t.checks} critères
                                </span>
                              )}
                              {t.difficulty && (
                                <span className="ml-auto flex items-center gap-1.5" title={t.difficulty}>
                                  {[1, 2, 3].map((k) => (
                                    <span key={k} className={`h-1.5 w-3 rounded-full ${k <= DIFF_DOTS[t.difficulty!] ? "bg-kora-500" : "bg-slate-200"}`} />
                                  ))}
                                  {t.difficulty}
                                </span>
                              )}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))
        )}
      </section>
    </main>
  );
}

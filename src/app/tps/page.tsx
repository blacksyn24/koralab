"use client";

import { BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { LEVELS, getProgress, listPublishedTps, type Progress, type Tp } from "@/lib/tps";

export default function TpsPage() {
  const { user } = useAuth();
  const [tps, setTps] = useState<Tp[] | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [error, setError] = useState("");

  useEffect(() => {
    listPublishedTps()
      .then(setTps)
      .catch((e) => (console.error(e), setError("Impossible de charger les TP pour le moment."), setTps([])));
  }, []);
  useEffect(() => {
    if (user) getProgress(user.uid).then(setProgress).catch(() => {});
  }, [user]);

  const levels = [...LEVELS].filter((l) => tps?.some((t) => t.level === l));

  return (
    <main className="min-h-dvh">
      <header className="flex items-center gap-3 border-b border-white/8 bg-ink-900/80 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-kora-300 to-kora-500 text-sm">K</span>
          KoraLab
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/lab" className="rounded-lg px-3 py-1.5 text-sm text-kora-200 hover:bg-white/8 hover:text-white">
            Labo libre
          </Link>
          <AccountMenu />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold">TP guidés</h1>
        <p className="mt-1 text-kora-200/70">
          Un scénario, une topologie prête, et une vérification automatique de votre configuration.
          {!user && " Connectez-vous pour garder votre progression."}
        </p>
        <Link href="/tp?id=demo" className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-kora-500/30 to-transparent p-5 ring-1 ring-kora-300/30 hover:ring-kora-300/60">
          <span>
            <span className="block font-semibold text-white">Essayer le TP de démonstration</span>
            <span className="block text-sm text-kora-200/70">Kora Logistique : nommer le routeur, configurer les interfaces, faire communiquer deux LAN.</span>
          </span>
          <span className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-950">Commencer</span>
        </Link>
        {error && <p className="mt-6 rounded-xl bg-ko/10 px-4 py-3 text-sm text-ko">{error}</p>}

        {tps === null ? (
          <Loader2 className="mx-auto mt-16 animate-spin text-kora-200" />
        ) : !tps.length ? (
          <div className="mt-10 rounded-2xl bg-white/[.04] p-10 text-center ring-1 ring-white/8">
            <BookOpen className="mx-auto text-kora-300" size={32} />
            <p className="mt-3 font-semibold">Les premiers TP arrivent bientôt</p>
            <p className="mt-1 text-sm text-kora-200/70">En attendant, essayez le TP de démonstration ou entraînez-vous dans le labo libre.</p>
          </div>
        ) : (
          levels.map((level) => (
            <div key={level} className="mt-8">
              <h2 className="mb-3 font-mono text-sm uppercase tracking-wider text-kora-300">{level}</h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {tps
                  .filter((t) => t.level === level)
                  .map((t) => {
                    const p = progress[t.id];
                    return (
                      <li key={t.id}>
                        <Link href={`/tp?id=${t.id}`} className="flex h-full flex-col rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8 transition hover:ring-kora-300/50">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold text-white">{t.title}</p>
                            {p?.done ? (
                              <span className="flex shrink-0 items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-xs text-ok">
                                <CheckCircle2 size={13} /> Réussi
                              </span>
                            ) : p ? (
                              <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">
                                {p.score}/{p.total}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1.5 flex-1 text-sm text-kora-200/70">{t.summary}</p>
                          <p className="mt-3 text-xs text-kora-200/50">
                            {t.checks.length} critère{t.checks.length > 1 ? "s" : ""} à valider
                          </p>
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

"use client";

import { CalendarClock, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { SiteFooter } from "@/components/LegalPage";
import { STATUS_LABEL, listPublishedHackathons, statusOf, type Hackathon } from "@/lib/hackathons";

const fmt = (d: Date) => d.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function HackathonsPage() {
  const [list, setList] = useState<Hackathon[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listPublishedHackathons()
      .then(setList)
      .catch((e) => (console.error(e), setError("Impossible de charger les hackathons pour le moment."), setList([])));
  }, []);

  const groups = (["live", "upcoming", "ended"] as const).map((s) => ({ s, items: (list ?? []).filter((h) => statusOf(h) === s) }));

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-white/8 bg-ink-900/80 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-kora-300 to-kora-500 text-sm">K</span>
          KoraLab
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/tps" className="hidden rounded-lg px-3 py-1.5 text-sm text-kora-200 hover:bg-white/8 hover:text-white sm:inline">
            TP guidés
          </Link>
          <AccountMenu />
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Trophy className="text-amber-300" /> Hackathons réseau
        </h1>
        <p className="mt-1 text-kora-200/70">Des épreuves chronométrées, corrigées automatiquement, avec un classement en direct.</p>
        {error && <p className="mt-6 rounded-xl bg-ko/10 px-4 py-3 text-sm text-ko">{error}</p>}

        {list === null ? (
          <Loader2 className="mx-auto mt-16 animate-spin text-kora-200" />
        ) : !list.length ? (
          <div className="mt-10 rounded-2xl bg-white/[.04] p-10 text-center ring-1 ring-white/8">
            <CalendarClock className="mx-auto text-kora-300" size={32} />
            <p className="mt-3 font-semibold">Aucun hackathon programmé pour l&apos;instant</p>
            <p className="mt-1 text-sm text-kora-200/70">Revenez bientôt, ou entraînez-vous avec les TP guidés.</p>
          </div>
        ) : (
          groups
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.s} className="mt-8">
                <h2 className="mb-3 font-mono text-sm uppercase tracking-wider text-kora-300">{STATUS_LABEL[g.s]}</h2>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {g.items.map((h) => (
                    <li key={h.id}>
                      <Link href={`/hackathon?id=${h.id}`} className="flex h-full flex-col rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8 transition hover:ring-kora-300/50">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-lg font-semibold text-white">{h.title}</p>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${g.s === "live" ? "animate-pulse bg-ok/20 text-ok" : g.s === "upcoming" ? "bg-amber-400/15 text-amber-300" : "bg-white/8 text-kora-200/70"}`}
                          >
                            {STATUS_LABEL[g.s]}
                          </span>
                        </div>
                        <p className="mt-1.5 flex-1 text-sm text-kora-200/70">{h.summary}</p>
                        <p className="mt-3 text-xs text-kora-200/60">
                          {fmt(h.startAt)} → {fmt(h.endAt)} · {h.challenges.length} épreuve{h.challenges.length > 1 ? "s" : ""} · {h.challenges.reduce((n, c) => n + c.points, 0)} pts
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
        )}
      </section>
      <SiteFooter />
    </main>
  );
}

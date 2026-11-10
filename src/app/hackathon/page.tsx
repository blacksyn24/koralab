"use client";

import { CheckCircle2, Loader2, Lock, Play, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { Countdown } from "@/components/hackathon/Countdown";
import { Leaderboard } from "@/components/hackathon/Leaderboard";
import { STATUS_LABEL, getHackathon, join, statusOf, watchLeaderboard, type Hackathon, type Participant } from "@/lib/hackathons";

const fmt = (d: Date) => d.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function HackathonView() {
  const id = useSearchParams().get("id") ?? "";
  const { user, profile } = useAuth();
  const [h, setH] = useState<Hackathon | null>(null);
  const [board, setBoard] = useState<Participant[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!id) return setError("Aucun hackathon choisi.");
    getHackathon(id)
      .then((x) => (x ? setH(x) : setError("Ce hackathon n'existe pas.")))
      .catch(() => setError("Ce hackathon n'est pas disponible."));
  }, [id]);

  // Classement en direct (visible par les personnes connectées)
  useEffect(() => {
    if (!id || !user) return;
    return watchLeaderboard(id, setBoard, (e) => console.error("[hackathon] classement", e));
  }, [id, user]);

  const refresh = useCallback(() => tick((x) => x + 1), []);

  if (error)
    return (
      <div className="grid h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-lg font-semibold">{error}</p>
          <Link href="/hackathons" className="mt-4 inline-block rounded-lg bg-kora-500 px-4 py-2 font-semibold text-white">
            Tous les hackathons
          </Link>
        </div>
      </div>
    );
  if (!h) return <Loader2 className="mx-auto mt-32 animate-spin text-kora-200" />;

  const status = statusOf(h);
  const me = board.find((p) => p.uid === user?.uid);
  const total = h.challenges.reduce((n, c) => n + c.points, 0);

  const doJoin = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await join(h.id, user.uid, profile?.displayName || user.displayName || user.email?.split("@")[0] || "Participant", user.photoURL ?? "");
    } catch (e) {
      console.error(e);
      setError("Inscription impossible pour le moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh">
      <header className="flex items-center gap-3 border-b border-white/8 bg-ink-900/80 px-4 py-2.5">
        <Link href="/hackathons" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-kora-300 to-kora-500 text-sm">K</span>
          Hackathons
        </Link>
        <div className="ml-auto">
          <AccountMenu />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        {/* Bandeau */}
        <div className="rounded-3xl bg-[radial-gradient(700px_300px_at_0%_0%,rgb(46_93_230/.45),transparent_70%)] p-6 ring-1 ring-white/10 sm:p-8">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${status === "live" ? "bg-ok/20 text-ok" : status === "upcoming" ? "bg-amber-400/15 text-amber-300" : "bg-white/8 text-kora-200/70"}`}
          >
            {status === "live" ? "● En cours" : STATUS_LABEL[status]}
          </span>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{h.title}</h1>
          <p className="mt-2 max-w-3xl text-kora-200/80">{h.summary}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div>
              <p className="text-kora-200/60">{status === "upcoming" ? "Début dans" : status === "live" ? "Fin dans" : "Terminé le"}</p>
              {status === "ended" ? <p className="mt-1 font-semibold">{fmt(h.endAt)}</p> : <div className="mt-1"><Countdown to={status === "upcoming" ? h.startAt : h.endAt} onDone={refresh} /></div>}
            </div>
            <div className="text-kora-200/80">
              <p>Du {fmt(h.startAt)}</p>
              <p>au {fmt(h.endAt)}</p>
            </div>
            <div className="flex gap-6">
              <span className="flex items-center gap-1.5">
                <Trophy size={16} className="text-amber-300" /> {total} pts
              </span>
              <span className="flex items-center gap-1.5">
                <Users size={16} className="text-kora-300" /> {board.length} inscrit{board.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="mt-6">
            {!user ? (
              <Link href={`/connexion?next=${encodeURIComponent(`/hackathon?id=${h.id}`)}`} className="inline-block rounded-xl bg-kora-500 px-5 py-2.5 font-semibold text-white hover:bg-kora-400">
                Se connecter pour participer
              </Link>
            ) : me ? (
              <p className="flex items-center gap-2 font-semibold text-ok">
                <CheckCircle2 size={18} /> Vous êtes inscrit · votre score : {me.score} / {total} pts
              </p>
            ) : status !== "ended" ? (
              <button onClick={doJoin} disabled={busy} className="flex items-center gap-2 rounded-xl bg-kora-500 px-5 py-2.5 font-semibold text-white hover:bg-kora-400 disabled:opacity-60">
                {busy && <Loader2 size={16} className="animate-spin" />} S&apos;inscrire au hackathon
              </button>
            ) : (
              <p className="text-kora-200/70">Les inscriptions sont closes.</p>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-8">
            {/* Épreuves */}
            <section>
              <h2 className="mb-3 text-xl font-semibold">Épreuves</h2>
              <ul className="space-y-3">
                {h.challenges.map((c, i) => {
                  const best = me?.solved[c.id] ?? 0;
                  const open = status === "live" && !!me;
                  return (
                    <li key={c.id} className="flex items-center gap-4 rounded-2xl bg-white/[.04] p-4 ring-1 ring-white/8">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-kora-500/25 font-mono font-bold">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{c.title}</p>
                        <p className="text-sm text-kora-200/60">
                          {c.points} pts{me && ` · votre meilleur score : ${best} pts`}
                        </p>
                      </div>
                      {open ? (
                        <Link href={`/hackathon/defi?h=${h.id}&c=${c.id}`} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-kora-50">
                          <Play size={15} /> {best ? "Reprendre" : "Commencer"}
                        </Link>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1.5 text-sm text-kora-200/50">
                          <Lock size={14} /> {status === "upcoming" ? "Ouvre au départ" : status === "ended" ? "Fermée" : "Inscrivez-vous"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
            {h.description && (
              <section>
                <h2 className="mb-2 text-xl font-semibold">Présentation</h2>
                <div className="whitespace-pre-wrap leading-relaxed text-kora-200/85">{h.description}</div>
              </section>
            )}
            {h.rules && (
              <section>
                <h2 className="mb-2 text-xl font-semibold">Règlement</h2>
                <div className="whitespace-pre-wrap leading-relaxed text-kora-200/85">{h.rules}</div>
              </section>
            )}
          </div>

          {/* Classement */}
          <aside>
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
              <Trophy className="text-amber-300" size={20} /> Classement {status === "live" && <span className="text-xs font-normal text-ok">● en direct</span>}
            </h2>
            {user ? <Leaderboard list={board} me={user.uid} /> : <p className="rounded-xl bg-white/[.04] p-5 text-sm text-kora-200/70 ring-1 ring-white/8">Connectez-vous pour voir le classement.</p>}
          </aside>
        </div>
      </section>
    </main>
  );
}

export default function HackathonPage() {
  return (
    <Suspense>
      <HackathonView />
    </Suspense>
  );
}

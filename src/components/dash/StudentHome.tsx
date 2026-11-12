"use client";

import { Award, BookOpen, Crown, FlaskConical, Medal, Network, Play, Rocket, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardTitle, Gauge, Pill, PillLink, StatCard, WeekBars, lastWeek } from "@/components/dash/ui";
import { Countdown } from "@/components/hackathon/Countdown";
import { listPublishedHackathons, myHackathons, statusOf, STATUS_LABEL, type Hackathon, type MyHackathon } from "@/lib/hackathons";
import { listLabs, type LabMeta } from "@/lib/labs";
import { catalogAsTps } from "@/lib/catalog";
import { getProgress, listPublishedTps, type Progress, type Tp } from "@/lib/tps";

export type StudentData = { labs: LabMeta[]; tps: Tp[]; progress: Progress; hks: Hackathon[]; mine: MyHackathon[] };

/** Niveaux de l'étudiant, selon son expérience (XP). */
const LEVELS = [
  { name: "Débutant", from: 0 },
  { name: "Apprenti", from: 40 },
  { name: "Intermédiaire", from: 120 },
  { name: "Confirmé", from: 300 },
  { name: "Expert", from: 600 },
];

export default function StudentHome({ demo }: { demo?: StudentData }) {
  const { user, profile } = useAuth();
  const [data, setData] = useState<StudentData | null>(demo ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || demo) return;
    (async () => {
      const [labs, tps, progress, hks] = await Promise.all([listLabs(user.uid), listPublishedTps().then((l) => [...catalogAsTps(), ...l]).catch(() => catalogAsTps()), getProgress(user.uid), listPublishedHackathons().catch(() => [])]);
      const mine = await myHackathons(user.uid, hks).catch(() => []);
      setData({ labs, tps, progress, hks, mine });
    })().catch((e) => {
      console.error(e);
      setError("Impossible de charger vos données pour le moment. Réessayez dans un instant.");
    });
  }, [user, demo]);

  const first = (profile?.displayName || user?.displayName || "").split(" ")[0];
  const hello = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Tableau de bord</h1>
        <p className="mt-1 text-kora-200/70">{first ? `Bonjour ${first}, ` : ""}pratiquez, progressez et relevez des défis réseau.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/lab" className="flex items-center gap-2 rounded-full bg-kora-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-kora-500/25 hover:bg-kora-400">
          + Nouveau lab
        </Link>
        <Link href="/tps" className="rounded-full px-5 py-2.5 text-sm font-semibold text-kora-50 ring-1 ring-white/20 hover:bg-white/5">
          Voir les TP
        </Link>
      </div>
    </div>
  );

  if (error)
    return (
    <div>
      {hello}
      <p className="mt-6 rounded-2xl bg-ko/10 px-4 py-3 text-sm text-ko">{error}</p>
    </div>
  );
  if (!data)
    return (
      <div>
        {hello}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      </div>
    );

  const { labs, tps, progress, hks, mine } = data;
  const done = tps.filter((t) => progress[t.id]?.done);
  const started = tps.filter((t) => progress[t.id] && !progress[t.id].done);
  const hackPoints = mine.reduce((n, m) => n + m.me.score, 0);
  const ranked = mine.filter((m) => m.me.score > 0);
  const bestRank = ranked.length ? Math.min(...ranked.map((m) => m.rank)) : null;
  const weekLabs = lastWeek(labs.map((l) => l.updatedAt));

  // Activité : labs modifiés + TP tentés, par jour
  const activity = lastWeek([...labs.map((l) => l.updatedAt), ...Object.values(progress).map((p) => p.at?.toDate() ?? null)]);
  const weekTotal = activity.reduce((n, d) => n + d.value, 0);

  // Prochain hackathon : en cours en priorité, sinon le plus proche à venir
  const live = hks.filter((h) => statusOf(h) === "live");
  const next = live[0] ?? hks.filter((h) => statusOf(h) === "upcoming").sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  const joinedNext = next && mine.some((m) => m.h.id === next.id);

  // Expérience et niveau
  const xp = done.length * 25 + started.length * 5 + Math.min(labs.length, 20) * 4 + hackPoints;
  const lvl = [...LEVELS].reverse().find((l) => xp >= l.from)!;
  const nextLvl = LEVELS[LEVELS.indexOf(lvl) + 1];
  const pct = nextLvl ? Math.round(((xp - lvl.from) / (nextLvl.from - lvl.from)) * 100) : 100;
  const nextTp = started[0] ?? tps.find((t) => !progress[t.id]);

  const badges = [
    { icon: FlaskConical, name: "Premier lab", text: "Enregistrer un lab", ok: labs.length >= 1 },
    { icon: Network, name: "Architecte", text: "5 labs enregistrés", ok: labs.length >= 5 },
    { icon: BookOpen, name: "Premier TP", text: "Réussir un TP", ok: done.length >= 1 },
    { icon: Award, name: "Studieux", text: "5 TP réussis", ok: done.length >= 5 },
    { icon: Rocket, name: "Compétiteur", text: "Participer à un hackathon", ok: mine.length >= 1 },
    { icon: Medal, name: "Podium", text: "Finir dans le top 3", ok: mine.some((m) => statusOf(m.h) === "ended" && m.rank <= 3 && m.me.score > 0) },
    { icon: Crown, name: "Champion", text: "Gagner un hackathon", ok: mine.some((m) => statusOf(m.h) === "ended" && m.rank === 1 && m.me.score > 0) },
    { icon: Sparkles, name: "Tout réussi", text: "Tous les TP réussis", ok: tps.length > 0 && done.length === tps.length },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      {hello}

      {/* Statistiques */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard highlight label="Mes labs" value={labs.length} href="/mes-labs" hint={`${weekLabs.reduce((n, d) => n + d.value, 0)} modifié(s) cette semaine`} />
        <StatCard label="TP réussis" value={<>{done.length}<span className="text-2xl text-kora-200/50"> / {tps.length}</span></>} href="/tps" hint={`${started.length} en cours`} />
        <StatCard label="Points hackathon" value={hackPoints} href="/hackathons" hint={`${mine.length} hackathon(s) rejoint(s)`} />
        <StatCard label="Meilleur classement" value={bestRank ? `#${bestRank}` : "—"} hint={bestRank ? "Votre meilleure place" : "Participez pour être classé"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        {/* Activité */}
        <Card className="lg:col-span-2">
          <CardTitle action={<span className="text-xs text-kora-200/60">{weekTotal} action(s) en 7 jours</span>}>Mon activité</CardTitle>
          <WeekBars data={activity} unit="action(s)" />
        </Card>

        {/* Prochain hackathon */}
        <Card className="flex flex-col">
          <CardTitle>{next && statusOf(next) === "live" ? "Hackathon en cours" : "Prochain hackathon"}</CardTitle>
          {next ? (
            <>
              <p className="mt-4 text-xl font-bold leading-snug text-white">{next.title}</p>
              <p className="mt-1 text-xs text-kora-200/70">
                {statusOf(next) === "live" ? "Se termine dans :" : "Commence dans :"}
              </p>
              <div className="mt-2 scale-90 origin-left">
                <Countdown to={statusOf(next) === "live" ? next.endAt : next.startAt} />
              </div>
              <Link href={`/hackathon?id=${next.id}`} className="mt-auto flex items-center justify-center gap-2 rounded-full bg-kora-500 py-2.5 text-sm font-semibold text-white hover:bg-kora-400">
                <Play size={15} /> {joinedNext ? (statusOf(next) === "live" ? "Continuer" : "Voir le hackathon") : "S'inscrire"}
              </Link>
            </>
          ) : (
            <p className="mt-4 text-sm text-kora-200/70">Aucun hackathon programmé pour l&apos;instant. Vous serez prévenu ici dès qu&apos;un défi sera annoncé.</p>
          )}
        </Card>

        {/* Derniers labs */}
        <Card className="lg:row-span-2">
          <CardTitle action={<PillLink href="/lab">+ Nouveau</PillLink>}>Mes labs</CardTitle>
          <ul className="mt-4 space-y-3">
            {labs.slice(0, 7).map((l, i) => (
              <li key={l.id}>
                <Link href={`/lab?id=${l.id}`} className="group flex items-center gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${["bg-kora-500/20 text-kora-300", "bg-ok/15 text-ok", "bg-amber-400/15 text-amber-300", "bg-fuchsia-400/15 text-fuchsia-300"][i % 4]}`}>
                    <Network size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white group-hover:underline">{l.name}</span>
                    <span className="block text-[11px] text-kora-200/50">
                      {l.devices} équipement(s){l.updatedAt && ` · ${l.updatedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {!labs.length && <li className="text-sm text-kora-200/60">Aucun lab enregistré. Dans le labo, cliquez sur « Enregistrer en ligne ».</li>}
          </ul>
          {labs.length > 7 && (
            <Link href="/mes-labs" className="mt-4 block text-center text-xs text-kora-300 hover:text-white">
              Voir les {labs.length} labs →
            </Link>
          )}
        </Card>

        {/* Mes hackathons */}
        <Card>
          <CardTitle action={<PillLink href="/hackathons">Tout voir</PillLink>}>Mes hackathons</CardTitle>
          <ul className="mt-4 space-y-3">
            {mine.slice(0, 5).map((m) => {
              const st = statusOf(m.h);
              return (
                <li key={m.h.id}>
                  <Link href={`/hackathon?id=${m.h.id}`} className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400/15 text-amber-300">
                      <Trophy size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{m.h.title}</span>
                      <span className="block text-[11px] text-kora-200/50">
                        {m.me.score} pts · rang {m.rank}/{m.total}
                      </span>
                    </span>
                    <Pill tone={st === "live" ? "live" : st === "upcoming" ? "warn" : "ok"}>{STATUS_LABEL[st]}</Pill>
                  </Link>
                </li>
              );
            })}
            {!mine.length && <li className="text-sm text-kora-200/60">Vous n&apos;avez encore rejoint aucun hackathon.</li>}
          </ul>
        </Card>

        {/* Progression TP */}
        <Card>
          <CardTitle>Progression des TP</CardTitle>
          <Gauge
            caption="TP réussis"
            parts={[
              { label: "Réussis", value: done.length },
              { label: "En cours", value: started.length },
              { label: "À faire", value: Math.max(0, tps.length - done.length - started.length) },
            ]}
          />
        </Card>

        {/* Niveau */}
        <section className="relative overflow-hidden rounded-3xl bg-[#0a0a0b] p-5 ring-1 ring-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(220px_160px_at_100%_100%,rgb(0_122_255/.5),transparent),repeating-radial-gradient(circle_at_100%_100%,transparent_0_12px,rgb(77_163_255/.09)_12px_13px)]" />
          <div className="relative flex h-full flex-col">
            <p className="font-semibold text-white">Mon niveau</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-white">{lvl.name}</p>
            <p className="font-mono text-sm text-kora-200">{xp} XP</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-kora-300 to-kora-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-kora-200/60">{nextLvl ? `${nextLvl.from - xp} XP avant « ${nextLvl.name} »` : "Niveau maximum atteint !"}</p>
            {nextTp && (
              <Link href={`/tp?id=${nextTp.id}`} className="mt-auto flex items-center gap-2 pt-4 text-sm font-semibold text-white">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink-950">
                  <Play size={15} />
                </span>
                <span className="min-w-0 truncate">TP conseillé : {nextTp.title}</span>
              </Link>
            )}
          </div>
        </section>
      </div>

      {/* Badges */}
      <Card className="mt-4">
        <CardTitle action={<span className="text-xs text-kora-200/60">{badges.filter((b) => b.ok).length} / {badges.length} débloqués</span>}>Mes badges</CardTitle>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {badges.map((b) => (
            <div key={b.name} className={`rounded-2xl p-3 text-center ring-1 ${b.ok ? "bg-kora-500/10 ring-kora-300/30" : "ring-white/8 opacity-45 grayscale"}`} title={b.text}>
              <span className={`mx-auto grid h-11 w-11 place-items-center rounded-full ${b.ok ? "bg-gradient-to-br from-amber-300 to-amber-500 text-ink-950" : "hatch text-kora-200"}`}>
                <b.icon size={20} />
              </span>
              <p className="mt-2 text-xs font-semibold text-white">{b.name}</p>
              <p className="text-[10px] leading-tight text-kora-200/60">{b.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

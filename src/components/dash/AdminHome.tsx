"use client";

import { BookOpen, DatabaseBackup, Download, Loader2, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Card, CardTitle, Gauge, Pill, PillLink, StatCard, WeekBars, lastWeek } from "@/components/dash/ui";
import { Countdown } from "@/components/hackathon/Countdown";
import { listAllHackathons, statusOf, type Hackathon } from "@/lib/hackathons";
import { countLabs, exportBackup, listAllTps, listUsers, type Tp, type UserRow } from "@/lib/tps";

export type AdminData = { users: UserRow[]; labs: number; tps: Tp[]; hks: Hackathon[] };

export default function AdminHome({ demo }: { demo?: AdminData }) {
  const [users, setUsers] = useState<UserRow[] | null>(demo?.users ?? null);
  const [labs, setLabs] = useState(demo?.labs ?? 0);
  const [tps, setTps] = useState<Tp[]>(demo?.tps ?? []);
  const [hks, setHks] = useState<Hackathon[]>(demo?.hks ?? []);
  const [error, setError] = useState("");
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLastBackup(localStorage.getItem("koralab-last-backup"));
    } catch {}
    if (demo) return;
    Promise.all([listUsers(), countLabs(), listAllTps(), listAllHackathons().catch(() => [])])
      .then(([u, l, t, h]) => (setUsers(u), setLabs(l), setTps(t), setHks(h)))
      .catch((e) => {
        console.error(e);
        setError("Chargement impossible. Vérifiez que les règles Firestore sont bien publiées.");
        setUsers([]);
      });
  }, [demo]);

  /** Télécharge une copie de toutes les données (à faire régulièrement). */
  const backup = async () => {
    setBackingUp(true);
    try {
      const blob = new Blob([await exportBackup()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `koralab-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      const now = new Date().toISOString();
      setLastBackup(now);
      try {
        localStorage.setItem("koralab-last-backup", now);
      } catch {}
    } catch (e) {
      console.error(e);
      setError("Sauvegarde impossible pour le moment.");
    } finally {
      setBackingUp(false);
    }
  };

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Vue d&apos;ensemble</h1>
        <p className="mt-1 text-kora-200/70">Suivez la plateforme, gérez les étudiants, les TP et les hackathons.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/admin/hackathons/editer" className="rounded-full bg-kora-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-kora-500/25 hover:bg-kora-400">
          + Nouveau hackathon
        </Link>
        <Link href="/admin/tps/editer" className="rounded-full px-5 py-2.5 text-sm font-semibold text-kora-50 ring-1 ring-white/20 hover:bg-white/5">
          + Nouveau TP
        </Link>
      </div>
    </div>
  );

  if (!users)
    return (
      <div>
        {head}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      </div>
    );

  const week = lastWeek(users.map((u) => u.createdAt));
  const newWeek = week.reduce((n, d) => n + d.value, 0);
  const activeWeek = lastWeek(users.map((u) => u.lastLogin)).reduce((n, d) => n + d.value, 0);
  const live = hks.filter((h) => statusOf(h) === "live");
  const upcoming = hks.filter((h) => statusOf(h) === "upcoming").sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const focus = live[0] ?? upcoming[0];
  const students = users.filter((u) => u.role === "student");
  const withTp = students.filter((u) => u.tpsDone > 0).length;
  const recentOnly = students.filter((u) => u.tpsDone === 0 && (u.lastLogin?.getTime() ?? 0) > Date.now() - 30 * 86400000).length;
  const backupAge = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;

  return (
    <div className="mx-auto max-w-7xl">
      {head}
      {error && <p className="mt-4 rounded-2xl bg-ko/10 px-4 py-3 text-sm text-ko">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard highlight label="Utilisateurs" value={users.length} href="/admin/utilisateurs" hint={`+${newWeek} cette semaine`} />
        <StatCard label="Labs enregistrés" value={labs} hint={`${activeWeek} étudiant(s) actif(s) en 7 jours`} />
        <StatCard label="TP publiés" value={<>{tps.filter((t) => t.published).length}<span className="text-2xl text-kora-200/50"> / {tps.length}</span></>} href="/admin/tps" hint={`${users.reduce((n, u) => n + u.tpsDone, 0)} TP réussis au total`} />
        <StatCard label="Hackathons" value={hks.length} href="/admin/hackathons" hint={`${live.length} en cours · ${upcoming.length} à venir`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardTitle action={<span className="text-xs text-kora-200/60">7 derniers jours</span>}>Nouvelles inscriptions</CardTitle>
          <WeekBars data={week} unit="inscrit(s)" />
        </Card>

        <Card className="flex flex-col">
          <CardTitle>{focus && statusOf(focus) === "live" ? "Hackathon en cours" : "Prochain hackathon"}</CardTitle>
          {focus ? (
            <>
              <p className="mt-4 text-xl font-bold leading-snug text-white">{focus.title}</p>
              <p className="mt-1 text-xs text-kora-200/70">
                {focus.startAt.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} → {focus.endAt.toLocaleTimeString("fr-FR", { timeStyle: "short" })}
              </p>
              <div className="mt-2 origin-left scale-90">
                <Countdown to={statusOf(focus) === "live" ? focus.endAt : focus.startAt} />
              </div>
              <Link href={`/admin/hackathons/suivi?id=${focus.id}`} className="mt-auto flex items-center justify-center gap-2 rounded-full bg-kora-500 py-2.5 text-sm font-semibold text-white hover:bg-kora-400">
                <Radio size={15} /> Suivi en direct
              </Link>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm text-kora-200/70">Aucun hackathon en cours ni programmé.</p>
              <Link href="/admin/hackathons/editer" className="mt-auto rounded-full bg-kora-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-kora-400">
                Programmer un hackathon
              </Link>
            </>
          )}
        </Card>

        <Card className="lg:row-span-2">
          <CardTitle action={<PillLink href="/admin/tps/editer">+ Nouveau</PillLink>}>TP guidés</CardTitle>
          <ul className="mt-4 space-y-3">
            {tps.slice(0, 8).map((t, i) => (
              <li key={t.id}>
                <Link href={`/admin/tps/editer?id=${t.id}`} className="group flex items-center gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${["bg-kora-500/20 text-kora-300", "bg-ok/15 text-ok", "bg-amber-400/15 text-amber-300", "bg-fuchsia-400/15 text-fuchsia-300"][i % 4]}`}>
                    <BookOpen size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white group-hover:underline">{t.title}</span>
                    <span className="block text-[11px] text-kora-200/50">
                      {t.level} · {t.checks.length} critère(s)
                    </span>
                  </span>
                  <Pill tone={t.published ? "ok" : "muted"}>{t.published ? "Publié" : "Brouillon"}</Pill>
                </Link>
              </li>
            ))}
            {!tps.length && <li className="text-sm text-kora-200/60">Aucun TP. Créez le premier !</li>}
          </ul>
        </Card>

        <Card>
          <CardTitle action={<PillLink href="/admin/utilisateurs">Tout voir</PillLink>}>Derniers inscrits</CardTitle>
          <ul className="mt-4 space-y-3">
            {users.slice(0, 5).map((u) => (
              <li key={u.uid} className="flex items-center gap-3">
                <Avatar name={u.displayName || u.email || "?"} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{u.displayName || "Sans nom"}</span>
                  <span className="block truncate text-[11px] text-kora-200/50">{u.email}</span>
                </span>
                <Pill tone={u.disabled ? "ko" : u.role === "admin" ? "warn" : "ok"}>{u.disabled ? "Bloqué" : u.role === "admin" ? "Admin" : "Actif"}</Pill>
              </li>
            ))}
            {!users.length && <li className="text-sm text-kora-200/60">Aucun utilisateur pour l&apos;instant.</li>}
          </ul>
        </Card>

        <Card>
          <CardTitle>Engagement des étudiants</CardTitle>
          <Gauge
            caption="ont réussi au moins un TP"
            parts={[
              { label: "TP réussi", value: withTp },
              { label: "Actifs (30 j)", value: recentOnly },
              { label: "Inactifs", value: Math.max(0, students.length - withTp - recentOnly) },
            ]}
          />
        </Card>

        <section className="relative overflow-hidden rounded-3xl bg-[#0a0a0b] p-5 ring-1 ring-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(220px_160px_at_100%_100%,rgb(0_122_255/.5),transparent),repeating-radial-gradient(circle_at_100%_100%,transparent_0_12px,rgb(77_163_255/.09)_12px_13px)]" />
          <div className="relative flex h-full flex-col">
            <p className="flex items-center gap-2 font-semibold text-white">
              <DatabaseBackup size={17} /> Sauvegarde
            </p>
            <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-white">{backupAge === null ? "Jamais" : backupAge === 0 ? "Aujourd'hui" : `Il y a ${backupAge} j`}</p>
            <p className="mt-1 text-xs text-kora-200/70">
              {backupAge === null || backupAge > 7 ? "Pensez à télécharger une copie de vos données chaque semaine." : "Vos données sont à jour."}
            </p>
            <button onClick={backup} disabled={backingUp} className="mt-auto flex items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-semibold text-ink-950 hover:bg-kora-50 disabled:opacity-60">
              {backingUp ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Télécharger la sauvegarde
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

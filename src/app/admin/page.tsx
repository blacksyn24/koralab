"use client";

import { BookOpen, DatabaseBackup, FlaskConical, GraduationCap, Loader2, Trophy, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listAllHackathons, statusOf, type Hackathon } from "@/lib/hackathons";
import { countLabs, exportBackup, listAllTps, listUsers, type Tp, type UserRow } from "@/lib/tps";

export default function AdminHome() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [labs, setLabs] = useState(0);
  const [tps, setTps] = useState<Tp[]>([]);
  const [hks, setHks] = useState<Hackathon[]>([]);
  const [error, setError] = useState("");
  const [backingUp, setBackingUp] = useState(false);

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
    } catch (e) {
      console.error(e);
      setError("Sauvegarde impossible pour le moment.");
    } finally {
      setBackingUp(false);
    }
  };

  useEffect(() => {
    Promise.all([listUsers(), countLabs(), listAllTps(), listAllHackathons().catch(() => [])])
      .then(([u, l, t, h]) => (setUsers(u), setLabs(l), setTps(t), setHks(h)))
      .catch((e) => {
        console.error(e);
        setError("Chargement impossible. Vérifiez que les règles Firestore sont bien publiées.");
        setUsers([]);
      });
  }, []);

  if (!users) return <Loader2 className="mx-auto mt-20 animate-spin text-kora-200" />;

  const week = Date.now() - 7 * 86400000;
  const stats = [
    { icon: Users, label: "Utilisateurs", value: users.length },
    { icon: UserPlus, label: "Nouveaux cette semaine", value: users.filter((u) => (u.createdAt?.getTime() ?? 0) > week).length },
    { icon: FlaskConical, label: "Labs enregistrés", value: labs },
    { icon: BookOpen, label: "TP publiés", value: `${tps.filter((t) => t.published).length} / ${tps.length}` },
    { icon: GraduationCap, label: "TP réussis (au total)", value: users.reduce((n, u) => n + u.tpsDone, 0) },
    { icon: Trophy, label: "Hackathons (en cours / total)", value: `${hks.filter((h) => statusOf(h) === "live").length} / ${hks.length}` },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>
        <button onClick={backup} disabled={backingUp} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-kora-200 ring-1 ring-white/10 hover:text-white disabled:opacity-60" title="Télécharger une copie des comptes, labs et TP">
          {backingUp ? <Loader2 size={16} className="animate-spin" /> : <DatabaseBackup size={16} />} Sauvegarder les données
        </button>
      </div>
      {error && <p className="mt-4 rounded-xl bg-ko/10 px-4 py-3 text-sm text-ko">{error}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
            <s.icon size={20} className="text-kora-300" />
            <p className="mt-3 text-3xl font-bold">{s.value}</p>
            <p className="text-sm text-kora-200/70">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Derniers inscrits</h2>
            <Link href="/admin/utilisateurs" className="text-sm text-kora-300 hover:text-white">
              Tout voir →
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-white/8">
            {users.slice(0, 6).map((u) => (
              <li key={u.uid} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-white">{u.displayName || "Sans nom"}</span>
                  <span className="block truncate text-kora-200/60">{u.email}</span>
                </span>
                <span className="shrink-0 text-xs text-kora-200/50">{u.createdAt?.toLocaleDateString("fr-FR")}</span>
              </li>
            ))}
            {!users.length && <li className="py-3 text-sm text-kora-200/60">Aucun utilisateur pour l&apos;instant.</li>}
          </ul>
        </section>
        <section className="rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">TP guidés</h2>
            <Link href="/admin/tps/editer" className="rounded-lg bg-kora-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-kora-400">
              + Nouveau TP
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-white/8">
            {tps.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/admin/tps/editer?id=${t.id}`} className="truncate font-medium text-white hover:underline">
                  {t.title}
                </Link>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${t.published ? "bg-ok/15 text-ok" : "bg-white/8 text-kora-200/70"}`}>{t.published ? "Publié" : "Brouillon"}</span>
              </li>
            ))}
            {!tps.length && <li className="py-3 text-sm text-kora-200/60">Aucun TP. Créez le premier !</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

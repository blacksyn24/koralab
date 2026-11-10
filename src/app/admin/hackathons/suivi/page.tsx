"use client";

import { ArrowLeft, Clock, Download, Flag, Loader2, Timer, UserX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Countdown } from "@/components/hackathon/Countdown";
import { STATUS_LABEL, getHackathon, getSecrets, leaderboardCsv, removeParticipant, saveHackathon, statusOf, watchLeaderboard, type Hackathon, type Participant } from "@/lib/hackathons";
import { listUsers, type UserRow } from "@/lib/tps";
import { askConfirm } from "@/components/Dialog";

function Suivi() {
  const id = useSearchParams().get("id") ?? "";
  const [h, setH] = useState<Hackathon | null>(null);
  const [board, setBoard] = useState<Participant[]>([]);
  const [users, setUsers] = useState<Record<string, UserRow>>({});
  const [msg, setMsg] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    getHackathon(id).then(setH);
    listUsers()
      .then((u) => setUsers(Object.fromEntries(u.map((x) => [x.uid, x]))))
      .catch(() => {});
    return watchLeaderboard(id, setBoard, (e) => setMsg(`Classement indisponible : ${e.message}`));
  }, [id]);

  if (!h) return <Loader2 className="mx-auto mt-20 animate-spin text-kora-200" />;
  const status = statusOf(h);
  const total = h.challenges.reduce((n, c) => n + c.points, 0);
  const active = board.filter((p) => Object.keys(p.attempts).length > 0);
  const attempts = board.reduce((n, p) => n + Object.values(p.attempts).reduce((a, b) => a + b, 0), 0);
  const avg = active.length ? Math.round(active.reduce((n, p) => n + p.score, 0) / active.length) : 0;

  /** Change les horaires (prolonger / terminer) en gardant épreuves et critères. */
  const reschedule = async (endAt: Date, label: string) => {
    if (!(await askConfirm(label))) return;
    const checks = await getSecrets(h.id);
    const { id: hid, ...rest } = h;
    await saveHackathon({ ...rest, endAt }, checks, hid);
    setH({ ...h, endAt });
    setMsg("Horaires mis à jour ✓");
    tick((x) => x + 1);
  };

  const exportCsv = () => {
    const blob = new Blob(["﻿" + leaderboardCsv(h, board)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `classement-${h.title.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const stats = [
    { label: "Inscrits", value: board.length },
    { label: "Ont soumis", value: active.length },
    { label: "Soumissions", value: attempts },
    { label: "Score moyen", value: `${avg} / ${total}` },
  ];

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <Link href="/admin/hackathons" className="flex items-center gap-1.5 text-sm text-kora-300 hover:text-white">
        <ArrowLeft size={15} /> Tous les hackathons
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{h.title}</h1>
          <p className="text-sm text-kora-200/70">
            {STATUS_LABEL[status]} · {h.startAt.toLocaleString("fr-FR")} → {h.endAt.toLocaleString("fr-FR")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status !== "ended" && <Countdown to={status === "upcoming" ? h.startAt : h.endAt} onDone={() => tick((x) => x + 1)} />}
          <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-kora-200 ring-1 ring-white/10 hover:text-white">
            <Download size={15} /> Exporter (CSV)
          </button>
        </div>
      </div>
      {msg && <p className="mt-4 rounded-xl bg-white/[.06] px-4 py-2.5 text-sm text-kora-200">{msg}</p>}

      {status === "live" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => reschedule(new Date(h.endAt.getTime() + 15 * 60000), "Prolonger le hackathon de 15 minutes ?")} className="flex items-center gap-1.5 rounded-lg bg-white/[.06] px-3 py-2 text-sm hover:bg-white/10">
            <Timer size={15} /> +15 min
          </button>
          <button onClick={() => reschedule(new Date(h.endAt.getTime() + 60 * 60000), "Prolonger le hackathon d'une heure ?")} className="flex items-center gap-1.5 rounded-lg bg-white/[.06] px-3 py-2 text-sm hover:bg-white/10">
            <Clock size={15} /> +1 h
          </button>
          <button onClick={() => reschedule(new Date(), "Terminer le hackathon maintenant ? Plus aucune soumission ne sera acceptée.")} className="flex items-center gap-1.5 rounded-lg bg-ko/15 px-3 py-2 text-sm text-ko hover:bg-ko/25">
            <Flag size={15} /> Terminer maintenant
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white/[.04] p-4 ring-1 ring-white/8">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm text-kora-200/70">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Réussite par épreuve */}
      <h2 className="mt-8 text-lg font-semibold">Réussite par épreuve</h2>
      <div className="mt-3 space-y-2">
        {h.challenges.map((c) => {
          const full = board.filter((p) => (p.solved[c.id] ?? 0) >= c.points).length;
          const tried = board.filter((p) => p.attempts[c.id]).length;
          const pct = tried ? Math.round((full / tried) * 100) : 0;
          return (
            <div key={c.id} className="rounded-xl bg-white/[.04] p-3 ring-1 ring-white/8">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-white">
                  {c.title} · {c.points} pts
                </span>
                <span className="text-kora-200/70">
                  {full} réussite{full > 1 ? "s" : ""} complète{full > 1 ? "s" : ""} / {tried} essai{tried > 1 ? "s" : ""}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Classement détaillé */}
      <h2 className="mt-8 flex items-center gap-2 text-lg font-semibold">
        Classement {status === "live" && <span className="text-xs font-normal text-ok">● en direct</span>}
      </h2>
      <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-white/8">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-white/[.04] text-left text-xs uppercase tracking-wide text-kora-200/60">
            <tr>
              <th className="px-3 py-3">#</th>
              <th className="px-3 py-3">Participant</th>
              {h.challenges.map((c, i) => (
                <th key={c.id} className="px-3 py-3 text-center" title={c.title}>
                  É{i + 1}
                </th>
              ))}
              <th className="px-3 py-3 text-right">Score</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {board.map((p, i) => (
              <tr key={p.uid}>
                <td className="px-3 py-2.5 font-mono text-kora-200">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-white">{p.name}</p>
                  <p className="text-xs text-kora-200/60">{users[p.uid]?.email ?? ""}</p>
                </td>
                {h.challenges.map((c) => (
                  <td key={c.id} className="px-3 py-2.5 text-center font-mono">
                    <span className={(p.solved[c.id] ?? 0) >= c.points ? "text-ok" : p.solved[c.id] ? "text-amber-300" : "text-kora-200/40"}>{p.solved[c.id] ?? 0}</span>
                    <span className="block text-[10px] text-kora-200/40">{p.attempts[c.id] ?? 0} essai(s)</span>
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right font-mono font-bold text-white">{p.score}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    title="Exclure ce participant"
                    onClick={async () => {
                      if (!(await askConfirm(`Exclure ${p.name} ?`, { message: "Ce participant sera retiré du hackathon et ses scores seront supprimés.", ok: "Exclure", danger: true }))) return;
                      await removeParticipant(h.id, p.uid);
                    }}
                    className="rounded-lg p-1.5 text-ko/80 hover:bg-white/8 hover:text-ko"
                  >
                    <UserX size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!board.length && <p className="p-6 text-center text-sm text-kora-200/60">Aucun inscrit pour l&apos;instant.</p>}
      </div>
    </div>
  );
}

export default function SuiviPage() {
  return (
    <Suspense>
      <Suivi />
    </Suspense>
  );
}

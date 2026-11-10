"use client";

import { BarChart3, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STATUS_LABEL, deleteHackathon, listAllHackathons, statusOf, type Hackathon } from "@/lib/hackathons";
import { askConfirm } from "@/components/Dialog";

const fmt = (d: Date) => d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AdminHackathons() {
  const [list, setList] = useState<Hackathon[] | null>(null);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => {
    listAllHackathons()
      .then(setList)
      .catch((e) => (console.error(e), setMsg("Chargement impossible. Les règles Firestore sont-elles à jour ?"), setList([])));
  }, []);
  useEffect(refresh, [refresh]);

  if (!list) return <Loader2 className="mx-auto mt-20 animate-spin text-kora-200" />;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hackathons</h1>
          <p className="text-sm text-kora-200/70">Épreuves chronométrées, correction sur le serveur avec des critères secrets, classement en direct.</p>
        </div>
        <Link href="/admin/hackathons/editer" className="flex items-center gap-2 rounded-xl bg-kora-500 px-4 py-2.5 font-semibold text-white hover:bg-kora-400">
          <Plus size={17} /> Nouveau hackathon
        </Link>
      </div>
      {msg && <p className="mt-4 rounded-xl bg-ko/10 px-4 py-2.5 text-sm text-ko">{msg}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {list.map((h) => {
          const s = statusOf(h);
          return (
            <div key={h.id} className="rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8">
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg font-semibold text-white">{h.title}</p>
                <div className="flex shrink-0 gap-1.5">
                  {!h.published && <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-kora-200/70">Brouillon</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s === "live" ? "bg-ok/20 text-ok" : s === "upcoming" ? "bg-amber-400/15 text-amber-300" : "bg-white/8 text-kora-200/70"}`}>
                    {STATUS_LABEL[s]}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-kora-200/70">
                {fmt(h.startAt)} → {fmt(h.endAt)}
              </p>
              <p className="text-sm text-kora-200/70">
                {h.challenges.length} épreuve{h.challenges.length > 1 ? "s" : ""} · {h.challenges.reduce((n, c) => n + c.points, 0)} pts
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/admin/hackathons/suivi?id=${h.id}`} className="flex items-center gap-1.5 rounded-lg bg-kora-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-kora-400">
                  <BarChart3 size={15} /> Suivi & classement
                </Link>
                <Link href={`/admin/hackathons/editer?id=${h.id}`} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-kora-200 ring-1 ring-white/10 hover:text-white">
                  <Pencil size={15} /> Modifier
                </Link>
                <Link href={`/hackathon?id=${h.id}`} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-kora-200 ring-1 ring-white/10 hover:text-white">
                  <Eye size={15} /> Page publique
                </Link>
                <button
                  onClick={async () => {
                    if (!(await askConfirm(`Supprimer « ${h.title} » ?`, { message: "Ses épreuves, ses critères et tous les scores seront supprimés définitivement.", danger: true }))) return;
                    await deleteHackathon(h.id);
                    refresh();
                  }}
                  className="ml-auto rounded-lg p-2 text-ko/80 hover:bg-white/8 hover:text-ko"
                  title="Supprimer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!list.length && <p className="mt-6 rounded-2xl bg-white/[.04] p-10 text-center text-sm text-kora-200/60 ring-1 ring-white/8">Aucun hackathon. Créez le premier !</p>}
    </div>
  );
}

"use client";

import { Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { deleteTp, listAllTps, saveTp, type Tp } from "@/lib/tps";

export default function AdminTps() {
  const [tps, setTps] = useState<Tp[] | null>(null);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => {
    listAllTps()
      .then(setTps)
      .catch((e) => (console.error(e), setMsg("Chargement impossible."), setTps([])));
  }, []);
  useEffect(refresh, [refresh]);

  const togglePublish = async (t: Tp) => {
    const { id, updatedAt: _u, ...rest } = t;
    await saveTp({ ...rest, published: !t.published }, id);
    refresh();
  };

  if (!tps) return <Loader2 className="mx-auto mt-20 animate-spin text-kora-200" />;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">TP guidés</h1>
          <p className="text-sm text-kora-200/70">Énoncé, topologie de départ et critères de vérification automatique.</p>
        </div>
        <Link href="/admin/tps/editer" className="flex items-center gap-2 rounded-xl bg-kora-500 px-4 py-2.5 font-semibold text-white hover:bg-kora-400">
          <Plus size={17} /> Nouveau TP
        </Link>
      </div>
      {msg && <p className="mt-4 rounded-xl bg-ko/10 px-4 py-2.5 text-sm text-ko">{msg}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-white/8">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-white/[.04] text-left text-xs uppercase tracking-wide text-kora-200/60">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Titre</th>
              <th className="px-4 py-3">Niveau</th>
              <th className="px-4 py-3">Critères</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {tps.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 text-kora-200/60">{t.position}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/tps/editer?id=${t.id}`} className="font-medium text-white hover:underline">
                    {t.title}
                  </Link>
                  <p className="line-clamp-1 text-kora-200/60">{t.summary}</p>
                </td>
                <td className="px-4 py-3 text-kora-200/80">{t.level}</td>
                <td className="px-4 py-3 text-kora-200/80">{t.checks.length}</td>
                <td className="px-4 py-3">
                  <button onClick={() => togglePublish(t)} className={`rounded-full px-2.5 py-0.5 text-xs ${t.published ? "bg-ok/15 text-ok" : "bg-white/8 text-kora-200/70"}`} title="Cliquer pour changer">
                    {t.published ? "Publié" : "Brouillon"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Link href={`/tp?id=${t.id}`} title="Tester comme un étudiant" className="rounded-lg p-2 text-kora-200 hover:bg-white/8 hover:text-white">
                      <Eye size={16} />
                    </Link>
                    <Link href={`/admin/tps/editer?id=${t.id}`} title="Modifier" className="rounded-lg p-2 text-kora-200 hover:bg-white/8 hover:text-white">
                      <Pencil size={16} />
                    </Link>
                    <button
                      title="Supprimer"
                      onClick={async () => {
                        if (!confirm(`Supprimer le TP « ${t.title} » ?`)) return;
                        await deleteTp(t.id);
                        refresh();
                      }}
                      className="rounded-lg p-2 text-ko/80 hover:bg-white/8 hover:text-ko"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tps.length && <p className="p-8 text-center text-sm text-kora-200/60">Aucun TP pour l&apos;instant. Cliquez sur « Nouveau TP ».</p>}
      </div>
    </div>
  );
}

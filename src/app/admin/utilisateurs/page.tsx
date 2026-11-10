"use client";

import { Ban, CheckCircle2, Loader2, ShieldCheck, Trash2, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { deleteUserData, listUsers, updateUser, type UserRow } from "@/lib/tps";
import { askConfirm } from "@/components/Dialog";

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "admin" | "disabled">("all");
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => {
    listUsers()
      .then(setUsers)
      .catch((e) => (console.error(e), setMsg("Chargement impossible."), setUsers([])));
  }, []);
  useEffect(refresh, [refresh]);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      refresh();
    } catch (e) {
      console.error(e);
      setMsg("Action impossible (droits insuffisants ?).");
    }
  };

  if (!users) return <Loader2 className="mx-auto mt-20 animate-spin text-kora-200" />;

  const needle = q.trim().toLowerCase();
  const list = users.filter(
    (u) =>
      (!needle || `${u.displayName} ${u.email}`.toLowerCase().includes(needle)) &&
      (filter === "all" || (filter === "admin" && u.role === "admin") || (filter === "disabled" && u.disabled))
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Utilisateurs</h1>
          <p className="text-sm text-kora-200/70">{users.length} compte{users.length > 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom ou un email…" className="w-64 rounded-xl bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-kora-300" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-xl bg-ink-900 px-3 py-2 text-sm ring-1 ring-white/10">
            <option value="all">Tous</option>
            <option value="admin">Administrateurs</option>
            <option value="disabled">Bloqués</option>
          </select>
        </div>
      </div>
      {msg && <p className="mt-4 rounded-xl bg-white/[.06] px-4 py-2.5 text-sm text-kora-200">{msg}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-white/8">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[.04] text-left text-xs uppercase tracking-wide text-kora-200/60">
            <tr>
              <th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Inscrit le</th>
              <th className="px-4 py-3">Dernière visite</th>
              <th className="px-4 py-3">TP réussis</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {list.map((u) => {
              const self = u.uid === me?.uid;
              return (
                <tr key={u.uid} className={u.disabled ? "opacity-60" : ""}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">
                      {u.displayName || "Sans nom"} {self && <span className="text-xs text-kora-300">(vous)</span>}
                    </p>
                    <p className="text-kora-200/60">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {u.disabled ? (
                      <span className="rounded-full bg-ko/15 px-2 py-0.5 text-xs text-ko">Bloqué</span>
                    ) : u.role === "admin" ? (
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">Admin</span>
                    ) : (
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-kora-200">Étudiant</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-kora-200/80">{u.createdAt?.toLocaleDateString("fr-FR") ?? "—"}</td>
                  <td className="px-4 py-3 text-kora-200/80">{u.lastLogin?.toLocaleDateString("fr-FR") ?? "—"}</td>
                  <td className="px-4 py-3 text-kora-200/80">{u.tpsDone}</td>
                  <td className="px-4 py-3">
                    {!self && (
                      <div className="flex justify-end gap-1">
                        <IconBtn
                          title={u.role === "admin" ? "Retirer le rôle admin" : "Nommer administrateur"}
                          onClick={async () => (await askConfirm(u.role === "admin" ? `Retirer le rôle admin de ${u.email} ?` : `Nommer ${u.email} administrateur ?`)) && act(() => updateUser(u.uid, { role: u.role === "admin" ? "student" : "admin" }), "Rôle mis à jour.")}
                        >
                          {u.role === "admin" ? <User size={16} /> : <ShieldCheck size={16} />}
                        </IconBtn>
                        <IconBtn
                          title={u.disabled ? "Débloquer" : "Bloquer (ne peut plus enregistrer de labs)"}
                          onClick={() => act(() => updateUser(u.uid, { disabled: !u.disabled }), u.disabled ? "Compte débloqué." : "Compte bloqué.")}
                        >
                          {u.disabled ? <CheckCircle2 size={16} /> : <Ban size={16} />}
                        </IconBtn>
                        <IconBtn
                          title="Supprimer le profil et les labs"
                          danger
                          onClick={async () => (await askConfirm(`Supprimer ${u.email} ?`, { message: "Son profil et tous ses labs seront supprimés définitivement.", danger: true })) && act(() => deleteUserData(u.uid), "Profil et labs supprimés.")}
                        >
                          <Trash2 size={16} />
                        </IconBtn>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-sm text-kora-200/60">Aucun utilisateur ne correspond.</p>}
      </div>
      <p className="mt-3 text-xs text-kora-200/50">
        « Supprimer » efface le profil et les labs. Pour supprimer définitivement l&apos;accès, supprimez aussi le compte dans Firebase → Authentication.
      </p>
    </div>
  );
}

function IconBtn({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className={`rounded-lg p-2 hover:bg-white/8 ${danger ? "text-ko/80 hover:text-ko" : "text-kora-200 hover:text-white"}`}>
      {children}
    </button>
  );
}

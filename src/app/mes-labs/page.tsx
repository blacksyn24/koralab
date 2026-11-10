"use client";

import { FlaskConical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { Network } from "@/engine/network";
import { createLab, deleteLab, listLabs, renameLab, type LabMeta } from "@/lib/labs";

export default function MesLabsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [labs, setLabs] = useState<LabMeta[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/connexion?next=/mes-labs");
  }, [loading, user, router]);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setLabs(await listLabs(user.uid));
    } catch (e) {
      console.error(e);
      setError("Impossible de charger vos labs. Vérifiez votre connexion et réessayez.");
      setLabs([]);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!user) return;
    const name = prompt("Nom du nouveau lab :", `Lab du ${new Date().toLocaleDateString("fr-FR")}`);
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const id = await createLab(user.uid, name.trim(), JSON.stringify(new Network().toJSON()));
      router.push(`/lab?id=${id}`);
    } catch (e) {
      console.error(e);
      setError("Création impossible pour le moment.");
      setBusy(false);
    }
  };

  const rename = async (l: LabMeta) => {
    const name = prompt("Nouveau nom :", l.name);
    if (!name?.trim() || name === l.name) return;
    await renameLab(l.id, name.trim());
    refresh();
  };

  const remove = async (l: LabMeta) => {
    if (!confirm(`Supprimer définitivement « ${l.name} » ?`)) return;
    await deleteLab(l.id);
    refresh();
  };

  return (
    <main className="min-h-dvh">
      <header className="flex items-center gap-3 border-b border-white/8 bg-ink-900/80 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-kora-300 to-kora-500 text-sm">K</span>
          KoraLab
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/lab" className="rounded-lg px-3 py-1.5 text-sm text-kora-200 hover:bg-white/8 hover:text-white">
            Labo
          </Link>
          <AccountMenu />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Mes labs</h1>
            <p className="mt-1 text-kora-200/70">Vos labs sont enregistrés en ligne : retrouvez-les sur n&apos;importe quel ordinateur.</p>
          </div>
          <button onClick={create} disabled={busy || !user} className="flex items-center gap-2 rounded-xl bg-kora-500 px-4 py-2.5 font-semibold text-white hover:bg-kora-400 disabled:opacity-60">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} Nouveau lab
          </button>
        </div>

        {error && <p className="mt-6 rounded-xl bg-ko/10 px-4 py-3 text-sm text-ko">{error}</p>}

        {labs === null ? (
          <div className="mt-16 grid place-items-center text-kora-200/60">
            <Loader2 className="animate-spin" />
          </div>
        ) : labs.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white/[.04] p-10 text-center ring-1 ring-white/8">
            <FlaskConical className="mx-auto text-kora-300" size={32} />
            <p className="mt-3 font-semibold">Aucun lab pour l&apos;instant</p>
            <p className="mt-1 text-sm text-kora-200/70">Créez un lab, ou ouvrez le labo et cliquez sur « Enregistrer en ligne ».</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {labs.map((l) => (
              <li key={l.id} className="flex flex-col rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/8 transition hover:ring-kora-300/50">
                <Link href={`/lab?id=${l.id}`} className="font-semibold text-white hover:underline">
                  {l.name}
                </Link>
                <p className="mt-1 text-sm text-kora-200/60">
                  {l.devices} équipement{l.devices > 1 ? "s" : ""}
                  {l.updatedAt && ` · modifié le ${l.updatedAt.toLocaleDateString("fr-FR")} à ${l.updatedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Link href={`/lab?id=${l.id}`} className="flex-1 rounded-lg bg-kora-500 py-2 text-center text-sm font-semibold text-white hover:bg-kora-400">
                    Ouvrir
                  </Link>
                  <button onClick={() => rename(l)} title="Renommer" className="rounded-lg p-2 text-kora-200 hover:bg-white/8 hover:text-white">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => remove(l)} title="Supprimer" className="rounded-lg p-2 text-ko/80 hover:bg-white/8 hover:text-ko">
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

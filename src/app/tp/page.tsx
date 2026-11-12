"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Lab, type TpMode } from "@/components/lab/Lab";
import type { Check } from "@/engine/checks";
import { catalogTp } from "@/lib/catalog";
import { getTp, recordProgress } from "@/lib/tps";

function TpLoader() {
  const id = useSearchParams().get("id");
  const { user } = useAuth();
  const [tp, setTp] = useState<Omit<TpMode, "onResult"> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return setError("Aucun TP choisi.");
    // L'ancien TP de démonstration a été retiré : on ouvre le premier TP du catalogue
    const builtin = catalogTp(id === "demo" ? "ccna1-01-configuration-de-base" : id);
    if (builtin) return setTp({ id: builtin.id, title: builtin.title, statement: builtin.statement, checks: builtin.checks, initial: builtin.topology, brief: builtin.brief });
    getTp(id)
      .then((t) => {
        if (!t || !t.topology) return setError("Ce TP n'existe pas ou n'est pas encore publié.");
        setTp({ id: t.id, title: t.title, statement: t.statement, checks: t.checks, initial: t.topology, brief: { image: t.image, context: t.context, objectives: t.objectives, addressing: t.addressing, tips: t.tips, steps: t.steps, commands: t.commands } });
      })
      .catch(() => setError("Ce TP n'est pas disponible."));
  }, [id]);

  if (error)
    return (
      <div className="grid h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-lg font-semibold">{error}</p>
          <Link href="/tps" className="mt-4 inline-block rounded-lg bg-kora-500 px-4 py-2 font-semibold text-white">
            Voir les TP
          </Link>
        </div>
      </div>
    );
  if (!tp) return <div className="grid h-dvh place-items-center text-kora-200">Chargement du TP…</div>;
  return (
    <Lab
      key={tp.id}
      tp={{
        ...tp,
        // La progression est enregistrée dans le compte (meilleur score conservé)
        onResult: (score, total) => {
          if (user) recordProgress(user.uid, tp.id, score, total).catch((e) => console.error("[tp] progression non enregistrée", e));
        },
      }}
    />
  );
}

export default function TpPage() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-kora-200">Chargement du TP…</div>}>
      <TpLoader />
    </Suspense>
  );
}

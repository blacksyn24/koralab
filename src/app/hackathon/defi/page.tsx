"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Lab, type TpMode } from "@/components/lab/Lab";
import { auth } from "@/lib/firebase";
import { getHackathon, getParticipant, statusOf } from "@/lib/hackathons";

/** Une épreuve de hackathon : le labo en mode « soumission au serveur ». */
function Defi() {
  const params = useSearchParams();
  const hid = params.get("h") ?? "";
  const cid = params.get("c") ?? "";
  const { user, loading } = useAuth();
  const [tp, setTp] = useState<TpMode | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) return setError("Connectez-vous pour participer.");
    (async () => {
      const [h, me] = await Promise.all([getHackathon(hid), getParticipant(hid, user.uid)]);
      if (!h) return setError("Hackathon introuvable.");
      if (!me) return setError("Inscrivez-vous d'abord au hackathon.");
      if (statusOf(h) !== "live") return setError(statusOf(h) === "upcoming" ? "Le hackathon n'a pas encore commencé." : "Le hackathon est terminé.");
      const c = h.challenges.find((x) => x.id === cid);
      if (!c) return setError("Épreuve introuvable.");
      setTp({
        id: `hk-${hid}-${cid}`,
        title: `${h.title} · ${c.title} (${c.points} pts)`,
        statement: c.statement,
        checks: [],
        initial: c.topology,
        backHref: `/hackathon?id=${hid}`,
        remote: async (lab) => {
          const token = await auth.currentUser?.getIdToken();
          const res = await fetch("/api/hackathon/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ hid, cid, lab }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Soumission impossible.");
          return {
            passed: data.passed,
            message: `Cette soumission : ${data.earned} / ${data.points} pts · meilleur score sur l'épreuve : ${data.best} pts · total : ${data.score} pts`,
          };
        },
      });
    })().catch((e) => (console.error(e), setError("Épreuve indisponible.")));
  }, [hid, cid, user, loading]);

  if (error)
    return (
      <div className="grid h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-lg font-semibold">{error}</p>
          <Link href={hid ? `/hackathon?id=${hid}` : "/hackathons"} className="mt-4 inline-block rounded-lg bg-kora-500 px-4 py-2 font-semibold text-white">
            Retour au hackathon
          </Link>
        </div>
      </div>
    );
  if (!tp) return <div className="grid h-dvh place-items-center text-kora-200">Chargement de l&apos;épreuve…</div>;
  return <Lab key={tp.id} tp={tp} />;
}

export default function DefiPage() {
  return (
    <Suspense>
      <Defi />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Lab, type CloudLab } from "@/components/lab/Lab";
import { Network } from "@/engine/network";
import { getLab, saveLab } from "@/lib/labs";

function LabLoader() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const { user, loading } = useAuth();
  const [cloud, setCloud] = useState<CloudLab | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || loading) return;
    if (!user) {
      router.replace(`/connexion?next=${encodeURIComponent(`/lab?id=${id}`)}`);
      return;
    }
    let cancelled = false;
    getLab(id)
      .then((lab) => {
        if (cancelled) return;
        if (!lab) return setError("Ce lab n'existe pas ou a été supprimé.");
        setCloud({ id, name: lab.name, initial: Network.fromJSON(JSON.parse(lab.data)), save: (json) => saveLab(id, json) });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError("Impossible d'ouvrir ce lab (il appartient peut-être à un autre compte).");
      });
    return () => {
      cancelled = true;
    };
  }, [id, user, loading, router]);

  // Sans identifiant : labo local, enregistré dans le navigateur
  if (!id) return <Lab />;
  if (error)
    return (
      <div className="grid h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-lg font-semibold">{error}</p>
          <Link href="/mes-labs" className="mt-4 inline-block rounded-lg bg-kora-500 px-4 py-2 font-semibold text-white">
            Retour à mes labs
          </Link>
        </div>
      </div>
    );
  if (!cloud) return <div className="grid h-dvh place-items-center text-kora-200">Ouverture du lab…</div>;
  return <Lab key={cloud.id} cloud={cloud} />;
}

export default function LabPage() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-kora-200">Chargement du labo…</div>}>
      <LabLoader />
    </Suspense>
  );
}

"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/** Bouton « Retour » : revient à la page précédente du site, sinon à la page indiquée. */
export function BackButton({ fallback = "/", label = "Retour", className = "" }: { fallback?: string; label?: string; className?: string }) {
  const router = useRouter();
  const back = () => {
    const fromSite = typeof document !== "undefined" && document.referrer.startsWith(location.origin);
    if (fromSite && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button
      type="button"
      onClick={back}
      title={label}
      aria-label={label}
      className={`flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-sm text-kora-200 ring-1 ring-white/10 transition hover:bg-white/8 hover:text-white ${className}`}
    >
      <ArrowLeft size={16} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

"use client";

import { BookOpen, FolderOpen, LayoutDashboard, LogIn, LogOut, ShieldCheck, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

/** Bouton de compte en haut à droite : « Se connecter » ou le menu de l'utilisateur. */
export function AccountMenu() {
  const { user, profile, loading, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (loading) return <span className="h-8 w-8 animate-pulse rounded-full bg-white/10" />;
  if (!user)
    return (
      <Link href={`/connexion?next=${encodeURIComponent(typeof window !== "undefined" ? location.pathname + location.search : "/lab")}`} className="flex items-center gap-1.5 rounded-lg bg-kora-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-kora-400">
        <LogIn size={15} /> Se connecter
      </Link>
    );

  const name = profile?.displayName || user.displayName || user.email || "Mon compte";
  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-0.5 pr-2 text-sm hover:bg-white/8" aria-label="Mon compte">
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-kora-500 font-semibold">{initial}</span>
        )}
        <span className="hidden max-w-[10rem] truncate lg:inline">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl bg-ink-800 text-sm shadow-2xl ring-1 ring-white/10">
          <div className="border-b border-white/8 px-4 py-3">
            <p className="truncate font-semibold text-white">{name}</p>
            <p className="truncate text-xs text-kora-200/60">{user.email}</p>
            {isAdmin && <span className="mt-1 inline-block rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">Administrateur</span>}
          </div>
          <Link href="/tableau-de-bord" className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/8" onClick={() => setOpen(false)}>
            <LayoutDashboard size={15} /> Tableau de bord
          </Link>
          <Link href="/mes-labs" className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/8" onClick={() => setOpen(false)}>
            <FolderOpen size={15} /> Mes labs
          </Link>
          <Link href="/tps" className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/8" onClick={() => setOpen(false)}>
            <BookOpen size={15} /> TP guidés
          </Link>
          <Link href="/hackathons" className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/8" onClick={() => setOpen(false)}>
            <Trophy size={15} /> Hackathons
          </Link>
          {isAdmin && (
            <Link href="/admin" className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/8" onClick={() => setOpen(false)}>
              <ShieldCheck size={15} /> Administration
            </Link>
          )}
          <button onClick={() => (setOpen(false), signOut())} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-ko hover:bg-white/8">
            <LogOut size={15} /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

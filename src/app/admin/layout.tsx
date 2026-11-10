"use client";

import { BookOpen, LayoutDashboard, Loader2, ShieldAlert, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";

const NAV = [
  { href: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/tps", label: "TP guidés", icon: BookOpen },
  { href: "/admin/hackathons", label: "Hackathons", icon: Trophy },
];

/** Espace d'administration : réservé aux comptes dont le rôle est « admin ». */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const path = usePathname();

  if (loading)
    return (
      <div className="grid h-dvh place-items-center text-kora-200">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!user || !isAdmin)
    return (
      <div className="grid h-dvh place-items-center px-4 text-center">
        <div>
          <ShieldAlert className="mx-auto text-ko" size={36} />
          <p className="mt-3 text-lg font-semibold">Accès réservé aux administrateurs</p>
          <Link href={user ? "/mes-labs" : "/connexion?next=/admin"} className="mt-4 inline-block rounded-lg bg-kora-500 px-4 py-2 font-semibold text-white">
            {user ? "Retour à mes labs" : "Se connecter"}
          </Link>
        </div>
      </div>
    );

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/8 bg-ink-900/70 p-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-kora-300 to-kora-500 text-sm">K</span>
          KoraLab <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">ADMIN</span>
        </Link>
        <nav className="space-y-1">
          {NAV.map((n) => {
            const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${active ? "bg-kora-500 text-white" : "text-kora-200 hover:bg-white/8 hover:text-white"}`}>
                <n.icon size={17} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/lab" className="mt-auto rounded-xl px-3 py-2 text-sm text-kora-200 hover:bg-white/8 hover:text-white">
          ← Retour au labo
        </Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/8 bg-ink-900/60 px-4 py-2.5">
          <nav className="flex gap-1 md:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg p-2 text-kora-200 hover:bg-white/8" title={n.label}>
                <n.icon size={18} />
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <AccountMenu />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

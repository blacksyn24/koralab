"use client";

import { BookOpen, FlaskConical, FolderOpen, LayoutDashboard, Loader2, Settings, ShieldCheck, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashShell, PromoCard, type NavItem } from "@/components/dash/DashShell";

/** Espace personnel de l'étudiant (connexion obligatoire). */
export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/connexion?next=/tableau-de-bord");
  }, [loading, user, router]);

  if (loading || !user)
    return (
      <div className="grid h-dvh place-items-center text-kora-200">
        <Loader2 className="animate-spin" />
      </div>
    );

  const nav: NavItem[] = [
    { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
    { href: "/mes-labs", label: "Mes labs", icon: FolderOpen },
    { href: "/tps", label: "TP guidés", icon: BookOpen },
    { href: "/hackathons", label: "Hackathons", icon: Trophy },
    { href: "/lab", label: "Ouvrir le labo", icon: FlaskConical },
  ];
  const general: NavItem[] = [
    { href: "/tableau-de-bord/parametres", label: "Paramètres", icon: Settings },
    ...(isAdmin ? [{ href: "/admin", label: "Administration", icon: ShieldCheck }] : []),
  ];

  return (
    <DashShell nav={nav} general={general} promo={<PromoCard title="Nouveau lab" text="Construisez une topologie et pratiquez en direct." href="/lab" cta="Ouvrir le labo" />}>
      {children}
    </DashShell>
  );
}

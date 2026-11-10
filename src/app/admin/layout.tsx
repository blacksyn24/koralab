"use client";

import { BookOpen, FlaskConical, LayoutDashboard, Loader2, ShieldAlert, Trophy, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashShell, PromoCard, type NavItem } from "@/components/dash/DashShell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/tps", label: "TP guidés", icon: BookOpen },
  { href: "/admin/hackathons", label: "Hackathons", icon: Trophy },
];
const GENERAL: NavItem[] = [
  { href: "/tableau-de-bord", label: "Mon espace étudiant", icon: UserRound },
  { href: "/lab", label: "Ouvrir le labo", icon: FlaskConical },
];

/** Espace d'administration : réservé aux comptes dont le rôle est « admin ». */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();

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
          <Link href={user ? "/tableau-de-bord" : "/connexion?next=/admin"} className="mt-4 inline-block rounded-lg bg-kora-500 px-4 py-2 font-semibold text-white">
            {user ? "Retour à mon tableau de bord" : "Se connecter"}
          </Link>
        </div>
      </div>
    );

  return (
    <DashShell
      nav={NAV}
      general={GENERAL}
      tag="ADMIN"
      search={[
        { label: "Nouveau TP", href: "/admin/tps/editer", hint: "Créer" },
        { label: "Nouveau hackathon", href: "/admin/hackathons/editer", hint: "Créer" },
      ]}
      promo={<PromoCard title="Lancer un hackathon" text="Créez des épreuves chronométrées et suivez le classement en direct." href="/admin/hackathons/editer" cta="Nouveau hackathon" />}
    >
      {children}
    </DashShell>
  );
}

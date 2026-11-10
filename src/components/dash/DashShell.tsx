"use client";

import { Bell, LogOut, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "./ui";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string | number; exact?: boolean };
export type SearchItem = { label: string; href: string; hint?: string };

/**
 * Cadre commun des tableaux de bord : barre latérale (Menu / Général), barre du haut
 * (recherche rapide, notifications, profil) et carte d'appel en bas de la barre latérale.
 */
export function DashShell({
  nav,
  general,
  tag,
  promo,
  search = [],
  children,
}: {
  nav: NavItem[];
  general: NavItem[];
  tag?: string;
  promo?: React.ReactNode;
  search?: SearchItem[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  const { user, profile, signOut } = useAuth();
  const name = profile?.displayName || user?.displayName || user?.email || "Mon compte";
  const isActive = (n: NavItem) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/"));

  const link = (n: NavItem) => (
    <Link
      key={n.href}
      href={n.href}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive(n) ? "font-semibold text-white" : "text-kora-200/70 hover:bg-white/5 hover:text-white"}`}
    >
      {isActive(n) && <span className="absolute -left-4 top-1/2 h-7 w-1.5 -translate-y-1/2 rounded-r-full bg-kora-400" />}
      <n.icon size={18} className={isActive(n) ? "text-kora-300" : ""} />
      {n.label}
      {n.badge !== undefined && n.badge !== 0 && <span className="ml-auto rounded-md bg-kora-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{n.badge}</span>}
    </Link>
  );

  return (
    <div className="min-h-dvh bg-ink-950 p-0 sm:p-3 lg:p-4">
      <div className="flex min-h-dvh gap-3 sm:min-h-[calc(100dvh-1.5rem)] lg:min-h-[calc(100dvh-2rem)]">
        {/* Barre latérale */}
        <aside className="hidden w-60 shrink-0 flex-col rounded-3xl bg-ink-900/70 p-4 ring-1 ring-white/8 md:flex">
          <Link href="/" className="mb-8 flex items-center gap-2.5 px-2 pt-2 text-lg font-bold text-white">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-kora-300 to-kora-500 ring-4 ring-kora-500/20">K</span>
            KoraLab
            {tag && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">{tag}</span>}
          </Link>
          <p className="px-3 text-[11px] font-medium uppercase tracking-wider text-kora-200/40">Menu</p>
          <nav className="mt-2 space-y-0.5">{nav.map(link)}</nav>
          <p className="mt-8 px-3 text-[11px] font-medium uppercase tracking-wider text-kora-200/40">Général</p>
          <nav className="mt-2 space-y-0.5">
            {general.map(link)}
            <button onClick={() => signOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-kora-200/70 hover:bg-white/5 hover:text-ko">
              <LogOut size={18} /> Se déconnecter
            </button>
          </nav>
          {promo && <div className="mt-auto pt-6">{promo}</div>}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Barre du haut */}
          <header className="flex items-center gap-3 rounded-none bg-ink-900/70 px-3 py-2.5 ring-1 ring-white/8 sm:rounded-3xl sm:px-4">
            <Link href="/" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-kora-300 to-kora-500 font-bold md:hidden">
              K
            </Link>
            <QuickSearch items={[...nav, ...general].map((n) => ({ label: n.label, href: n.href })).concat(search)} />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link href="/hackathons" className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-kora-200 ring-1 ring-white/10 hover:text-white" title="Hackathons">
                <Bell size={17} />
              </Link>
              <div className="flex items-center gap-2.5 pl-1">
                <Avatar name={name} photo={user?.photoURL ?? undefined} size={40} />
                <div className="hidden min-w-0 leading-tight lg:block">
                  <p className="max-w-44 truncate text-sm font-semibold text-white">{name}</p>
                  <p className="max-w-44 truncate text-xs text-kora-200/60">{user?.email}</p>
                </div>
              </div>
            </div>
          </header>

          {/* Navigation mobile */}
          <nav className="flex gap-1 overflow-x-auto px-3 md:hidden">
            {[...nav, ...general].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${isActive(n) ? "bg-kora-500 text-white" : "bg-white/5 text-kora-200 ring-1 ring-white/10"}`}
              >
                <n.icon size={14} /> {n.label}
              </Link>
            ))}
          </nav>

          <main className="min-w-0 flex-1 rounded-none bg-ink-900/30 p-4 ring-white/8 sm:rounded-3xl sm:p-6 sm:ring-1 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

/** Recherche rapide (Ctrl+K) : retrouve une page ou un élément (lab, TP, hackathon…). */
function QuickSearch({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const results = useMemo(() => (q.trim() ? items.filter((i) => norm(i.label + " " + (i.hint ?? "")).includes(norm(q.trim()))).slice(0, 8) : []), [q, items]);

  const go = (href: string) => {
    setQ("");
    setOpen(false);
    input.current?.blur();
    router.push(href);
  };

  return (
    <div className="relative min-w-0 max-w-sm flex-1">
      <div className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2.5 ring-1 ring-white/10 focus-within:ring-kora-400">
        <Search size={16} className="shrink-0 text-kora-200/60" />
        <input
          ref={input}
          value={q}
          onChange={(e) => (setQ(e.target.value), setSel(0), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, results.length - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
            if (e.key === "Enter" && results[sel]) go(results[sel].href);
            if (e.key === "Escape") input.current?.blur();
          }}
          placeholder="Rechercher…"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-kora-200/40"
        />
        <kbd className="hidden shrink-0 rounded-md bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-kora-200/70 sm:block">Ctrl K</kbd>
      </div>
      {open && q.trim() && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl bg-ink-800 py-1 shadow-2xl ring-1 ring-white/10">
          {results.map((r, i) => (
            <button
              key={r.href + r.label}
              onMouseDown={(e) => (e.preventDefault(), go(r.href))}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${i === sel ? "bg-white/8 text-white" : "text-kora-200"}`}
            >
              <span className="truncate">{r.label}</span>
              {r.hint && <span className="shrink-0 text-xs text-kora-200/50">{r.hint}</span>}
            </button>
          ))}
          {!results.length && <p className="px-4 py-2 text-sm text-kora-200/60">Aucun résultat.</p>}
        </div>
      )}
    </div>
  );
}

/** Carte sombre en bas de la barre latérale (comme « Download our app » sur la maquette). */
export function PromoCard({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#03061a] p-4 ring-1 ring-white/10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(160px_120px_at_100%_100%,rgb(46_93_230/.55),transparent),repeating-radial-gradient(circle_at_100%_100%,transparent_0_10px,rgb(110_146_242/.10)_10px_11px)]" />
      <div className="relative">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-sm font-bold">K</span>
        <p className="mt-3 font-semibold leading-snug text-white">{title}</p>
        <p className="mt-1 text-xs text-kora-200/70">{text}</p>
        <Link href={href} className="mt-4 block rounded-full bg-kora-500 py-2 text-center text-sm font-semibold text-white hover:bg-kora-400">
          {cta}
        </Link>
      </div>
    </div>
  );
}

"use client";

import { ArrowUpRight, TrendingUp } from "lucide-react";
import Link from "next/link";

/** Briques visuelles communes aux tableaux de bord (étudiant et administrateur). */

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-3xl bg-ink-900/70 p-5 ring-1 ring-white/8 ${className}`}>{children}</section>;
}

export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold text-white">{children}</h2>
      {action}
    </div>
  );
}

/** Petit bouton arrondi « + Nouveau » / « Tout voir ». */
export function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-kora-200 ring-1 ring-white/15 hover:bg-white/8 hover:text-white">
      {children}
    </Link>
  );
}

/** Carte de statistique ; la première est mise en avant (dégradé bleu), comme sur la maquette. */
export function StatCard({ label, value, hint, href, highlight }: { label: string; value: React.ReactNode; hint?: string; href?: string; highlight?: boolean }) {
  const body = (
    <div
      className={`group relative h-full overflow-hidden rounded-3xl p-5 ring-1 transition ${
        highlight ? "bg-gradient-to-br from-kora-400 via-kora-500 to-ink-800 ring-kora-300/40 shadow-xl shadow-kora-500/20" : "bg-ink-900/70 ring-white/8 hover:ring-white/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium ${highlight ? "text-white" : "text-kora-50"}`}>{label}</p>
        {href && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 transition group-hover:rotate-45 ${highlight ? "bg-white text-kora-500 ring-white" : "text-kora-50 ring-white/30"}`}>
            <ArrowUpRight size={16} />
          </span>
        )}
      </div>
      <p className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">{value}</p>
      {hint && (
        <p className={`mt-3 flex items-center gap-1.5 text-xs ${highlight ? "text-kora-50" : "text-kora-200/70"}`}>
          <span className={`grid h-4 w-5 place-items-center rounded ring-1 ${highlight ? "ring-kora-50/60" : "ring-kora-200/40"}`}>
            <TrendingUp size={10} />
          </span>
          {hint}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Histogramme « pilules » sur 7 jours : barres pleines pour l'activité, hachurées quand il n'y a rien. */
export function WeekBars({ data, unit }: { data: { label: string; value: number; today?: boolean }[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  return (
    <div className="mt-5 flex h-48 items-end justify-between gap-2 sm:gap-3">
      {data.map((d, i) => {
        const empty = d.value === 0;
        const h = empty ? 45 : 30 + (d.value / max) * 70;
        const color = empty ? "hatch" : i === top ? "bg-ink-800 ring-1 ring-kora-300/40" : d.today ? "bg-kora-300" : "bg-kora-500";
        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="relative flex w-full max-w-14 flex-1 items-end">
              {(d.today || i === top) && !empty && (
                <span className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-950 shadow">
                  {d.value} {unit}
                </span>
              )}
              <div className={`w-full rounded-full ${color}`} style={{ height: `${h}%` }} title={`${d.value} ${unit}`} />
            </div>
            <span className={`text-xs ${d.today ? "font-semibold text-white" : "text-kora-200/60"}`}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Jauge en demi-cercle (pourcentage) avec sa légende, en trois parts : pleine, foncée, hachurée. */
export function Gauge({ parts, caption }: { parts: { label: string; value: number }[]; caption: string }) {
  const total = Math.max(1, parts.reduce((n, p) => n + p.value, 0));
  const [a, b] = parts;
  const pa = (a.value / total) * 100;
  const pb = (b.value / total) * 100;
  const arc = "M 20 110 A 90 90 0 0 1 200 110";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 125" className="mt-2 w-full max-w-64">
        <defs>
          <pattern id="gauge-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgb(175 197 248 / .08)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(175 197 248 / .35)" strokeWidth="2" />
          </pattern>
        </defs>
        <path d={arc} pathLength={100} fill="none" stroke="url(#gauge-hatch)" strokeWidth="30" />
        {pb > 0 && <path d={arc} pathLength={100} fill="none" stroke="var(--color-ink-800)" strokeWidth="30" strokeDasharray={`0 ${pa} ${pb} 100`} />}
        {pa > 0 && <path d={arc} pathLength={100} fill="none" stroke="var(--color-kora-500)" strokeWidth="30" strokeDasharray={`${pa} 100`} />}
        <text x="110" y="100" textAnchor="middle" className="fill-white text-[34px] font-bold">
          {Math.round(pa)}%
        </text>
        <text x="110" y="120" textAnchor="middle" className="fill-kora-200 text-[10px]">
          {caption}
        </text>
      </svg>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-kora-200/80">
        {parts.map((p, i) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-full ${i === 0 ? "bg-kora-500" : i === 1 ? "bg-ink-800 ring-1 ring-kora-300/40" : "hatch"}`} />
            {p.label} ({p.value})
          </span>
        ))}
      </div>
    </div>
  );
}

const TONES = {
  ok: "bg-ok/12 text-ok ring-ok/30",
  live: "bg-kora-500/15 text-kora-200 ring-kora-300/30",
  warn: "bg-amber-400/12 text-amber-300 ring-amber-300/30",
  ko: "bg-ko/12 text-ko ring-ko/30",
  muted: "bg-white/5 text-kora-200/70 ring-white/10",
};

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${TONES[tone]}`}>{children}</span>;
}

/** Avatar rond : photo ou initiale. */
export function Avatar({ name, photo, size = 36 }: { name: string; photo?: string; size?: number }) {
  if (photo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  const hue = [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: `hsl(${hue} 55% 45%)`, fontSize: size * 0.4 }}>
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** Les 7 derniers jours (lundi → dimanche relatifs à aujourd'hui) avec le nombre d'événements par jour. */
export function lastWeek(dates: (Date | null | undefined)[]) {
  const days = ["D", "L", "M", "M", "J", "V", "S"];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, k) => {
    const from = new Date(start);
    from.setDate(start.getDate() - (6 - k));
    const to = new Date(from);
    to.setDate(from.getDate() + 1);
    return {
      label: days[from.getDay()],
      today: k === 6,
      value: dates.filter((d) => d && d >= from && d < to).length,
    };
  });
}

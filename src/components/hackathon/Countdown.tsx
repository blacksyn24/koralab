"use client";

import { useEffect, useState } from "react";

/** Compte à rebours jusqu'à une date (jours, heures, minutes, secondes). */
export function Countdown({ to, onDone }: { to: Date; onDone?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, to.getTime() - now);
  useEffect(() => {
    if (left === 0) onDone?.();
  }, [left, onDone]);
  const parts = [
    [Math.floor(left / 86400000), "j"],
    [Math.floor(left / 3600000) % 24, "h"],
    [Math.floor(left / 60000) % 60, "min"],
    [Math.floor(left / 1000) % 60, "s"],
  ] as const;
  return (
    <span className="flex gap-2 font-mono">
      {parts.map(([v, u]) => (
        <span key={u} className="rounded-lg bg-ink-950 px-2.5 py-1.5 text-center ring-1 ring-white/10">
          <b className="text-lg text-white">{String(v).padStart(2, "0")}</b>
          <span className="ml-0.5 text-xs text-kora-200/70">{u}</span>
        </span>
      ))}
    </span>
  );
}

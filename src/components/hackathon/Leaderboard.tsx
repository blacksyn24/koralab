"use client";

import { Trophy } from "lucide-react";
import type { Participant } from "@/lib/hackathons";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Classement en direct d'un hackathon. */
export function Leaderboard({ list, me, max = 50 }: { list: Participant[]; me?: string; max?: number }) {
  if (!list.length)
    return (
      <p className="rounded-xl bg-white/[.04] p-6 text-center text-sm text-kora-200/60 ring-1 ring-white/8">
        <Trophy className="mx-auto mb-2 text-kora-300" /> Pas encore de participant.
      </p>
    );
  return (
    <ol className="divide-y divide-white/8 overflow-hidden rounded-xl ring-1 ring-white/8">
      {list.slice(0, max).map((p, i) => (
        <li key={p.uid} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${p.uid === me ? "bg-kora-500/15" : "bg-white/[.03]"}`}>
          <span className="w-8 shrink-0 text-center font-mono font-semibold text-kora-200">{MEDALS[i] ?? i + 1}</span>
          {p.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoURL} alt="" className="h-7 w-7 shrink-0 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-kora-500 text-xs font-semibold">{p.name[0]?.toUpperCase()}</span>
          )}
          <span className="min-w-0 flex-1 truncate font-medium text-white">
            {p.name} {p.uid === me && <span className="text-xs text-kora-300">(vous)</span>}
          </span>
          <span className="shrink-0 font-mono font-bold text-white">{p.score} pts</span>
        </li>
      ))}
    </ol>
  );
}

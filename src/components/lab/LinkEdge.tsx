"use client";

import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from "@xyflow/react";

export type LinkEdgeData = { aLabel: string; bLabel: string; aUp: boolean; bUp: boolean };

/** Câble entre deux équipements, avec le nom des ports et un voyant à chaque bout (vert = up, rouge = down). */
export function LinkEdge({ id, sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps) {
  const d = data as LinkEdgeData;
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const both = d.aUp && d.bUp;
  const at = (t: number) => ({ x: sourceX + (targetX - sourceX) * t, y: sourceY + (targetY - sourceY) * t });
  const a = at(0.34);
  const b = at(0.66);
  const label = (p: { x: number; y: number }, text: string, up: boolean) => (
    <div
      style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}
      className="pointer-events-none absolute flex items-center gap-1 rounded-md bg-ink-900/95 px-1.5 py-0.5 font-mono text-[10px] text-kora-50 ring-1 ring-white/10"
    >
      <span className={`h-2 w-2 rounded-full ${up ? "bg-ok shadow-[0_0_6px] shadow-ok" : "bg-ko"}`} />
      {text}
    </div>
  );
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: selected ? "#fbbf24" : both ? "#6e92f2" : "#475569", strokeWidth: selected ? 3 : 2.2 }} />
      <EdgeLabelRenderer>
        {label(a, d.aLabel, d.aUp)}
        {label(b, d.bLabel, d.bUp)}
      </EdgeLabelRenderer>
    </>
  );
}

"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database, Laptop, Layers, Monitor, Network as SwitchIcon, Router, Server, Smartphone, Wifi } from "lucide-react";
import type { DeviceKind } from "@/engine/network";

export type DeviceNodeData = { kind: DeviceKind; hostname: string; model: string; picked: boolean; cableMode: boolean };

const ICONS = { router: Router, switch: SwitchIcon, l3switch: Layers, pc: Monitor, ap: Wifi, wlc: Server };
const COLORS = {
  router: "from-kora-400 to-kora-500",
  switch: "from-sky-400 to-cyan-600",
  l3switch: "from-indigo-400 to-violet-600",
  pc: "from-slate-400 to-slate-600",
  ap: "from-emerald-400 to-teal-600",
  wlc: "from-fuchsia-400 to-purple-600",
};

/** Un équipement sur le canevas : icône, nom et modèle. */
export function DeviceNode({ data, selected }: NodeProps) {
  const d = data as DeviceNodeData;
  const Icon = d.model === "LAPTOP" ? Laptop : d.model === "PHONE" ? Smartphone : d.model === "SERVER" ? Database : ICONS[d.kind];
  return (
    <div className={`flex w-28 flex-col items-center gap-1.5 ${d.cableMode ? "cursor-crosshair" : "cursor-grab"}`}>
      <div
        className={`relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${d.model === "SERVER" ? "from-amber-400 to-orange-600" : COLORS[d.kind]} shadow-lg shadow-black/40 ring-2 transition ${
          d.picked ? "ring-amber-300 ring-offset-2 ring-offset-ink-950" : selected ? "ring-white" : "ring-white/10"
        }`}
      >
        <Icon size={30} strokeWidth={1.6} className="text-white" />
        <Handle type="source" position={Position.Top} isConnectable={false} />
        <Handle type="target" position={Position.Top} isConnectable={false} />
      </div>
      <div className="rounded-md bg-ink-900/90 px-2 py-0.5 text-center text-xs font-semibold leading-tight text-white">{d.hostname}</div>
      <div className="-mt-1 text-[10px] text-kora-200/60">{d.model}</div>
    </div>
  );
}

"use client";

import {
  Cable,
  ChevronDown,
  Lightbulb,
  ListChecks,
  Maximize2,
  Network as NetIcon,
  Server,
  Table2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { MODELS, Network, shortIf, type Device } from "@/engine/network";
import type { AddrRow, TpBrief } from "@/lib/tps";

/** Ports d'un équipement, avec le voisin de chaque port câblé. */
export function portMap(net: Network, dev: Device) {
  return dev.ifaces.map((i) => {
    const l = net.links.find(
      (x) =>
        (x.a.dev === dev.id && x.a.iface === i.name) ||
        (x.b.dev === dev.id && x.b.iface === i.name),
    );
    const other = l ? (l.a.dev === dev.id ? l.b : l.a) : null;
    const peer = other ? net.getDevice(other.dev) : null;
    return {
      name: i.name,
      peer: peer && other ? `${peer.hostname} ${shortIf(other.iface)}` : null,
    };
  });
}

/** Carte d'un équipement : modèle et tous ses ports (bleu = câblé). */
export function DeviceCard({
  net,
  dev,
  action,
}: {
  net: Network;
  dev: Device;
  action?: React.ReactNode;
}) {
  const ports = portMap(net, dev);
  const spec = MODELS[dev.model];
  return (
    <div className="rounded-xl bg-ink-950/60 p-3 ring-1 ring-white/8">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-white">{dev.hostname}</p>
          <p className="text-xs text-kora-200/60">
            {spec?.label ?? dev.model} · {ports.length} port
            {ports.length > 1 ? "s" : ""}
          </p>
        </div>
        {action}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {ports.map((p) => (
          <span
            key={p.name}
            title={p.peer ? `${p.name} → ${p.peer}` : `${p.name} (libre)`}
            className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] ring-1 ${p.peer ? "bg-kora-500/20 text-kora-50 ring-kora-300/40" : "text-kora-200/60 ring-white/10"}`}
          >
            {shortIf(p.name)}
            {p.peer && <span className="text-kora-200/70"> → {p.peer}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  open: start = true,
}: {
  icon: typeof X;
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  const [open, setOpen] = useState(start);
  return (
    <div className="border-b border-white/8 py-3 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-white"
      >
        <Icon size={15} className="text-kora-300" />
        <span className="flex-1">{title}</span>
        <ChevronDown
          size={15}
          className={`text-kora-200/60 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

export function AddrTable({ rows }: { rows: AddrRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-white/10">
      <table className="w-full text-left font-mono text-[11px]">
        <thead className="bg-white/[.05] text-kora-200/70">
          <tr>
            {[
              "Équipement",
              "Interface",
              "Adresse IP",
              "Masque",
              "Passerelle",
            ].map((h) => (
              <th key={h} className="px-2 py-1.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/8 text-kora-50">
              <td className="px-2 py-1.5">{r.device}</td>
              <td className="px-2 py-1.5">{r.iface}</td>
              <td className="px-2 py-1.5">{r.ip}</td>
              <td className="px-2 py-1.5">{r.mask}</td>
              <td className="px-2 py-1.5">{r.gw || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Énoncé d'un TP affiché à l'étudiant à côté du labo. */
export function TpBriefView({
  brief,
  statement,
  initial,
}: {
  brief?: Partial<TpBrief>;
  statement: string;
  initial: string;
}) {
  const [zoom, setZoom] = useState(false);
  const net = useMemo(() => {
    try {
      return Network.fromJSON(JSON.parse(initial));
    } catch {
      return null;
    }
  }, [initial]);
  const objectives = (brief?.objectives ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
  const tips = (brief?.tips ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

  return (
    <div>
      {brief?.image && (
        <>
          <button
            onClick={() => setZoom(true)}
            className="group relative mb-2 block w-full overflow-hidden rounded-xl bg-white ring-1 ring-white/10"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brief.image}
              alt="Topologie du TP"
              className="max-h-56 w-full object-contain"
            />
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-ink-900/85 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
              <Maximize2 size={12} /> Agrandir
            </span>
          </button>
          {zoom && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-6"
              onClick={() => setZoom(false)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brief.image}
                alt="Topologie du TP"
                className="max-h-full max-w-full rounded-xl bg-white"
              />
              <button
                aria-label="Fermer"
                className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <X size={20} />
              </button>
            </div>
          )}
        </>
      )}
      {brief?.context && (
        <Section icon={NetIcon} title="Contexte">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-kora-200">
            {brief.context}
          </p>
        </Section>
      )}
      {objectives.length > 0 && (
        <Section icon={ListChecks} title="Objectifs">
          <ol className="space-y-1.5 text-sm text-kora-100">
            {objectives.map((o, i) => (
              <li key={i} className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-kora-500/25 text-[11px] font-semibold text-kora-50">
                  {i + 1}
                </span>
                <span className="leading-snug">{o}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {!!brief?.addressing?.length && (
        <Section icon={Table2} title="Table d'adressage">
          <AddrTable rows={brief.addressing} />
        </Section>
      )}
      {net && net.devices.length > 0 && (
        <Section
          icon={Server}
          title={`Équipements à utiliser (${net.devices.length})`}
          open={!brief?.image && !objectives.length}
        >
          <div className="space-y-2">
            {net.devices.map((d) => (
              <DeviceCard key={d.id} net={net} dev={d} />
            ))}
          </div>
          {net.links.length === 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-200">
              <Cable size={13} /> Aucun câble posé : reliez les équipements
              comme sur le schéma.
            </p>
          )}
        </Section>
      )}
      {statement && (
        <Section
          icon={ListChecks}
          title={brief?.context || objectives.length ? "Consignes" : "Énoncé"}
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-kora-200">
            {statement}
          </div>
        </Section>
      )}
      {tips.length > 0 && (
        <Section icon={Lightbulb} title="Astuces" open={false}>
          <ul className="space-y-1 text-sm text-kora-200">
            {tips.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        </Section>
      )}
      {!statement && !brief?.context && !objectives.length && (
        <p className="text-sm text-kora-200/60">Aucun énoncé.</p>
      )}
    </div>
  );
}

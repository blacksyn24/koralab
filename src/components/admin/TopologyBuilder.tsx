"use client";

import {
  Cable,
  Laptop,
  Layers,
  Monitor,
  Network as SwitchIcon,
  Pencil,
  Plus,
  Router,
  Server,
  Smartphone,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  MODELS,
  Network,
  isWireless,
  shortIf,
  type DeviceKind,
} from "@/engine/network";
import { DeviceCard } from "@/components/tp/TpBrief";

const PALETTE: { model: string; label: string; icon: typeof Router }[] = [
  { model: "KR-4300", label: "Routeur", icon: Router },
  { model: "KS-24", label: "Switch L2 24 ports", icon: SwitchIcon },
  { model: "KS-48", label: "Switch L2 48 ports", icon: SwitchIcon },
  { model: "KX-24", label: "Switch L3 24 ports", icon: Layers },
  { model: "KX-48", label: "Switch L3 48 ports", icon: Layers },
  { model: "PC", label: "PC", icon: Monitor },
  { model: "SERVER", label: "Serveur", icon: Server },
  { model: "KW-3500", label: "Contrôleur Wi-Fi", icon: Server },
  { model: "KA-1800", label: "Point d'accès", icon: Wifi },
  { model: "LAPTOP", label: "Portable Wi-Fi", icon: Laptop },
  { model: "PHONE", label: "Téléphone", icon: Smartphone },
];

/** Rangée du canevas selon le type d'équipement (routeurs en haut, postes en bas). */
const ROW: Record<DeviceKind, number> = {
  router: 0,
  wlc: 1,
  l3switch: 1,
  switch: 2,
  ap: 3,
  pc: 4,
};

const sel =
  "rounded-lg bg-ink-900 px-2 py-1.5 text-sm outline-none ring-1 ring-white/10 focus:ring-kora-300";

/**
 * Construit la topologie de départ directement dans la page : équipements (avec tous leurs ports),
 * noms, câbles. Les identifiants restent stables, donc les critères déjà écrits restent valides.
 */
export function TopologyBuilder({
  net,
  onChange,
  onRemoved,
}: {
  net: Network;
  onChange: (net: Network) => void;
  onRemoved: (deviceId: string) => void;
}) {
  const [rename, setRename] = useState<{ id: string; value: string } | null>(
    null,
  );
  const [c, setC] = useState({ a: "", ap: "", b: "", bp: "" });
  const [err, setErr] = useState("");
  const commit = () =>
    onChange(Network.fromJSON(JSON.parse(JSON.stringify(net.toJSON()))));

  const add = (model: string) => {
    const kind = MODELS[model].kind;
    const row = ROW[kind] + (model === "SERVER" ? 0.5 : 0);
    const same = net.devices.filter(
      (d) => ROW[d.kind] + (d.model === "SERVER" ? 0.5 : 0) === row,
    ).length;
    net.addDevice(kind, 60 + same * 170, 40 + row * 150, model);
    commit();
  };

  const remove = (id: string) => {
    net.removeDevice(id);
    onRemoved(id);
    commit();
  };

  const doRename = () => {
    if (!rename) return;
    const v = rename.value.trim();
    if (!/^[\w-]{1,30}$/.test(v))
      return setErr("Nom invalide (lettres, chiffres, - et _).");
    if (net.devices.some((d) => d.id !== rename.id && d.hostname === v))
      return setErr("Ce nom est déjà pris.");
    net.getDevice(rename.id)!.hostname = v;
    setRename(null);
    setErr("");
    commit();
  };

  const used = (dev: string, port: string) =>
    net.links.some(
      (l) =>
        (l.a.dev === dev && l.a.iface === port) ||
        (l.b.dev === dev && l.b.iface === port),
    );
  const freePorts = (id: string) =>
    net
      .getDevice(id)
      ?.ifaces.filter((i) => !used(id, i.name) && i.name !== "Wireless0") ?? [];
  const wired = net.devices.filter((d) => !isWireless(d));

  const link = () => {
    if (!c.a || !c.b) return setErr("Choisissez les deux équipements.");
    const res = net.connect(c.a, c.b, c.ap || undefined, c.bp || undefined);
    if (typeof res === "string") return setErr(res);
    setC({ a: c.a, ap: "", b: "", bp: "" });
    setErr("");
    commit();
  };

  return (
    <div className="space-y-4">
      {/* Palette */}
      <div>
        <p className="mb-2 text-sm text-kora-200/80">
          Ajouter un équipement (cliquez autant de fois que nécessaire) :
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((p) => (
            <button
              key={p.model}
              onClick={() => add(p.model)}
              title={MODELS[p.model].description}
              className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2.5 py-1.5 text-sm text-kora-50 ring-1 ring-white/10 transition hover:bg-kora-500/20 hover:ring-kora-300/50"
            >
              <p.icon size={15} /> {p.label}
              <span className="text-[10px] text-kora-200/50">
                {MODELS[p.model].ports.length}p
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Équipements */}
      {net.devices.length === 0 ? (
        <p className="rounded-xl bg-white/[.03] p-4 text-center text-sm text-kora-200/60 ring-1 ring-dashed ring-white/10">
          Aucun équipement. Ajoutez-en avec les boutons ci-dessus.
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {net.devices.map((d) => (
            <DeviceCard
              key={d.id}
              net={net}
              dev={d}
              action={
                rename?.id === d.id ? (
                  <span className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={rename.value}
                      onChange={(e) =>
                        setRename({ ...rename, value: e.target.value })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter"
                          ? doRename()
                          : e.key === "Escape" && setRename(null)
                      }
                      onBlur={doRename}
                      className="w-24 rounded-md bg-ink-800 px-2 py-0.5 text-sm text-white outline-none ring-1 ring-kora-300"
                    />
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setRename({ id: d.id, value: d.hostname })}
                      title="Renommer"
                      className="rounded-md p-1 text-kora-200/60 hover:bg-white/8 hover:text-white"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => remove(d.id)}
                      title="Retirer"
                      className="rounded-md p-1 text-kora-200/60 hover:bg-white/8 hover:text-ko"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                )
              }
            />
          ))}
        </div>
      )}

      {/* Câbles */}
      {wired.length >= 2 && (
        <div className="rounded-xl bg-white/[.03] p-3 ring-1 ring-white/8">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
            <Cable size={15} /> Câbles{" "}
            {net.links.length > 0 && (
              <span className="font-normal text-kora-200/60">
                ({net.links.length})
              </span>
            )}
            <span className="ml-1 text-xs font-normal text-kora-200/50">
              facultatif : sans câble, l&apos;étudiant câble lui-même
              d&apos;après la photo
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={c.a}
              onChange={(e) => setC({ ...c, a: e.target.value, ap: "" })}
              className={sel}
            >
              <option value="">Équipement A</option>
              {wired.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hostname}
                </option>
              ))}
            </select>
            <select
              value={c.ap}
              onChange={(e) => setC({ ...c, ap: e.target.value })}
              className={sel}
              disabled={!c.a}
            >
              <option value="">port libre (auto)</option>
              {freePorts(c.a).map((i) => (
                <option key={i.name} value={i.name}>
                  {shortIf(i.name)}
                </option>
              ))}
            </select>
            <span className="text-kora-200/50">↔</span>
            <select
              value={c.b}
              onChange={(e) => setC({ ...c, b: e.target.value, bp: "" })}
              className={sel}
            >
              <option value="">Équipement B</option>
              {wired
                .filter((d) => d.id !== c.a)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname}
                  </option>
                ))}
            </select>
            <select
              value={c.bp}
              onChange={(e) => setC({ ...c, bp: e.target.value })}
              className={sel}
              disabled={!c.b}
            >
              <option value="">port libre (auto)</option>
              {freePorts(c.b).map((i) => (
                <option key={i.name} value={i.name}>
                  {shortIf(i.name)}
                </option>
              ))}
            </select>
            <button
              onClick={link}
              className="flex items-center gap-1 rounded-lg bg-kora-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-kora-400"
            >
              <Plus size={14} /> Relier
            </button>
          </div>
          {net.links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {net.links.map((l) => (
                <span
                  key={l.id}
                  className="flex items-center gap-1 rounded-md bg-ink-950/60 px-2 py-1 font-mono text-[11px] text-kora-100 ring-1 ring-white/10"
                >
                  {net.getDevice(l.a.dev)?.hostname} {shortIf(l.a.iface)} ↔{" "}
                  {net.getDevice(l.b.dev)?.hostname} {shortIf(l.b.iface)}
                  <button
                    onClick={() => (net.disconnect(l.id), commit())}
                    aria-label="Retirer le câble"
                    className="text-kora-200/50 hover:text-ko"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {err && <p className="text-sm text-ko">{err}</p>}
    </div>
  );
}

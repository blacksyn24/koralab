"use client";

import { Plus, Trash2 } from "lucide-react";
import { CHECK_TYPES, describe, type Check } from "@/engine/checks";
import { allIfaces, type Device } from "@/engine/network";

export function blankCheck(type: Check["type"], device: string): Check {
  switch (type) {
    case "hostname":
      return { type, device, value: "" };
    case "ip":
      return { type, device, iface: "", ip: "", mask: "" };
    case "up":
      return { type, device, iface: "" };
    case "gateway":
      return { type, device, value: "" };
    case "route":
      return { type, device, network: "", mask: "" };
    case "ping":
    case "noping":
      return { type, device, to: "" };
    case "vlan":
      return { type, device, vlan: 10, name: "" };
    case "access":
      return { type, device, iface: "", vlan: 10 };
    case "trunk":
      return { type, device, iface: "" };
    case "dhcp":
      return { type, device, network: "", mask: "" };
    case "tcp":
      return { type, device, to: "", port: 80, open: true };
    case "show":
      return { type, device, command: "show running-config", pattern: "", text: "" };
  }
}

const input = "rounded-xl bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-kora-300";

/** Éditeur de critères de vérification (TP et hackathons). */
export function CheckEditor({ checks, devices, onChange }: { checks: Check[]; devices: Device[]; onChange: (c: Check[]) => void }) {
  const nameOf = (id: string) => devices.find((d) => d.id === id)?.hostname ?? "?";
  const setAt = (i: number, c: Check) => onChange(checks.map((x, k) => (k === i ? c : x)));

  return (
    <div className="space-y-3">
      {checks.map((c, i) => {
        const dev = devices.find((d) => d.id === c.device);
        const ifaces = dev ? allIfaces(dev).map((x) => x.name) : [];
        return (
          <div key={i} className="space-y-2 rounded-xl bg-ink-900/70 p-3 ring-1 ring-white/8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-kora-300">#{i + 1}</span>
              <select value={c.type} onChange={(e) => setAt(i, blankCheck(e.target.value as Check["type"], c.device))} className={input}>
                {CHECK_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select value={c.device} onChange={(e) => setAt(i, { ...c, device: e.target.value } as Check)} className={input}>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname}
                  </option>
                ))}
              </select>
              {(c.type === "ip" || c.type === "up" || c.type === "access" || c.type === "trunk") && (
                <select value={c.iface} onChange={(e) => setAt(i, { ...c, iface: e.target.value })} className={input}>
                  <option value="">Interface…</option>
                  {ifaces.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              )}
              {c.type === "ip" && (
                <>
                  <input value={c.ip} onChange={(e) => setAt(i, { ...c, ip: e.target.value.trim() })} placeholder="IP" className={`${input} w-36 font-mono`} />
                  <input value={c.mask} onChange={(e) => setAt(i, { ...c, mask: e.target.value.trim() })} placeholder="Masque" className={`${input} w-40 font-mono`} />
                </>
              )}
              {(c.type === "hostname" || c.type === "gateway") && (
                <input value={c.value} onChange={(e) => setAt(i, { ...c, value: e.target.value.trim() })} placeholder={c.type === "hostname" ? "Nom attendu" : "IP de la passerelle"} className={`${input} w-44 font-mono`} />
              )}
              {(c.type === "vlan" || c.type === "access") && (
                <input type="number" value={c.vlan} onChange={(e) => setAt(i, { ...c, vlan: Number(e.target.value) })} placeholder="VLAN" className={`${input} w-24 font-mono`} />
              )}
              {c.type === "vlan" && <input value={c.name ?? ""} onChange={(e) => setAt(i, { ...c, name: e.target.value.trim() })} placeholder="Nom (facultatif)" className={`${input} w-40 font-mono`} />}
              {c.type === "show" && (
                <>
                  <input value={c.command} onChange={(e) => setAt(i, { ...c, command: e.target.value })} placeholder="show …" className={`${input} w-52 font-mono`} />
                  <input value={c.pattern} onChange={(e) => setAt(i, { ...c, pattern: e.target.value })} placeholder="Texte attendu (expression régulière)" className={`${input} w-60 font-mono`} />
                  <input value={c.text} onChange={(e) => setAt(i, { ...c, text: e.target.value })} placeholder="Ce que voit l'étudiant" className={`${input} min-w-56 flex-1`} />
                </>
              )}
              {(c.type === "route" || c.type === "dhcp") && (
                <>
                  <input value={c.network} onChange={(e) => setAt(i, { ...c, network: e.target.value.trim() })} placeholder="Réseau" className={`${input} w-36 font-mono`} />
                  <input value={c.mask} onChange={(e) => setAt(i, { ...c, mask: e.target.value.trim() })} placeholder="Masque" className={`${input} w-40 font-mono`} />
                </>
              )}
              {c.type === "tcp" && (
                <>
                  <input value={c.to} onChange={(e) => setAt(i, { ...c, to: e.target.value.trim() })} placeholder="IP du serveur" className={`${input} w-40 font-mono`} />
                  <input type="number" value={c.port} onChange={(e) => setAt(i, { ...c, port: Number(e.target.value) })} placeholder="Port" className={`${input} w-24 font-mono`} />
                  <select value={c.open ? "1" : "0"} onChange={(e) => setAt(i, { ...c, open: e.target.value === "1" })} className={input}>
                    <option value="1">autorisée</option>
                    <option value="0">bloquée</option>
                  </select>
                </>
              )}
              {(c.type === "ping" || c.type === "noping") && <input value={c.to} onChange={(e) => setAt(i, { ...c, to: e.target.value.trim() })} placeholder="IP à pinguer" className={`${input} w-40 font-mono`} />}
              <button onClick={() => onChange(checks.filter((_, k) => k !== i))} title="Supprimer le critère" className="ml-auto rounded-lg p-2 text-ko/80 hover:bg-white/8 hover:text-ko">
                <Trash2 size={15} />
              </button>
            </div>
            <p className="text-xs text-kora-200/60">→ {describe(c, nameOf)}</p>
          </div>
        );
      })}
      <button
        disabled={!devices.length}
        onClick={() => onChange([...checks, blankCheck("ping", devices[0]?.id ?? "")])}
        className="flex items-center gap-1.5 rounded-lg bg-kora-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-kora-400 disabled:opacity-40"
      >
        <Plus size={15} /> Ajouter un critère
      </button>
      {!devices.length && <p className="text-sm text-kora-200/60">Choisissez d&apos;abord une topologie pour ajouter des critères.</p>}
    </div>
  );
}

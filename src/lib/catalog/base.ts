// Catalogue officiel de TP guidés KoraLab : chaque TP est décrit en code (topologie, étapes, critères),
// et sa solution est vérifiée par les tests (src/lib/catalog/catalog.test.ts).

import type { Check } from "@/engine/checks";
import { IosCli } from "@/engine/cli/ios";
import { Network, type Device, type DeviceKind } from "@/engine/network";
import type { AddrRow, TpBrief, TpCommand, TpStep } from "@/lib/tps";

export const CATEGORIES = ["Dépannage", "Bases et adressage", "Sécurité des équipements", "IPv6", "Commutation", "Routage", "Services IP", "Haute disponibilité", "Wi-Fi", "Sécurité réseau", "Supervision"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Level = "CCNA 1" | "CCNA 2" | "CCNA 3";
export type Difficulty = "Débutant" | "Intermédiaire" | "Avancé";

export type Devs = Record<string, Device>;

export type CatalogSpec = {
  slug: string;
  title: string;
  level: Level;
  category: Category;
  difficulty: Difficulty;
  minutes: number;
  summary: string;
  context: string;
  objectives: string[];
  addressing: AddrRow[];
  tips: string[];
  commands: TpCommand[];
  build: (net: Network) => Devs;
  steps: { title: string; body: string; checks: (d: Devs) => Check[] }[];
};

export type CatalogTp = {
  id: string;
  title: string;
  level: Level;
  category: Category;
  difficulty: Difficulty;
  minutes: number;
  summary: string;
  statement: string;
  topology: string;
  checks: Check[];
  brief: Partial<TpBrief>;
  position: number;
};

/** Construit la topologie, numérote les critères et rattache chacun à son étape. */
export function compile(spec: CatalogSpec, position: number): CatalogTp {
  const net = new Network();
  const d = spec.build(net);
  const checks: Check[] = [];
  const steps: TpStep[] = spec.steps.map((s) => {
    const own = s.checks(d);
    const idx = own.map((c) => checks.push(c) - 1);
    return { title: s.title, body: s.body, checks: idx };
  });
  return {
    id: spec.slug,
    title: spec.title,
    level: spec.level,
    category: spec.category,
    difficulty: spec.difficulty,
    minutes: spec.minutes,
    summary: spec.summary,
    statement: "",
    topology: JSON.stringify(net.toJSON()),
    checks,
    position,
    brief: { context: spec.context, objectives: spec.objectives.join("\n"), addressing: spec.addressing, tips: spec.tips.join("\n"), steps, commands: spec.commands, image: "" },
  };
}

// ---------- Aides à la construction des topologies ----------

export const G = (n: string) => `GigabitEthernet${n}`;
export const F = (n: string) => `FastEthernet${n}`;

export function add(net: Network, kind: DeviceKind, x: number, y: number, name: string, model?: string): Device {
  const d = net.addDevice(kind, x, y, model);
  d.hostname = name;
  return d;
}

export function cable(net: Network, a: Device, pa: string, b: Device, pb: string) {
  const r = net.connect(a.id, b.id, pa, pb);
  if (typeof r === "string") throw new Error(`${a.hostname} ${pa} ↔ ${b.hostname} ${pb} : ${r}`);
}

/** Adresse un PC (ou un serveur) à l'avance. */
export function host(d: Device, ip: string, mask: string, gw?: string) {
  d.ifaces[0].ip = ip;
  d.ifaces[0].mask = mask;
  d.gateway = gw;
}

// ---------- Aides à l'écriture des critères ----------

export const ck = {
  hostname: (d: Device, value: string): Check => ({ type: "hostname", device: d.id, value }),
  ip: (d: Device, iface: string, ip: string, mask: string): Check => ({ type: "ip", device: d.id, iface, ip, mask }),
  up: (d: Device, iface: string): Check => ({ type: "up", device: d.id, iface }),
  gw: (d: Device, value: string): Check => ({ type: "gateway", device: d.id, value }),
  route: (d: Device, network: string, mask: string): Check => ({ type: "route", device: d.id, network, mask }),
  ping: (d: Device, to: string): Check => ({ type: "ping", device: d.id, to }),
  noping: (d: Device, to: string): Check => ({ type: "noping", device: d.id, to }),
  vlan: (d: Device, vlan: number, name?: string): Check => ({ type: "vlan", device: d.id, vlan, name }),
  access: (d: Device, iface: string, vlan: number): Check => ({ type: "access", device: d.id, iface, vlan }),
  trunk: (d: Device, iface: string): Check => ({ type: "trunk", device: d.id, iface }),
  dhcp: (d: Device, network: string, mask: string): Check => ({ type: "dhcp", device: d.id, network, mask }),
  tcp: (d: Device, to: string, port: number, open: boolean): Check => ({ type: "tcp", device: d.id, to, port, open }),
  /** Recherche une expression dans la sortie d'une commande (show… sur un équipement, ipconfig/ping sur un PC). */
  show: (d: Device, command: string, pattern: string, text: string, hint?: string): Check => ({ type: "show", device: d.id, command, pattern, text, hint }),
};

export const M24 = "255.255.255.0";
export const M30 = "255.255.255.252";

/** Configure un équipement à la construction du TP (topologie livrée déjà configurée, par exemple pour le dépannage). */
export function conf(net: Network, dev: Device, text: string) {
  const cli = new IosCli(net, dev);
  for (const line of ["enable", "configure terminal", ...text.trim().split("\n"), "end"]) {
    const l = line.trim();
    if (!l) continue;
    const out = cli.exec(l);
    if (/% (Invalid|Incomplete|Ambiguous)/.test(out)) throw new Error(`${dev.hostname} : « ${l} » refusée à la construction du TP`);
  }
}

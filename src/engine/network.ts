// Moteur réseau de KoraLab : équipements, câbles, commutation Ethernet avec VLAN (802.1Q),
// ARP, routage IPv4 (routeurs, sous-interfaces, switchs de couche 3) et ICMP.
// Tout est simulé dans le navigateur, de façon déterministe (pas de vrai temps).

import { BROADCAST_MAC, ipToInt, isIp, makeMac, maskToPrefix, networkOf, sameSubnet } from "./ip";

export type DeviceKind = "router" | "switch" | "l3switch" | "pc";

/** Mode d'un port de switch tel que configuré (switchport mode …). */
export type PortMode = "access" | "trunk" | "dynamic-auto" | "dynamic-desirable";

export type Iface = {
  name: string; // nom complet : GigabitEthernet0/0/0, FastEthernet0/1, Vlan10, GigabitEthernet0/0/0.10
  mac: string;
  ip?: string;
  mask?: string;
  adminUp: boolean;
  description: string;
  // --- Port de switch (couche 2) ---
  mode?: PortMode; // défaut : dynamic auto
  accessVlan?: number; // défaut : 1
  nativeVlan?: number; // défaut : 1
  allowed?: string; // VLAN autorisés sur le trunk : "all" (défaut), "none" ou liste « 1,10,20-30 »
  nonegotiate?: boolean; // switchport nonegotiate (pas de DTP)
  trunkEncap?: boolean; // switchport trunk encapsulation dot1q (switch de couche 3)
  routed?: boolean; // switch de couche 3 : « no switchport »
  // --- Sous-interface de routeur ---
  encap?: number; // encapsulation dot1Q <vlan>
  native?: boolean; // encapsulation dot1Q <vlan> native
};

export type Vlan = { id: number; name: string };

export type StaticRoute = { network: string; mask: string; nextHop?: string; iface?: string };

export type Device = {
  id: string;
  kind: DeviceKind;
  model: string;
  hostname: string;
  x: number;
  y: number;
  ifaces: Iface[];
  /** Interfaces VLAN (SVI) des switchs : Vlan1, Vlan10… */
  svis?: Iface[];
  /** Sous-interfaces des routeurs : GigabitEthernet0/0/0.10… */
  subifs?: Iface[];
  /** Base VLAN des switchs (le VLAN 1 existe toujours et n'y figure pas) */
  vlans?: Vlan[];
  /** Switch de couche 3 : « ip routing » activé */
  ipRouting?: boolean;
  gateway?: string; // PC : passerelle · switch : ip default-gateway
  dns?: string;
  routes: StaticRoute[];
  /** Lignes de configuration acceptées mais non simulées (affichées dans la running-config) */
  extra: string[];
  /** Configuration des lignes console / vty : { "line con 0": [" password …", " login"] } */
  lines?: Record<string, string[]>;
  /** Copie de la configuration sauvegardée (copy run start) */
  startup?: string;
};

export type Link = { id: string; a: { dev: string; iface: string }; b: { dev: string; iface: string } };

type ArpPayload = { op: "req" | "rep"; senderIp: string; senderMac: string; targetIp: string };
type IcmpType = "echo" | "reply" | "ttl-exceeded" | "unreachable";
type IpPacket = { src: string; dst: string; ttl: number; icmp: { type: IcmpType; id: number; seq: number } };
/** Trame Ethernet ; « vlan » = étiquette 802.1Q présente sur le câble (absente = trame non étiquetée). */
type Frame = ({ type: "arp"; arp: ArpPayload } | { type: "ipv4"; ip: IpPacket }) & { src: string; dst: string; vlan?: number };

export const SVI = "Vlan1";

// ---------- Modèles d'équipements ----------

type ModelSpec = { kind: DeviceKind; label: string; ports: string[]; description: string };

const range = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1));

export const MODELS: Record<string, ModelSpec> = {
  "KR-4300": { kind: "router", label: "Routeur KR-4300", ports: [0, 1, 2].map((i) => `GigabitEthernet0/0/${i}`), description: "Routeur · 3 ports Gigabit" },
  "KS-24": {
    kind: "switch",
    label: "Switch L2 KS-24",
    ports: [...range(24, (i) => `FastEthernet0/${i}`), "GigabitEthernet0/1", "GigabitEthernet0/2"],
    description: "Switch couche 2 · 24 ports Fast Ethernet + 2 uplinks Gigabit",
  },
  "KS-48": {
    kind: "switch",
    label: "Switch L2 KS-48",
    ports: [...range(48, (i) => `FastEthernet0/${i}`), "GigabitEthernet0/1", "GigabitEthernet0/2"],
    description: "Switch couche 2 · 48 ports Fast Ethernet + 2 uplinks Gigabit",
  },
  "KX-24": {
    kind: "l3switch",
    label: "Switch L3 KX-24",
    ports: [...range(24, (i) => `GigabitEthernet1/0/${i}`), ...range(4, (i) => `GigabitEthernet1/1/${i}`)],
    description: "Switch multicouche (couche 3) · 24 ports Gigabit + 4 uplinks Gigabit",
  },
  "KX-48": {
    kind: "l3switch",
    label: "Switch L3 KX-48",
    ports: [...range(48, (i) => `GigabitEthernet1/0/${i}`), ...range(4, (i) => `GigabitEthernet1/1/${i}`)],
    description: "Switch multicouche (couche 3) · 48 ports Gigabit + 4 uplinks Gigabit",
  },
  PC: { kind: "pc", label: "PC", ports: ["FastEthernet0"], description: "Ordinateur · 1 carte réseau" },
};

const DEFAULT_MODEL: Record<DeviceKind, string> = { router: "KR-4300", switch: "KS-24", l3switch: "KX-24", pc: "PC" };
const PREFIX: Record<DeviceKind, string> = { router: "R", switch: "S", l3switch: "MS", pc: "PC" };

// ---------- Outils ----------

export const isSwitchLike = (dev: Device) => dev.kind === "switch" || dev.kind === "l3switch";
export const isSvi = (name: string) => /^Vlan\d+$/.test(name);
export const isSubif = (name: string) => name.includes(".");
export const vlanOf = (sviName: string) => Number(sviName.slice(4));
export const parentOf = (subif: string) => subif.split(".")[0];

/** « 1,10,20-30 » -> ensemble de VLAN ; « all » -> null (tous). */
export function parseVlanList(list: string | undefined): Set<number> | null {
  if (!list || list === "all") return null;
  const out = new Set<number>();
  if (list === "none") return out;
  for (const part of list.split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let v = Math.min(a, b); v <= Math.max(a, b) && v <= 4094; v++) out.add(v);
  }
  return out;
}

/** Ensemble de VLAN -> « 1,10,20-30 » */
export function formatVlanList(set: Iterable<number>): string {
  const ids = [...new Set(set)].filter((v) => v >= 1 && v <= 4094).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    let j = i;
    while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++;
    parts.push(j > i ? `${ids[i]}-${ids[j]}` : `${ids[i]}`);
    i = j;
  }
  return parts.join(",");
}

/** Abréviation d'un nom d'interface : GigabitEthernet0/0/0 -> Gi0/0/0 */
export function shortIf(name: string): string {
  return name.replace(/^GigabitEthernet/, "Gi").replace(/^FastEthernet/, "Fa").replace(/^Vlan/, "Vl");
}

/** Toutes les interfaces d'un équipement (physiques, sous-interfaces, SVI). */
export function allIfaces(dev: Device): Iface[] {
  return [...dev.ifaces, ...(dev.subifs ?? []), ...(dev.svis ?? [])];
}

export function findIfaceOn(dev: Device, name: string): Iface | undefined {
  return allIfaces(dev).find((i) => i.name === name);
}

/**
 * Résout un nom tapé par l'utilisateur (g0/0/0, fa 0/1, vlan 10, g0/0/0.10…).
 * Renvoie le nom canonique, même si la SVI ou la sous-interface n'existe pas encore (elle sera créée).
 */
export function resolveIfaceName(dev: Device, raw: string): string | null {
  const s = raw.replace(/\s+/g, "").toLowerCase();
  const m = s.match(/^([a-z-]+)(\d+(?:\/\d+)*)(?:\.(\d+))?$/);
  if (!m) return null;
  const [, typed, num, sub] = m;
  if ("vlan".startsWith(typed) && typed.length >= 1 && !sub) {
    const v = Number(num);
    return isSwitchLike(dev) && !num.includes("/") && v >= 1 && v <= 4094 ? `Vlan${v}` : null;
  }
  for (const canon of ["GigabitEthernet", "FastEthernet"]) {
    if (!canon.toLowerCase().startsWith(typed)) continue;
    const name = `${canon}${num}`;
    if (!dev.ifaces.some((i) => i.name === name)) continue;
    if (sub !== undefined) return dev.kind === "router" && Number(sub) > 0 ? `${name}.${Number(sub)}` : null;
    return name;
  }
  return null;
}

/** « interface range fa0/1 - 10, g0/1 - 2 » -> liste de noms canoniques, ou null. */
export function resolveIfaceRange(dev: Device, raw: string): string[] | null {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const p = part.trim().toLowerCase().replace(/\s*-\s*/, "-");
    const m = p.match(/^([a-z]+)\s*((?:\d+\/)*)(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    const [, typed, head, from, to] = m;
    const a = Number(from);
    const b = to ? Number(to) : a;
    if (b < a) return null;
    for (let k = a; k <= b; k++) {
      const name = resolveIfaceName(dev, `${typed}${head}${k}`);
      if (!name || isSvi(name)) return null;
      out.push(name);
    }
  }
  return out.length ? out : null;
}

export class Network {
  devices: Device[] = [];
  links: Link[] = [];
  private macSeed = 1;
  private nextId = 1;
  /** Tables dynamiques (non sauvegardées) */
  private arp = new Map<string, Map<string, { mac: string; port: string }>>();
  /** Table MAC par switch : clé « vlan|mac » -> port */
  private macTables = new Map<string, Map<string, string>>();
  private inbox = new Map<string, { type: IcmpType; id: number; seq: number; from: string; ttl: number }[]>();
  private icmpId = 1;

  // ---------- Construction ----------

  addDevice(kind: DeviceKind, x = 0, y = 0, model?: string): Device {
    const spec = MODELS[model ?? ""]?.kind === kind ? MODELS[model!] : MODELS[DEFAULT_MODEL[kind]];
    const prefix = PREFIX[kind];
    let n = 1;
    while (this.devices.some((d) => d.hostname === `${prefix}${n}`)) n++;
    const dev: Device = {
      id: `d${this.nextId++}`,
      kind,
      model: model && MODELS[model]?.kind === kind ? model : DEFAULT_MODEL[kind],
      hostname: `${prefix}${n}`,
      x,
      y,
      // ports de routeur éteints par défaut, comme en vrai ; ports de switch et carte du PC actifs
      ifaces: spec.ports.map((name) => ({ name, mac: makeMac(this.macSeed++), adminUp: kind !== "router", description: "" })),
      routes: [],
      extra: [],
    };
    if (isSwitchLike(dev)) {
      dev.svis = [{ name: SVI, mac: makeMac(this.macSeed++), adminUp: false, description: "" }];
      dev.vlans = [];
    }
    if (kind === "router") dev.subifs = [];
    this.devices.push(dev);
    return dev;
  }

  removeDevice(id: string) {
    this.devices = this.devices.filter((d) => d.id !== id);
    this.links = this.links.filter((l) => l.a.dev !== id && l.b.dev !== id);
    this.clearDynamic();
  }

  getDevice(id: string) {
    return this.devices.find((d) => d.id === id);
  }

  /** Crée une SVI (interface vlan N) ou une sous-interface de routeur si besoin. */
  ensureIface(dev: Device, name: string): Iface | undefined {
    const found = findIfaceOn(dev, name);
    if (found) return found;
    if (isSvi(name) && isSwitchLike(dev)) {
      const svi: Iface = { name, mac: dev.svis?.[0]?.mac ?? makeMac(this.macSeed++), adminUp: true, description: "" };
      dev.svis = [...(dev.svis ?? []), svi].sort((a, b) => vlanOf(a.name) - vlanOf(b.name));
      return svi;
    }
    if (isSubif(name) && dev.kind === "router" && dev.ifaces.some((i) => i.name === parentOf(name))) {
      const parent = dev.ifaces.find((i) => i.name === parentOf(name))!;
      const sub: Iface = { name, mac: parent.mac, adminUp: true, description: "" };
      dev.subifs = [...(dev.subifs ?? []), sub].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
      return sub;
    }
    return undefined;
  }

  removeIface(dev: Device, name: string) {
    if (isSvi(name)) dev.svis = (dev.svis ?? []).filter((i) => i.name !== name || name === SVI);
    if (isSubif(name)) dev.subifs = (dev.subifs ?? []).filter((i) => i.name !== name);
    this.clearDynamic();
  }

  private usedPorts(dev: Device) {
    return new Set(this.links.flatMap((l) => [l.a, l.b]).filter((e) => e.dev === dev.id).map((e) => e.iface));
  }

  private freeIface(dev: Device, peerKind: DeviceKind): string | null {
    const used = this.usedPorts(dev);
    const free = dev.ifaces.filter((i) => !used.has(i.name));
    if (isSwitchLike(dev) && peerKind !== "pc") {
      // liaisons montantes (vers routeur ou switch) : d'abord les ports d'uplink
      const uplink = free.find((i) => (dev.kind === "l3switch" ? i.name.startsWith("GigabitEthernet1/1/") : i.name.startsWith("Gigabit")));
      if (uplink) return uplink.name;
    }
    return free[0]?.name ?? null;
  }

  /** Relie deux équipements sur leurs premières interfaces libres. */
  connect(aId: string, bId: string, aIface?: string, bIface?: string): Link | string {
    const a = this.getDevice(aId);
    const b = this.getDevice(bId);
    if (!a || !b) return "Équipement introuvable";
    if (a.id === b.id) return "Impossible de relier un équipement à lui-même";
    const ai = aIface ?? this.freeIface(a, b.kind);
    const bi = bIface ?? this.freeIface(b, a.kind);
    if (!ai) return `${a.hostname} n'a plus d'interface libre`;
    if (!bi) return `${b.hostname} n'a plus d'interface libre`;
    if (this.usedPorts(a).has(ai)) return `${a.hostname} ${shortIf(ai)} est déjà câblée`;
    if (this.usedPorts(b).has(bi)) return `${b.hostname} ${shortIf(bi)} est déjà câblée`;
    const link: Link = { id: `l${this.nextId++}`, a: { dev: a.id, iface: ai }, b: { dev: b.id, iface: bi } };
    this.links.push(link);
    this.clearDynamic();
    return link;
  }

  disconnect(linkId: string) {
    this.links = this.links.filter((l) => l.id !== linkId);
    this.clearDynamic();
  }

  peerOf(devId: string, iface: string): { dev: Device; iface: Iface } | null {
    const l = this.links.find((x) => (x.a.dev === devId && x.a.iface === iface) || (x.b.dev === devId && x.b.iface === iface));
    if (!l) return null;
    const end = l.a.dev === devId && l.a.iface === iface ? l.b : l.a;
    const dev = this.getDevice(end.dev);
    const i = dev?.ifaces.find((x) => x.name === end.iface);
    return dev && i ? { dev, iface: i } : null;
  }

  findIface(dev: Device, name: string): Iface | undefined {
    return findIfaceOn(dev, name);
  }

  // ---------- VLAN et ports de switch ----------

  /** Port physique d'un switch qui fait de la commutation (pas un port routé). */
  isSwitchport(dev: Device, iface: Iface): boolean {
    return isSwitchLike(dev) && !iface.routed && dev.ifaces.includes(iface);
  }

  vlanExists(dev: Device, v: number): boolean {
    return v === 1 || (dev.vlans ?? []).some((x) => x.id === v);
  }

  vlanName(dev: Device, v: number): string {
    if (v === 1) return "default";
    return (dev.vlans ?? []).find((x) => x.id === v)?.name ?? `VLAN${String(v).padStart(4, "0")}`;
  }

  /** Mode effectif d'un port après négociation DTP : access ou trunk. */
  opMode(dev: Device, iface: Iface): "access" | "trunk" {
    const mode = iface.mode ?? "dynamic-auto";
    if (mode === "access" || mode === "trunk") return mode;
    const peer = this.peerOf(dev.id, iface.name);
    if (!peer || !this.isSwitchport(peer.dev, peer.iface) || peer.iface.nonegotiate) return "access";
    const other = peer.iface.mode ?? "dynamic-auto";
    if (other === "access") return "access";
    if (mode === "dynamic-desirable") return "trunk"; // face à trunk, desirable ou auto
    return other === "trunk" || other === "dynamic-desirable" ? "trunk" : "access";
  }

  /** VLAN transportés par un port de switch. */
  portCarries(dev: Device, iface: Iface, v: number): boolean {
    if (this.opMode(dev, iface) === "access") return (iface.accessVlan ?? 1) === v;
    const allowed = parseVlanList(iface.allowed);
    return !allowed || allowed.has(v);
  }

  // ---------- États des interfaces ----------

  /** Câble branché et les deux bouts activés. */
  private physUp(dev: Device, iface: Iface): boolean {
    if (!iface.adminUp) return false;
    const peer = this.peerOf(dev.id, iface.name);
    return !!peer && peer.iface.adminUp;
  }

  /** État « up/up » d'une interface (physique, sous-interface ou SVI). */
  isUp(dev: Device, iface: Iface): boolean {
    if (isSvi(iface.name)) {
      const v = vlanOf(iface.name);
      if (!iface.adminUp || !this.vlanExists(dev, v)) return false;
      return dev.ifaces.some((p) => this.isSwitchport(dev, p) && this.physUp(dev, p) && this.portCarries(dev, p, v));
    }
    if (isSubif(iface.name)) {
      const parent = dev.ifaces.find((i) => i.name === parentOf(iface.name));
      return iface.adminUp && !!parent && this.physUp(dev, parent);
    }
    return this.physUp(dev, iface);
  }

  clearDynamic() {
    this.arp.clear();
    this.macTables.clear();
  }

  // ---------- Tables (pour les commandes show) ----------

  arpTable(dev: Device) {
    const own = this.l3Ifaces(dev)
      .filter((i) => i.ip && this.isUp(dev, i))
      .map((i) => ({ ip: i.ip!, mac: i.mac, port: i.name, own: true }));
    const learned = [...(this.arp.get(dev.id) ?? new Map()).entries()].map(([ip, e]) => ({ ip, mac: e.mac, port: e.port, own: false }));
    return [...own, ...learned].sort((x, y) => (ipToInt(x.ip) ?? 0) - (ipToInt(y.ip) ?? 0));
  }

  macTable(dev: Device) {
    return [...(this.macTables.get(dev.id) ?? new Map()).entries()]
      .map(([key, port]) => {
        const [vlan, mac] = key.split("|");
        return { vlan: Number(vlan), mac, port };
      })
      .sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac));
  }

  /** L'équipement fait-il du routage IP ? */
  routes(dev: Device): boolean {
    return dev.kind === "router" || (dev.kind === "l3switch" && !!dev.ipRouting);
  }

  /** Table de routage : routes connectées (C), locales (L) et statiques (S). */
  routingTable(dev: Device) {
    const routes: { code: "C" | "L" | "S"; network: string; prefix: number; via?: string; iface?: string }[] = [];
    for (const i of this.l3Ifaces(dev)) {
      if (!i.ip || !i.mask || !this.isUp(dev, i)) continue;
      routes.push({ code: "C", network: networkOf(i.ip, i.mask), prefix: maskToPrefix(i.mask), iface: i.name });
      routes.push({ code: "L", network: i.ip, prefix: 32, iface: i.name });
    }
    for (const r of dev.routes) {
      if (this.resolveStatic(dev, r)) routes.push({ code: "S", network: r.network, prefix: maskToPrefix(r.mask), via: r.nextHop, iface: r.iface });
    }
    return routes.sort((a, b) => (ipToInt(a.network) ?? 0) - (ipToInt(b.network) ?? 0) || a.prefix - b.prefix);
  }

  // ---------- Couche 3 ----------

  /** Interfaces qui portent une adresse IP. */
  l3Ifaces(dev: Device): Iface[] {
    if (dev.kind === "switch") return dev.svis ?? [];
    if (dev.kind === "l3switch") return [...dev.ifaces.filter((i) => i.routed), ...(dev.svis ?? [])];
    if (dev.kind === "router") return [...dev.ifaces, ...(dev.subifs ?? [])];
    return dev.ifaces;
  }

  private ownsIp(dev: Device, ip: string) {
    return this.l3Ifaces(dev).some((i) => i.ip === ip && this.isUp(dev, i));
  }

  private resolveStatic(dev: Device, r: StaticRoute): { out: Iface; nextHop: string | null } | null {
    if (r.iface) {
      const out = this.l3Ifaces(dev).find((i) => i.name === r.iface);
      return out && this.isUp(dev, out) ? { out, nextHop: r.nextHop ?? null } : null;
    }
    if (!r.nextHop) return null;
    const out = this.l3Ifaces(dev).find((i) => i.ip && i.mask && this.isUp(dev, i) && sameSubnet(i.ip, r.nextHop!, i.mask));
    return out ? { out, nextHop: r.nextHop } : null;
  }

  /** Choisit l'interface de sortie et le prochain saut pour une destination. */
  private route(dev: Device, dst: string): { out: Iface; nextHop: string } | null {
    const ifs = this.l3Ifaces(dev).filter((i) => i.ip && i.mask && this.isUp(dev, i));
    if (!this.routes(dev)) {
      // Hôte (PC, switch de couche 2, switch L3 sans « ip routing ») : réseau local, sinon passerelle
      const local = ifs.find((i) => sameSubnet(i.ip!, dst, i.mask!));
      if (local) return { out: local, nextHop: dst };
      if (!dev.gateway) return null;
      const out = ifs.find((i) => sameSubnet(i.ip!, dev.gateway!, i.mask!));
      return out ? { out, nextHop: dev.gateway } : null;
    }
    // Routeur : correspondance la plus longue entre routes connectées et statiques
    let best: { out: Iface; nextHop: string; prefix: number } | null = null;
    for (const i of ifs) {
      if (!sameSubnet(i.ip!, dst, i.mask!)) continue;
      const p = maskToPrefix(i.mask!);
      if (!best || p > best.prefix) best = { out: i, nextHop: dst, prefix: p };
    }
    for (const r of dev.routes) {
      if (!sameSubnet(r.network, dst, r.mask)) continue;
      const p = maskToPrefix(r.mask);
      if (best && p <= best.prefix) continue;
      const res = this.resolveStatic(dev, r);
      if (res) best = { out: res.out, nextHop: res.nextHop ?? dst, prefix: p };
    }
    return best ? { out: best.out, nextHop: best.nextHop } : null;
  }

  // ---------- Transport des trames ----------

  private queue: { dev: Device; port?: string; logical?: string; frame: Frame }[] = [];

  /** Met une trame sur le câble d'un port physique. */
  private emitPhys(dev: Device, port: string, frame: Frame) {
    const iface = dev.ifaces.find((i) => i.name === port);
    if (!iface || !this.isUp(dev, iface)) return;
    const peer = this.peerOf(dev.id, port);
    if (peer) this.queue.push({ dev: peer.dev, port: peer.iface.name, frame });
  }

  /** Émet une trame depuis une interface de couche 3 (physique, sous-interface ou SVI). */
  private emitL3(dev: Device, name: string, frame: Frame) {
    if (isSvi(name)) {
      this.switchForward(dev, null, vlanOf(name), { ...frame, vlan: undefined });
      return;
    }
    if (isSubif(name)) {
      const sub = dev.subifs?.find((i) => i.name === name);
      if (!sub?.encap) return; // sans « encapsulation dot1Q », la sous-interface n'émet rien
      this.emitPhys(dev, parentOf(name), { ...frame, vlan: sub.native ? undefined : sub.encap });
      return;
    }
    this.emitPhys(dev, name, { ...frame, vlan: undefined });
  }

  /** Une trame arrive sur un port de switch : choix du VLAN selon le mode du port. */
  private switchIngress(sw: Device, port: string, frame: Frame) {
    const iface = sw.ifaces.find((i) => i.name === port);
    if (!iface || !this.isUp(sw, iface)) return;
    let v: number;
    if (this.opMode(sw, iface) === "trunk") {
      v = frame.vlan ?? iface.nativeVlan ?? 1;
      if (!this.portCarries(sw, iface, v)) return;
    } else {
      v = iface.accessVlan ?? 1;
      if (frame.vlan !== undefined && frame.vlan !== v) return; // trame étiquetée sur un port d'accès : rejetée
    }
    if (!this.vlanExists(sw, v)) return;
    this.switchForward(sw, port, v, { ...frame, vlan: undefined });
  }

  /** Commutation dans un VLAN : apprentissage, livraison à la SVI, transfert ou inondation. */
  private switchForward(sw: Device, inPort: string | null, v: number, frame: Frame) {
    let table = this.macTables.get(sw.id);
    if (!table) this.macTables.set(sw.id, (table = new Map()));
    if (inPort) table.set(`${v}|${frame.src}`, inPort);
    const svi = sw.svis?.find((i) => i.name === `Vlan${v}`);
    if (inPort && svi && this.isUp(sw, svi) && (frame.dst === BROADCAST_MAC || frame.dst === svi.mac)) {
      this.queue.push({ dev: sw, logical: svi.name, frame });
    }
    if (svi && frame.dst === svi.mac) return;
    const known = frame.dst !== BROADCAST_MAC ? table.get(`${v}|${frame.dst}`) : undefined;
    const outs = known ? [known] : sw.ifaces.filter((i) => this.isSwitchport(sw, i)).map((i) => i.name);
    for (const p of outs) {
      if (p === inPort) continue;
      const iface = sw.ifaces.find((i) => i.name === p)!;
      if (!this.isSwitchport(sw, iface) || !this.portCarries(sw, iface, v)) continue;
      const tagged = this.opMode(sw, iface) === "trunk" && v !== (iface.nativeVlan ?? 1);
      this.emitPhys(sw, p, { ...frame, vlan: tagged ? v : undefined });
    }
  }

  /** Une trame arrive sur une interface de couche 3 physique : choix de la sous-interface selon l'étiquette. */
  private l3Ingress(dev: Device, port: string, frame: Frame) {
    let logical = port;
    if (dev.kind === "router") {
      const subs = (dev.subifs ?? []).filter((s) => parentOf(s.name) === port && s.encap);
      if (frame.vlan !== undefined) {
        const sub = subs.find((s) => s.encap === frame.vlan && !s.native) ?? subs.find((s) => s.encap === frame.vlan);
        if (!sub) return;
        logical = sub.name;
      } else {
        const nat = subs.find((s) => s.native);
        if (nat) logical = nat.name;
      }
    } else if (frame.vlan !== undefined) return; // un PC ou un port routé ignore les trames étiquetées
    this.receiveL3(dev, logical, frame);
  }

  private run() {
    let steps = 0;
    while (this.queue.length && steps++ < 20000) {
      const { dev, port, logical, frame } = this.queue.shift()!;
      if (logical) this.receiveL3(dev, logical, frame);
      else if (port) {
        const iface = dev.ifaces.find((i) => i.name === port);
        if (iface && this.isSwitchport(dev, iface)) this.switchIngress(dev, port, frame);
        else this.l3Ingress(dev, port, frame);
      }
    }
    this.queue = [];
  }

  private receiveL3(dev: Device, name: string, frame: Frame) {
    const iface = this.findIface(dev, name);
    if (!iface || !this.isUp(dev, iface)) return;
    if (frame.dst !== BROADCAST_MAC && frame.dst !== iface.mac) return;
    if (frame.type === "arp") {
      const a = frame.arp;
      if (a.op === "req" && iface.ip && a.targetIp === iface.ip) {
        this.learnArp(dev, a.senderIp, a.senderMac, name);
        this.emitL3(dev, name, { src: iface.mac, dst: a.senderMac, type: "arp", arp: { op: "rep", senderIp: iface.ip, senderMac: iface.mac, targetIp: a.senderIp } });
      } else if (a.op === "rep" && a.targetIp === iface.ip) {
        this.learnArp(dev, a.senderIp, a.senderMac, name);
      }
      return;
    }
    const pkt = frame.ip;
    if (this.ownsIp(dev, pkt.dst)) {
      if (pkt.icmp.type === "echo") {
        this.sendIp(dev, { src: pkt.dst, dst: pkt.src, ttl: this.initialTtl(dev), icmp: { ...pkt.icmp, type: "reply" } });
      } else {
        const box = this.inbox.get(dev.id) ?? [];
        box.push({ ...pkt.icmp, from: pkt.src, ttl: pkt.ttl });
        this.inbox.set(dev.id, box);
      }
      return;
    }
    if (!this.routes(dev)) return; // un PC ou un switch de couche 2 ne route pas
    if (pkt.ttl <= 1) {
      if (pkt.icmp.type === "echo" && iface.ip) this.sendIp(dev, { src: iface.ip, dst: pkt.src, ttl: 255, icmp: { ...pkt.icmp, type: "ttl-exceeded" } });
      return;
    }
    this.sendIp(dev, { ...pkt, ttl: pkt.ttl - 1 });
  }

  private learnArp(dev: Device, ip: string, mac: string, port: string) {
    let t = this.arp.get(dev.id);
    if (!t) this.arp.set(dev.id, (t = new Map()));
    t.set(ip, { mac, port });
  }

  private initialTtl(dev: Device) {
    return dev.kind === "pc" ? 128 : 255;
  }

  /** Envoie un paquet IP : routage puis résolution ARP. Retourne false si le paquet est perdu. */
  private sendIp(dev: Device, pkt: IpPacket): boolean {
    const r = this.route(dev, pkt.dst);
    if (!r) return false;
    const src = pkt.src || r.out.ip!;
    const entry = this.arp.get(dev.id)?.get(r.nextHop);
    if (!entry) {
      // Pas d'entrée ARP : on envoie une requête et le paquet est perdu (le « . » du premier ping)
      this.emitL3(dev, r.out.name, { src: r.out.mac, dst: BROADCAST_MAC, type: "arp", arp: { op: "req", senderIp: r.out.ip!, senderMac: r.out.mac, targetIp: r.nextHop } });
      return false;
    }
    this.emitL3(dev, r.out.name, { src: r.out.mac, dst: entry.mac, type: "ipv4", ip: { ...pkt, src } });
    return true;
  }

  /**
   * Un PC (ou un switch) attend la réponse ARP avant d'envoyer son paquet,
   * alors qu'un routeur le jette : c'est ce qui donne « .!!!! » sur un routeur.
   */
  private prepareArp(dev: Device, dst: string) {
    if (this.routes(dev)) return;
    const r = this.route(dev, dst);
    if (!r || this.arp.get(dev.id)?.has(r.nextHop)) return;
    this.emitL3(dev, r.out.name, { src: r.out.mac, dst: BROADCAST_MAC, type: "arp", arp: { op: "req", senderIp: r.out.ip!, senderMac: r.out.mac, targetIp: r.nextHop } });
    this.run();
  }

  // ---------- Outils de diagnostic ----------

  /** Envoie des pings et renvoie le résultat de chacun. */
  ping(dev: Device, dst: string, count = 5): { ok: boolean; ttl?: number; from?: string; kind?: IcmpType }[] {
    const results: { ok: boolean; ttl?: number; from?: string; kind?: IcmpType }[] = [];
    if (!isIp(dst)) return results;
    for (let seq = 0; seq < count; seq++) {
      const id = this.icmpId++;
      this.inbox.set(dev.id, []);
      if (this.ownsIp(dev, dst)) {
        results.push({ ok: true, ttl: this.initialTtl(dev), from: dst });
        continue;
      }
      this.prepareArp(dev, dst);
      this.sendIp(dev, { src: "", dst, ttl: this.initialTtl(dev), icmp: { type: "echo", id, seq } });
      this.run();
      const reply = (this.inbox.get(dev.id) ?? []).find((m) => m.id === id);
      results.push(reply ? { ok: reply.type === "reply", ttl: reply.ttl, from: reply.from, kind: reply.type } : { ok: false });
    }
    return results;
  }

  /** Traceroute : chaque saut renvoie « TTL dépassé » jusqu'à la destination. */
  traceroute(dev: Device, dst: string, maxHops = 15): (string | null)[] {
    const hops: (string | null)[] = [];
    for (let ttl = 1; ttl <= maxHops; ttl++) {
      let hop: string | null = null;
      let done = false;
      for (let attempt = 0; attempt < 2 && !hop; attempt++) {
        // 2 essais : le premier peut servir à résoudre l'ARP
        const id = this.icmpId++;
        this.inbox.set(dev.id, []);
        this.prepareArp(dev, dst);
        this.sendIp(dev, { src: "", dst, ttl, icmp: { type: "echo", id, seq: ttl } });
        this.run();
        const m = (this.inbox.get(dev.id) ?? []).find((x) => x.id === id);
        if (m) {
          hop = m.from;
          done = m.type === "reply";
        }
      }
      hops.push(hop);
      if (done) break;
    }
    return hops;
  }

  // ---------- Sauvegarde ----------

  toJSON() {
    return { version: 2, devices: this.devices, links: this.links, macSeed: this.macSeed, nextId: this.nextId };
  }

  static fromJSON(data: unknown): Network {
    const n = new Network();
    const d = data as ReturnType<Network["toJSON"]>;
    if (!d || !Array.isArray(d.devices) || !Array.isArray(d.links)) throw new Error("Fichier de lab invalide");
    n.devices = d.devices.map((raw) => {
      // Compatibilité avec les labs de la version 1 (un seul « svi »)
      const { svi, ...x } = raw as Device & { svi?: Iface };
      const dev: Device = { ...x, routes: x.routes ?? [], extra: x.extra ?? [] };
      if (isSwitchLike(dev)) {
        dev.svis = dev.svis ?? (svi ? [svi] : []);
        dev.vlans = dev.vlans ?? [];
      }
      if (dev.kind === "router") dev.subifs = dev.subifs ?? [];
      return dev;
    });
    n.links = d.links;
    n.macSeed = d.macSeed ?? 1000;
    n.nextId = d.nextId ?? 1000;
    return n;
  }
}

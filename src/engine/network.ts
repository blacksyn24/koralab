// Moteur réseau de KoraLab : équipements, câbles, commutation Ethernet avec VLAN (802.1Q),
// ARP, routage IPv4 (routeurs, sous-interfaces, switchs de couche 3) et ICMP.
// Tout est simulé dans le navigateur, de façon déterministe (pas de vrai temps).

import { firstMatch, type Acl } from "./acl";
import { BROADCAST_MAC, broadcastOf, intToIp, ipToInt, isIp, makeMac, maskToPrefix, networkOf, sameSubnet } from "./ip";
import { expand6, inPrefix6, isLinkLocal6, linkLocal, network6, withEui64 } from "./ip6";

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
  // --- Services IP ---
  aclIn?: string; // ip access-group <acl> in
  aclOut?: string; // ip access-group <acl> out
  nat?: "inside" | "outside"; // ip nat inside / outside
  helpers?: string[]; // ip helper-address (relais DHCP)
  dhcp?: boolean; // adresse obtenue par DHCP (ip address dhcp / PC en DHCP)
  // --- OSPF (configuration d'interface) ---
  ospfArea?: { pid: number; area: number }; // ip ospf <pid> area <n>
  ospfCost?: number;
  ospfPriority?: number;
  ospfHello?: number;
  ospfDead?: number;
  ospfP2p?: boolean; // ip ospf network point-to-point
  // --- Spanning Tree et EtherChannel ---
  portfast?: boolean;
  bpduguard?: boolean;
  stpCost?: number;
  stpPrio?: number; // spanning-tree port-priority (défaut 128)
  channel?: { group: number; mode: "active" | "passive" | "on" | "desirable" | "auto" };
  // --- Sécurité des ports ---
  psec?: { max?: number; violation?: "shutdown" | "restrict" | "protect"; sticky?: boolean; macs?: string[] };
  errdis?: string; // cause d'err-disabled persistante (psecure-violation…)
  dhcpTrust?: boolean; // ip dhcp snooping trust
  arpTrust?: boolean; // ip arp inspection trust
  // --- IPv6 ---
  ipv6?: { addr: string; len: number; eui?: boolean; auto?: boolean }[];
  ipv6Enabled?: boolean; // ipv6 enable (link-local seule)
  ipv6Autoconfig?: boolean; // ipv6 address autoconfig (SLAAC)
  ll?: string; // adresse link-local configurée à la main
  // --- HSRP, CDP, LLDP ---
  hsrp?: { group: number; vip?: string; priority?: number; preempt?: boolean; version?: number }[];
  cdpOff?: boolean; // no cdp enable
  lldpTx?: boolean; // lldp transmit (par défaut actif quand « lldp run »)
  lldpRx?: boolean;
};

export type Route6 = { prefix: string; len: number; nextHop?: string; iface?: string; ad?: number };

export type StpConfig = { mode?: "pvst" | "rapid-pvst"; priorities?: Record<string, number>; portfastDefault?: boolean; bpduguardDefault?: boolean };
export type StpPort = { role: "Root" | "Desg" | "Altn"; state: "FWD" | "BLK"; cost: number; prio: number; nbr: number; edge: boolean };
export type StpVlan = { rootBid: { prio: number; mac: string }; bid: { prio: number; mac: string }; rootCost: number; rootPort?: string; ports: Map<string, StpPort> };

export type OspfConfig = {
  pid: number;
  routerId?: string;
  networks: { ip: string; wildcard: string; area: number }[];
  passive: string[];
  passiveDefault?: boolean;
  noPassive: string[];
  defaultOriginate?: boolean;
  refBw?: number; // auto-cost reference-bandwidth (Mbit/s), 100 par défaut
};

export type DhcpPool = { name: string; network?: string; mask?: string; router?: string; dns?: string; domain?: string; lease?: string };
export type NatPool = { name: string; start: string; end: string; mask: string };
export type NatRule = { acl: string; pool?: string; iface?: string; overload: boolean };
export type NatConfig = { statics: { local: string; global: string }[]; pools: NatPool[]; rules: NatRule[] };

export type Vlan = { id: number; name: string };

export type StaticRoute = { network: string; mask: string; nextHop?: string; iface?: string; ad?: number };

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
  /** Interfaces de bouclage : Loopback0… */
  loopbacks?: Iface[];
  /** Processus OSPF */
  ospf?: OspfConfig;
  /** Spanning Tree */
  stp?: StpConfig;
  /** Interfaces Port-channel (EtherChannel) */
  portChannels?: Iface[];
  /** Configuration sauvegardée (copy run start) restaurée par « reload » */
  saved?: string;
  /** Services d'exploitation */
  cdpOff?: boolean; // no cdp run
  lldpOn?: boolean; // lldp run
  ntpServers?: string[];
  ntpMaster?: number;
  clockOffset?: number; // décalage de l'horloge (ms) par rapport à l'heure réelle
  timezone?: { name: string; hours: number };
  hosts?: { name: string; ip: string }[]; // ip host
  /** IPv6 : routage, routes statiques, passerelle (PC) */
  ipv6Routing?: boolean;
  routes6?: Route6[];
  gateway6?: string;
  /** DHCP snooping et inspection ARP dynamique */
  snooping?: { enabled: boolean; vlans: number[] };
  dai?: { vlans: number[] };
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
  /** Listes de contrôle d'accès */
  acls?: Acl[];
  /** Serveur DHCP : pools, plages exclues et baux attribués */
  dhcpPools?: DhcpPool[];
  dhcpExcluded?: [string, string][];
  dhcpLeases?: { ip: string; mac: string; pool: string }[];
  /** NAT / PAT */
  nat?: NatConfig;
};

export type Link = { id: string; a: { dev: string; iface: string }; b: { dev: string; iface: string } };

type ArpPayload = { op: "req" | "rep"; senderIp: string; senderMac: string; targetIp: string };
type IcmpType = "echo" | "reply" | "ttl-exceeded" | "unreachable";
export type DhcpMsg = { op: "discover" | "ack" | "nak"; xid: number; chaddr: string; giaddr?: string; yiaddr?: string; mask?: string; router?: string; dns?: string; server?: string };
type IpPacket = {
  src: string;
  dst: string;
  ttl: number;
  proto: "icmp" | "udp" | "tcp";
  icmp?: { type: IcmpType; id: number; seq: number };
  sport?: number;
  dport?: number;
  dhcp?: DhcpMsg;
  /** Essai de connexion TCP (test des ACL : telnet, ssh, http…) */
  tcp?: { flag: "syn" | "synack" | "rst"; id: number };
};
const IP_BROADCAST = "255.255.255.255";
/** Trame Ethernet ; « vlan » = étiquette 802.1Q présente sur le câble (absente = trame non étiquetée). */
type Ip6Packet = {
  src: string;
  dst: string;
  hop: number;
  icmp?: { type: IcmpType; id: number; seq: number };
  /** Découverte des voisins (NDP) : sollicitation / annonce de voisin et de routeur */
  nd?: { op: "ns" | "na" | "rs" | "ra"; target?: string; mac: string; prefixes?: { prefix: string; len: number }[] };
};
type Frame = ({ type: "arp"; arp: ArpPayload } | { type: "ipv4"; ip: IpPacket } | { type: "ipv6"; ip6: Ip6Packet }) & { src: string; dst: string; vlan?: number };

export type NatEntry = { proto: string; insideLocal: string; insideGlobal: string; localPort?: number; globalPort?: number; outside?: string; static?: boolean };

/** Route candidate : connectée, statique ou OSPF. */
export type RouteCand = { code: string; network: string; mask: string; prefix: number; ad: number; metric: number; out: Iface | null; nextHop: string | null; alt?: { out: Iface; nextHop: string }[]; cost?: number };
export type HsrpState = { iface: string; group: number; vip?: string; priority: number; preempt: boolean; state: "Active" | "Standby" | "Listen" | "Init"; active?: string; standby?: string; mac: string };
export type OspfIf = { iface: Iface; area: number; passive: boolean; cost: number; dr?: string; bdr?: string; role?: string; nbrs?: number };
export type OspfNeighbor = { rid: string; pri: number; state: string; address: string; iface: string; dead: number };
export type OspfDevState = { rid: string | null; ifs: OspfIf[]; neighbors: OspfNeighbor[]; routes: RouteCand[] };

/** Comparaison lexicographique de deux listes de nombres (a < b ?). */
function lexLess(a: number[], b: number[]): boolean {
  for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) return a[k] < b[k];
  return a.length < b.length;
}

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
export const isLoopback = (name: string) => /^Loopback\d+$/.test(name);
export const isPortChannel = (name: string) => /^Port-channel\d+$/.test(name);
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
  return name.replace(/^GigabitEthernet/, "Gi").replace(/^FastEthernet/, "Fa").replace(/^Vlan/, "Vl").replace(/^Loopback/, "Lo").replace(/^Port-channel/, "Po");
}

/** Toutes les interfaces d'un équipement (physiques, sous-interfaces, SVI). */
export function allIfaces(dev: Device): Iface[] {
  return [...dev.ifaces, ...(dev.subifs ?? []), ...(dev.svis ?? []), ...(dev.loopbacks ?? []), ...(dev.portChannels ?? [])];
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
  if ("port-channel".startsWith(typed) && typed.length >= 2 && !sub && !num.includes("/")) {
    return isSwitchLike(dev) && Number(num) >= 1 && Number(num) <= 48 ? `Port-channel${Number(num)}` : null;
  }
  if ("loopback".startsWith(typed) && typed.length >= 2 && !sub && !num.includes("/")) {
    return dev.kind === "router" || dev.kind === "l3switch" ? `Loopback${Number(num)}` : null;
  }
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
  private tcpInbox = new Map<string, { id: number; flag: string; from: string }[]>();
  private aclHits = new Map<string, number>();
  private unreachToggle = new Map<string, number>();

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
    if (isPortChannel(name) && isSwitchLike(dev)) {
      const po: Iface = { name, mac: dev.svis?.[0]?.mac ?? makeMac(this.macSeed++), adminUp: true, description: "" };
      dev.portChannels = [...(dev.portChannels ?? []), po].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
      return po;
    }
    if (isLoopback(name) && (dev.kind === "router" || dev.kind === "l3switch")) {
      const lo: Iface = { name, mac: "0000.0000.0000", adminUp: true, description: "" };
      dev.loopbacks = [...(dev.loopbacks ?? []), lo].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
      return lo;
    }
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
    if (isLoopback(name)) dev.loopbacks = (dev.loopbacks ?? []).filter((i) => i.name !== name);
    if (isPortChannel(name)) {
      dev.portChannels = (dev.portChannels ?? []).filter((i) => i.name !== name);
      for (const m of dev.ifaces) if (m.channel && `Port-channel${m.channel.group}` === name) m.channel = undefined;
    }
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
    return !!peer && peer.iface.adminUp && !this.errDisabled(dev, iface) && !this.errDisabled(peer.dev, peer.iface);
  }

  /** BPDU Guard : un port PortFast qui reçoit des BPDU (switch en face) passe en err-disabled. */
  errDisabled(dev: Device, iface: Iface): boolean {
    if (!isSwitchLike(dev) || iface.routed || !dev.ifaces.includes(iface) || !iface.adminUp) return false;
    if (iface.errdis) return true;
    const portfast = iface.portfast ?? (!!dev.stp?.portfastDefault && this.opModeRaw(dev, iface) === "access");
    const guard = iface.bpduguard ?? (!!dev.stp?.bpduguardDefault && portfast);
    if (!guard) return false;
    const peer = this.peerOf(dev.id, iface.name);
    return !!peer && peer.iface.adminUp && isSwitchLike(peer.dev) && !peer.iface.routed;
  }

  /** Mode configuré sans négociation (pour PortFast par défaut). */
  private opModeRaw(_dev: Device, iface: Iface): "access" | "trunk" {
    return iface.mode === "trunk" ? "trunk" : "access";
  }

  /** État « up/up » d'une interface (physique, sous-interface ou SVI). */
  isUp(dev: Device, iface: Iface): boolean {
    if (isLoopback(iface.name)) return iface.adminUp;
    if (isPortChannel(iface.name)) return iface.adminUp && this.bundle(dev, Number(iface.name.slice(12))).members.length > 0;
    if (isSvi(iface.name)) {
      const v = vlanOf(iface.name);
      if (!iface.adminUp || !this.vlanExists(dev, v)) return false;
      return dev.ifaces.some((p) => this.isSwitchport(dev, p) && this.physUp(dev, p) && this.portCarries(dev, p, v) && (!p.channel || this.bundle(dev, p.channel.group).members.includes(p)));
    }
    if (isSubif(iface.name)) {
      const parent = dev.ifaces.find((i) => i.name === parentOf(iface.name));
      return iface.adminUp && !!parent && this.physUp(dev, parent);
    }
    return this.physUp(dev, iface);
  }

  clearDynamic() {
    this.hsrpCache = null;
    this.nd.clear();
    this.arp.clear();
    this.macTables.clear();
    this.ospfCache = null;
    this.stpCache = null;
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

  /** Table de routage : la meilleure route pour chaque réseau (C, L, S, O…). */
  routingTable(dev: Device) {
    const best = new Map<string, RouteCand>();
    for (const c of this.candidates(dev)) {
      const key = `${c.network}/${c.prefix}`;
      const cur = best.get(key);
      if (!cur || c.ad < cur.ad || (c.ad === cur.ad && c.metric < cur.metric)) best.set(key, c);
    }
    const locals = this.l3Ifaces(dev)
      .filter((i) => i.ip && i.mask && this.isUp(dev, i) && !isLoopback(i.name))
      .map((i) => ({ code: "L", network: i.ip!, prefix: 32, mask: "255.255.255.255", ad: 0, metric: 0, out: i, nextHop: null }) as RouteCand);
    return [...best.values(), ...locals]
      .map((r) => ({ code: r.code, network: r.network, prefix: r.prefix, via: r.nextHop ?? undefined, iface: r.out?.name, ad: r.ad, metric: r.metric, alt: r.alt }))
      .sort((a, b) => (ipToInt(a.network) ?? 0) - (ipToInt(b.network) ?? 0) || a.prefix - b.prefix);
  }

  // ---------- Couche 3 ----------

  /** Interfaces qui portent une adresse IP. */
  l3Ifaces(dev: Device): Iface[] {
    if (dev.kind === "switch") return dev.svis ?? [];
    if (dev.kind === "l3switch") return [...dev.ifaces.filter((i) => i.routed), ...(dev.svis ?? []), ...(dev.loopbacks ?? [])];
    if (dev.kind === "router") return [...dev.ifaces, ...(dev.subifs ?? []), ...(dev.loopbacks ?? [])];
    return dev.ifaces;
  }

  private ownsIp(dev: Device, ip: string) {
    return this.l3Ifaces(dev).some((i) => i.ip === ip && this.isUp(dev, i)) || this.hsrpActiveFor(dev, ip) !== null;
  }

  // ---------- HSRP ----------

  private hsrpCache: Map<string, HsrpState[]> | null = null;

  static hsrpMac(group: number, version = 1): string {
    return version === 2 ? `0000.0c9f.f${group.toString(16).padStart(3, "0")}` : `0000.0c07.ac${group.toString(16).padStart(2, "0")}`;
  }

  /** État HSRP de chaque interface : Active, Standby ou Listen, élu par priorité puis adresse IP. */
  hsrpState(): Map<string, HsrpState[]> {
    if (this.hsrpCache) return this.hsrpCache;
    const out = new Map<string, HsrpState[]>();
    for (const d of this.devices) {
      if (d.kind !== "router" && d.kind !== "l3switch") continue;
      for (const i of this.l3Ifaces(d)) {
        if (!i.hsrp?.length || !i.ip || !this.isUp(d, i)) continue;
        const peers = this.reachL3(d, i.name);
        for (const g of i.hsrp) {
          const members = [{ dev: d, iface: i, g }, ...peers.flatMap((p) => (p.iface.hsrp ?? []).filter((x) => x.group === g.group && p.iface.ip).map((x) => ({ dev: p.dev, iface: p.iface, g: x })))];
          const vip = members.map((m) => m.g.vip).find(Boolean);
          const sorted = [...members].sort((a, b) => (b.g.priority ?? 100) - (a.g.priority ?? 100) || (ipToInt(b.iface.ip!) ?? 0) - (ipToInt(a.iface.ip!) ?? 0));
          const rank = sorted.findIndex((m) => m.iface === i);
          const st: HsrpState = {
            iface: i.name,
            group: g.group,
            vip,
            priority: g.priority ?? 100,
            preempt: !!g.preempt,
            state: !vip ? "Init" : rank === 0 ? "Active" : rank === 1 ? "Standby" : "Listen",
            active: sorted[0]?.iface.ip,
            standby: sorted[1]?.iface.ip,
            mac: Network.hsrpMac(g.group, g.version),
          };
          out.set(d.id, [...(out.get(d.id) ?? []), st]);
        }
      }
    }
    this.hsrpCache = out;
    return out;
  }

  /** Interface où l'équipement est routeur HSRP actif pour cette adresse virtuelle. */
  private hsrpActiveFor(dev: Device, vip: string): { iface: string; mac: string } | null {
    if (dev.kind !== "router" && dev.kind !== "l3switch") return null;
    const st = (this.hsrpState().get(dev.id) ?? []).find((x) => x.vip === vip && x.state === "Active");
    return st ? { iface: st.iface, mac: st.mac } : null;
  }

  private hsrpMacsOn(dev: Device, ifaceName: string): string[] {
    if (dev.kind !== "router" && dev.kind !== "l3switch") return [];
    return (this.hsrpState().get(dev.id) ?? []).filter((x) => x.iface === ifaceName && x.state === "Active").map((x) => x.mac);
  }

  private resolveStatic(dev: Device, r: StaticRoute): { out: Iface; nextHop: string | null } | null {
    if (r.iface) {
      const out = this.l3Ifaces(dev).find((i) => i.name === r.iface);
      return out && this.isUp(dev, out) ? { out, nextHop: r.nextHop ?? null } : null;
    }
    if (!r.nextHop) return null;
    const out = this.l3Ifaces(dev).find((i) => i.ip && i.mask && this.isUp(dev, i) && !isLoopback(i.name) && sameSubnet(i.ip, r.nextHop!, i.mask));
    return out ? { out, nextHop: r.nextHop } : null;
  }

  /** Toutes les routes utilisables : connectées (DA 0), statiques (DA 1 ou choisie), OSPF (DA 110). */
  private candidates(dev: Device): RouteCand[] {
    const out: RouteCand[] = [];
    for (const i of this.l3Ifaces(dev)) {
      if (!i.ip || !i.mask || !this.isUp(dev, i)) continue;
      const mask = isLoopback(i.name) && maskToPrefix(i.mask) === 32 ? i.mask : i.mask;
      out.push({ code: "C", network: networkOf(i.ip, mask), mask, prefix: maskToPrefix(mask), ad: 0, metric: 0, out: i, nextHop: null });
    }
    for (const r of dev.routes) {
      const res = this.resolveStatic(dev, r);
      if (res) out.push({ code: "S", network: networkOf(r.network, r.mask), mask: r.mask, prefix: maskToPrefix(r.mask), ad: r.ad ?? (r.iface && !r.nextHop ? 0 : 1), metric: 0, out: res.out, nextHop: res.nextHop });
    }
    if (this.routes(dev)) out.push(...(this.ospfState().get(dev.id)?.routes ?? []));
    return out;
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
    // Routeur : préfixe le plus long, puis distance administrative, puis métrique
    let best: RouteCand | null = null;
    for (const c of this.candidates(dev)) {
      if (!sameSubnet(c.network, dst, c.mask)) continue;
      if (!best || c.prefix > best.prefix || (c.prefix === best.prefix && (c.ad < best.ad || (c.ad === best.ad && c.metric < best.metric)))) best = c;
    }
    if (!best?.out) return null;
    if (isLoopback(best.out.name)) return null; // destination sur une loopback : déjà traitée par ownsIp
    return { out: best.out, nextHop: best.nextHop ?? dst };
  }

  // ---------- Joignabilité de couche 2 (sans envoyer de trames) ----------

  /** Interfaces de couche 3 joignables en couche 2 depuis une interface (à travers switchs, VLAN et trunks). */
  reachL3(dev: Device, name: string): { dev: Device; iface: Iface }[] {
    const found: { dev: Device; iface: Iface }[] = [];
    const seen = new Set<string>();
    const visit = (d: Device, port: string, tag: number | undefined) => {
      const key = `${d.id}|${port}|${tag ?? "-"}`;
      if (seen.has(key)) return;
      seen.add(key);
      const iface = d.ifaces.find((i) => i.name === port);
      if (!iface || !this.isUp(d, iface)) return;
      if (this.isSwitchport(d, iface)) {
        let v: number;
        if (this.opMode(d, iface) === "trunk") {
          v = tag ?? iface.nativeVlan ?? 1;
          if (!this.portCarries(d, iface, v)) return;
        } else {
          v = iface.accessVlan ?? 1;
          if (tag !== undefined && tag !== v) return;
        }
        if (this.vlanExists(d, v) && this.portActive(d, iface, v)) forward(d, this.logicalOf(d, iface), v);
        return;
      }
      let logical: Iface | undefined = iface;
      if (d.kind === "router") {
        const subs = (d.subifs ?? []).filter((x) => parentOf(x.name) === port && x.encap);
        if (tag !== undefined) logical = subs.find((x) => x.encap === tag);
        else logical = subs.find((x) => x.native) ?? iface;
      } else if (tag !== undefined) return;
      if (logical && this.isUp(d, logical)) found.push({ dev: d, iface: logical });
    };
    const emit = (d: Device, port: string, tag: number | undefined) => {
      const iface = d.ifaces.find((i) => i.name === port);
      if (!iface || !this.isUp(d, iface)) return;
      const peer = this.peerOf(d.id, port);
      if (peer) visit(peer.dev, peer.iface.name, tag);
    };
    const forward = (sw: Device, inPort: string | null, v: number) => {
      const key = `${sw.id}|vlan${v}`;
      if (seen.has(key)) return;
      seen.add(key);
      const svi = sw.svis?.find((i) => i.name === `Vlan${v}`);
      if (inPort && svi && this.isUp(sw, svi)) found.push({ dev: sw, iface: svi });
      for (const l of this.logicalPorts(sw)) {
        const p = l.phys;
        if (l.name === inPort || !this.portCarries(sw, p, v) || !this.portActive(sw, p, v)) continue;
        emit(sw, p.name, this.opMode(sw, p) === "trunk" && v !== (p.nativeVlan ?? 1) ? v : undefined);
      }
    };
    const start = this.findIface(dev, name);
    if (!start || !this.isUp(dev, start) || isLoopback(name)) return found;
    if (isSvi(name)) {
      seen.add(`${dev.id}|vlan${vlanOf(name)}`);
      const v = vlanOf(name);
      for (const l of this.logicalPorts(dev)) {
        const p = l.phys;
        if (!this.portCarries(dev, p, v) || !this.portActive(dev, p, v)) continue;
        emit(dev, p.name, this.opMode(dev, p) === "trunk" && v !== (p.nativeVlan ?? 1) ? v : undefined);
      }
    } else if (isSubif(name)) {
      if (start.encap) emit(dev, parentOf(name), start.native ? undefined : start.encap);
    } else emit(dev, name, undefined);
    return found.filter((f) => f.dev.id !== dev.id);
  }

  // ---------- OSPF ----------

  private ospfCache: Map<string, OspfDevState> | null = null;

  /** Interfaces où OSPF est actif (commande network ou ip ospf … area). */
  private ospfIfs(dev: Device): OspfIf[] {
    const cfg = dev.ospf;
    const out: OspfIf[] = [];
    if (!this.routes(dev)) return out;
    for (const i of this.l3Ifaces(dev)) {
      if (!i.ip || !i.mask || !this.isUp(dev, i)) continue;
      let area: number | undefined;
      if (i.ospfArea && cfg && i.ospfArea.pid === cfg.pid) area = i.ospfArea.area;
      else if (cfg) {
        const n = cfg.networks.find((x) => {
          const wc = ipToInt(x.wildcard) ?? 0;
          const care = ~wc >>> 0;
          return ((ipToInt(i.ip!)! & care) >>> 0) === ((ipToInt(x.ip)! & care) >>> 0);
        });
        area = n?.area;
      }
      if (area === undefined || !cfg) continue;
      const passive = isLoopback(i.name) || (cfg.passiveDefault ? !cfg.noPassive.includes(i.name) : cfg.passive.includes(i.name));
      out.push({ iface: i, area, passive, cost: this.ospfCost(dev, i) });
    }
    return out;
  }

  ospfCost(dev: Device, i: Iface): number {
    if (i.ospfCost) return i.ospfCost;
    if (isLoopback(i.name)) return 1;
    const phys = isSubif(i.name) ? parentOf(i.name) : i.name;
    const bw = phys.startsWith("FastEthernet") ? 100 : 1000; // Mbit/s (SVI : 1 Gbit/s)
    return Math.max(1, Math.floor((dev.ospf?.refBw ?? 100) / bw));
  }

  ospfRouterId(dev: Device): string | null {
    if (dev.ospf?.routerId) return dev.ospf.routerId;
    const ipsOf = (list: Iface[]) => list.filter((i) => i.ip && this.isUp(dev, i)).map((i) => i.ip!).sort((a, b) => ipToInt(b)! - ipToInt(a)!);
    return ipsOf(dev.loopbacks ?? [])[0] ?? ipsOf(this.l3Ifaces(dev))[0] ?? null;
  }

  /** État OSPF de tout le réseau : voisins, DR/BDR et routes, recalculé après chaque changement. */
  ospfState(): Map<string, OspfDevState> {
    if (this.ospfCache) return this.ospfCache;
    const state = new Map<string, OspfDevState>();
    const routers = this.devices.filter((d) => d.ospf && this.routes(d));
    for (const d of routers) state.set(d.id, { rid: this.ospfRouterId(d), ifs: this.ospfIfs(d), neighbors: [], routes: [] });
    // Voisinages : même sous-réseau, même zone, mêmes timers, interfaces non passives
    const edges = new Map<string, { to: Device; cost: number; out: Iface; nextHop: string }[]>();
    for (const d of routers) {
      const me = state.get(d.id)!;
      if (!me.rid) continue;
      const list: { to: Device; cost: number; out: Iface; nextHop: string }[] = [];
      for (const oi of me.ifs) {
        if (oi.passive) continue;
        const nbrs: { dev: Device; oi: OspfIf; rid: string }[] = [];
        for (const r of this.reachL3(d, oi.iface.name)) {
          const other = state.get(r.dev.id);
          const ooi = other?.ifs.find((x) => x.iface === r.iface);
          if (!other?.rid || !ooi || ooi.passive || ooi.area !== oi.area) continue;
          if (!r.iface.mask || r.iface.mask !== oi.iface.mask || !sameSubnet(r.iface.ip!, oi.iface.ip!, oi.iface.mask!)) continue;
          if ((r.iface.ospfHello ?? 10) !== (oi.iface.ospfHello ?? 10) || (r.iface.ospfDead ?? 40) !== (oi.iface.ospfDead ?? 40)) continue;
          if (other.rid === me.rid) continue; // ID de routeur en double : pas de voisinage
          nbrs.push({ dev: r.dev, oi: ooi, rid: other.rid });
        }
        // Élection DR/BDR sur un segment de diffusion
        const p2p = !!oi.iface.ospfP2p;
        const cands = [{ rid: me.rid, pri: oi.iface.ospfPriority ?? 1, ip: oi.iface.ip! }, ...nbrs.map((n) => ({ rid: n.rid, pri: n.oi.iface.ospfPriority ?? 1, ip: n.oi.iface.ip! }))]
          .filter((c) => c.pri > 0)
          .sort((a, b) => b.pri - a.pri || ipToInt(b.rid)! - ipToInt(a.rid)!);
        const dr = p2p ? null : (cands[0] ?? null);
        const bdr = p2p ? null : (cands[1] ?? null);
        const iAmDrOrBdr = dr?.rid === me.rid || bdr?.rid === me.rid;
        for (const n of nbrs) {
          const role = p2p ? "-" : n.rid === dr?.rid ? "DR" : n.rid === bdr?.rid ? "BDR" : "DROTHER";
          const full = p2p || iAmDrOrBdr || role === "DR" || role === "BDR";
          me.neighbors.push({ rid: n.rid, pri: n.oi.iface.ospfPriority ?? 1, state: `${full ? "FULL" : "2WAY"}/${role === "-" ? "  -" : role}`, address: n.oi.iface.ip!, iface: oi.iface.name, dead: n.oi.iface.ospfDead ?? 40 });
          list.push({ to: n.dev, cost: oi.cost, out: oi.iface, nextHop: n.oi.iface.ip! });
        }
        oi.dr = dr?.ip;
        oi.bdr = bdr?.ip;
        oi.role = p2p ? "P2P" : dr?.rid === me.rid ? "DR" : bdr?.rid === me.rid ? "BDR" : nbrs.length ? "DROTHER" : "DR";
        oi.nbrs = nbrs.length;
      }
      edges.set(d.id, list);
    }
    // Dijkstra depuis chaque routeur
    for (const src of routers) {
      const me = state.get(src.id)!;
      if (!me.rid) continue;
      const dist = new Map<string, number>([[src.id, 0]]);
      const first = new Map<string, { out: Iface; nextHop: string }[]>([[src.id, []]]);
      const done = new Set<string>();
      while (true) {
        let cur: string | null = null;
        for (const [id, dd] of dist) if (!done.has(id) && (cur === null || dd < dist.get(cur)!)) cur = id;
        if (cur === null) break;
        done.add(cur);
        for (const e of edges.get(cur) ?? []) {
          const nd = dist.get(cur)! + e.cost;
          const hops = cur === src.id ? [{ out: e.out, nextHop: e.nextHop }] : first.get(cur)!;
          const old = dist.get(e.to.id);
          if (old === undefined || nd < old) {
            dist.set(e.to.id, nd);
            first.set(e.to.id, [...hops]);
          } else if (nd === old) first.set(e.to.id, [...first.get(e.to.id)!, ...hops.filter((h) => !first.get(e.to.id)!.some((x) => x.out === h.out && x.nextHop === h.nextHop))]);
        }
      }
      const myAreas = new Set(me.ifs.map((x) => x.area));
      const mine = new Set(me.ifs.map((x) => `${networkOf(x.iface.ip!, x.iface.mask!)}/${x.iface.mask}`));
      const best = new Map<string, RouteCand>();
      for (const other of routers) {
        if (other.id === src.id || !dist.has(other.id)) continue;
        const hops = first.get(other.id) ?? [];
        if (!hops.length) continue;
        const os = state.get(other.id)!;
        for (const x of os.ifs) {
          const loop = isLoopback(x.iface.name) && !x.iface.ospfP2p;
          const mask = loop ? "255.255.255.255" : x.iface.mask!;
          const network = networkOf(x.iface.ip!, mask);
          if (mine.has(`${network}/${mask}`)) continue;
          const metric = dist.get(other.id)! + x.cost;
          const key = `${network}/${mask}`;
          const cur = best.get(key);
          if (cur && cur.metric === metric) {
            // ECMP : même coût par un autre chemin -> chemin supplémentaire (4 au maximum)
            const all = [{ out: cur.out!, nextHop: cur.nextHop! }, ...(cur.alt ?? [])];
            for (const h of hops) if (all.length < 4 && !all.some((x) => x.out === h.out && x.nextHop === h.nextHop)) all.push(h);
            cur.alt = all.slice(1);
            continue;
          }
          if (cur && cur.metric < metric) continue;
          best.set(key, { code: myAreas.has(x.area) ? "O" : "O IA", network, mask, prefix: maskToPrefix(mask), ad: 110, metric, out: hops[0].out, nextHop: hops[0].nextHop, alt: hops.slice(1) });
        }
        if (other.ospf?.defaultOriginate && other.routes.some((r) => r.network === "0.0.0.0" && r.mask === "0.0.0.0")) {
          const cur = best.get("0.0.0.0/0.0.0.0");
          const metric = 1;
          if (!cur || dist.get(other.id)! < (cur.cost ?? Infinity))
            best.set("0.0.0.0/0.0.0.0", { code: "O*E2", network: "0.0.0.0", mask: "0.0.0.0", prefix: 0, ad: 110, metric, out: hops[0].out, nextHop: hops[0].nextHop, cost: dist.get(other.id)! });
        }
      }
      me.routes = [...best.values()];
    }
    this.ospfCache = state;
    return state;
  }

  // ---------- EtherChannel ----------

  /** Membres d'un EtherChannel : ceux qui forment réellement le lien agrégé avec le switch d'en face. */
  bundle(dev: Device, group: number): { all: Iface[]; members: Iface[]; protocol: "LACP" | "PAgP" | "-" } {
    const all = dev.ifaces.filter((i) => i.channel?.group === group);
    const proto = (m?: string) => (m === "active" || m === "passive" ? "LACP" : m === "desirable" || m === "auto" ? "PAgP" : "-");
    const compatible = (a: string, b: string) =>
      (a === "on" && b === "on") ||
      (proto(a) === "LACP" && proto(b) === "LACP" && (a === "active" || b === "active")) ||
      (proto(a) === "PAgP" && proto(b) === "PAgP" && (a === "desirable" || b === "desirable"));
    let peerDev: string | null = null;
    let peerGroup: number | null = null;
    const members: Iface[] = [];
    for (const m of all) {
      if (!m.adminUp) continue;
      const peer = this.peerOf(dev.id, m.name);
      if (!peer || !peer.iface.adminUp || !peer.iface.channel || !isSwitchLike(peer.dev)) continue;
      if (!compatible(m.channel!.mode, peer.iface.channel.mode)) continue;
      if (peerDev && (peer.dev.id !== peerDev || peer.iface.channel.group !== peerGroup)) continue;
      peerDev = peer.dev.id;
      peerGroup = peer.iface.channel.group;
      members.push(m);
    }
    return { all, members, protocol: proto(all[0]?.channel?.mode) as "LACP" | "PAgP" | "-" };
  }

  /** Nom logique d'un port : Port-channelN pour un membre agrégé, sinon le port lui-même. */
  logicalOf(dev: Device, iface: Iface): string {
    return iface.channel ? `Port-channel${iface.channel.group}` : iface.name;
  }

  /** Port physique qui transporte le trafic d'un port logique (premier membre actif d'un Port-channel). */
  physOf(dev: Device, logical: string): Iface | undefined {
    if (isPortChannel(logical)) return this.bundle(dev, Number(logical.slice(12))).members[0];
    return dev.ifaces.find((i) => i.name === logical);
  }

  /** Ports logiques de commutation d'un switch (les membres d'un même Port-channel comptent pour un). */
  logicalPorts(dev: Device): { name: string; phys: Iface }[] {
    const out: { name: string; phys: Iface }[] = [];
    const seen = new Set<number>();
    for (const i of dev.ifaces) {
      if (!this.isSwitchport(dev, i)) continue;
      if (i.channel) {
        if (seen.has(i.channel.group)) continue;
        seen.add(i.channel.group);
        const first = this.bundle(dev, i.channel.group).members[0];
        if (first) out.push({ name: `Port-channel${i.channel.group}`, phys: first });
        continue;
      }
      out.push({ name: i.name, phys: i });
    }
    return out;
  }

  // ---------- Spanning Tree (PVST+) ----------

  private stpCache: Map<string, Map<number, StpVlan>> | null = null;

  private bid(dev: Device, v: number) {
    return { prio: (dev.stp?.priorities?.[String(v)] ?? 32768) + v, mac: dev.svis?.[0]?.mac ?? "ffff.ffff.ffff" };
  }

  private portCost(dev: Device, logical: string, phys: Iface): number {
    if (phys.stpCost) return phys.stpCost;
    const base = phys.name.startsWith("FastEthernet") ? 19 : 4;
    if (isPortChannel(logical)) {
      const n = this.bundle(dev, Number(logical.slice(12))).members.length;
      if (n >= 2) return base === 19 ? 12 : 3;
    }
    return base;
  }

  private portNbr(dev: Device, logical: string): number {
    if (isPortChannel(logical)) return 64 + Number(logical.slice(12));
    return dev.ifaces.findIndex((i) => i.name === logical) + 1;
  }

  /** Calcule l'arbre de chaque VLAN : pont racine, ports racine, désignés et bloqués. */
  stpState(): Map<string, Map<number, StpVlan>> {
    if (this.stpCache) return this.stpCache;
    const result = new Map<string, Map<number, StpVlan>>();
    const switches = this.devices.filter((d) => isSwitchLike(d));
    const vlans = new Set<number>([1]);
    for (const d of switches) for (const v of d.vlans ?? []) vlans.add(v.id);
    const cmpBid = (a: { prio: number; mac: string }, b: { prio: number; mac: string }) => a.prio - b.prio || a.mac.localeCompare(b.mac);
    for (const v of vlans) {
      const members = switches.filter((d) => this.vlanExists(d, v));
      type End = { dev: Device; port: string; phys: Iface };
      const links: { a: End; b: End }[] = [];
      const edges = new Map<string, End[]>(); // ports vers des hôtes ou des routeurs
      for (const d of members) {
        for (const lp of this.logicalPorts(d)) {
          if (!this.physUp(d, lp.phys) || !this.portCarries(d, lp.phys, v)) continue;
          const peer = this.peerOf(d.id, lp.phys.name);
          const peerIsSw = peer && this.isSwitchport(peer.dev, peer.iface) && this.vlanExists(peer.dev, v) && this.portCarries(peer.dev, peer.iface, v);
          if (!peerIsSw) {
            edges.set(d.id, [...(edges.get(d.id) ?? []), { dev: d, port: lp.name, phys: lp.phys }]);
            continue;
          }
          const plog = this.logicalOf(peer!.dev, peer!.iface);
          if (isPortChannel(plog) && this.physOf(peer!.dev, plog) !== peer!.iface) continue; // le lien agrégé n'est compté qu'une fois
          if (d.id < peer!.dev.id) links.push({ a: { dev: d, port: lp.name, phys: lp.phys }, b: { dev: peer!.dev, port: plog, phys: peer!.iface } });
        }
      }
      // composantes connexes
      const adj = new Map<string, { me: End; other: End }[]>();
      for (const l of links) {
        adj.set(l.a.dev.id, [...(adj.get(l.a.dev.id) ?? []), { me: l.a, other: l.b }]);
        adj.set(l.b.dev.id, [...(adj.get(l.b.dev.id) ?? []), { me: l.b, other: l.a }]);
      }
      const visited = new Set<string>();
      for (const start of members) {
        if (visited.has(start.id)) continue;
        const comp: Device[] = [];
        const q = [start];
        visited.add(start.id);
        while (q.length) {
          const d = q.shift()!;
          comp.push(d);
          for (const e of adj.get(d.id) ?? []) if (!visited.has(e.other.dev.id)) (visited.add(e.other.dev.id), q.push(e.other.dev));
        }
        const root = comp.reduce((best, d) => (cmpBid(this.bid(d, v), this.bid(best, v)) < 0 ? d : best), comp[0]);
        // coût jusqu'à la racine (Dijkstra : coût du port qui reçoit)
        const dist = new Map<string, number>([[root.id, 0]]);
        const done = new Set<string>();
        while (true) {
          let cur: string | null = null;
          for (const [id, dd] of dist) if (!done.has(id) && (cur === null || dd < dist.get(cur)!)) cur = id;
          if (cur === null) break;
          done.add(cur);
          for (const e of adj.get(cur) ?? []) {
            const nd = dist.get(cur)! + this.portCost(e.other.dev, e.other.port, e.other.phys);
            if (!dist.has(e.other.dev.id) || nd < dist.get(e.other.dev.id)!) dist.set(e.other.dev.id, nd);
          }
        }
        const portId = (e: End) => ((e.phys.stpPrio ?? 128) << 16) + this.portNbr(e.dev, e.port);
        const rootPort = new Map<string, string>();
        for (const d of comp) {
          if (d === root) continue;
          let best: { key: number[]; port: string } | null = null;
          for (const e of adj.get(d.id) ?? []) {
            const ob = this.bid(e.other.dev, v);
            const key = [dist.get(e.other.dev.id)! + this.portCost(d, e.me.port, e.me.phys), ob.prio, parseInt(ob.mac.replace(/\./g, ""), 16), portId(e.other), portId(e.me)];
            if (!best || lexLess(key, best.key)) best = { key, port: e.me.port };
          }
          if (best) rootPort.set(d.id, best.port);
        }
        for (const d of comp) {
          const ports = new Map<string, StpPort>();
          for (const e of adj.get(d.id) ?? []) {
            const mine = [dist.get(d.id)!, this.bid(d, v).prio, parseInt(this.bid(d, v).mac.replace(/\./g, ""), 16), portId(e.me)];
            const theirs = [dist.get(e.other.dev.id)!, this.bid(e.other.dev, v).prio, parseInt(this.bid(e.other.dev, v).mac.replace(/\./g, ""), 16), portId(e.other)];
            const iWin = !lexLess(theirs, mine);
            const role: StpPort["role"] = rootPort.get(d.id) === e.me.port ? "Root" : iWin ? "Desg" : "Altn";
            ports.set(e.me.port, { role, state: role === "Altn" ? "BLK" : "FWD", cost: this.portCost(d, e.me.port, e.me.phys), prio: e.me.phys.stpPrio ?? 128, nbr: this.portNbr(d, e.me.port), edge: false });
          }
          for (const e of edges.get(d.id) ?? []) ports.set(e.port, { role: "Desg", state: "FWD", cost: this.portCost(d, e.port, e.phys), prio: e.phys.stpPrio ?? 128, nbr: this.portNbr(d, e.port), edge: true });
          const rp = rootPort.get(d.id);
          const byDev = result.get(d.id) ?? new Map<number, StpVlan>();
          byDev.set(v, { rootBid: this.bid(root, v), bid: this.bid(d, v), rootCost: dist.get(d.id) ?? 0, rootPort: rp, ports });
          result.set(d.id, byDev);
        }
      }
    }
    this.stpCache = result;
    return result;
  }

  /** Le port logique transmet-il dans ce VLAN (STP en état FWD) ? */
  stpForwarding(dev: Device, logical: string, v: number): boolean {
    const st = this.stpState().get(dev.id)?.get(v)?.ports.get(logical);
    return !st || st.state === "FWD";
  }

  /** Un port physique peut-il recevoir/émettre dans ce VLAN (EtherChannel + STP) ? */
  private portActive(dev: Device, iface: Iface, v: number): boolean {
    if (iface.channel) {
      const b = this.bundle(dev, iface.channel.group);
      if (!b.members.includes(iface)) return false; // membre suspendu
    }
    return this.stpForwarding(dev, this.logicalOf(dev, iface), v);
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
    if (isLoopback(name)) return;
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
    if (!this.vlanExists(sw, v) || !this.portActive(sw, iface, v)) return;
    if (!this.portSecurityOk(sw, iface, frame.src)) return;
    if (!this.snoopingOk(sw, iface, v, frame)) return;
    this.switchForward(sw, this.logicalOf(sw, iface), v, { ...frame, vlan: undefined });
  }

  // ---------- Sécurité des ports ----------

  private psecLearned = new Map<string, string[]>();
  private psecViolations = new Map<string, number>();

  /** Adresses MAC sécurisées d'un port (configurées, « sticky » et apprises). */
  secureMacs(dev: Device, iface: Iface): { mac: string; type: "SecureConfigured" | "SecureSticky" | "SecureDynamic" }[] {
    const cfg = (iface.psec?.macs ?? []).map((m) => ({ mac: m.replace(/^sticky:/, ""), type: m.startsWith("sticky:") ? ("SecureSticky" as const) : ("SecureConfigured" as const) }));
    const dyn = (this.psecLearned.get(`${dev.id}|${iface.name}`) ?? []).map((mac) => ({ mac, type: "SecureDynamic" as const }));
    return [...cfg, ...dyn];
  }

  psecViolationCount(dev: Device, iface: Iface): number {
    return this.psecViolations.get(`${dev.id}|${iface.name}`) ?? 0;
  }

  clearPsec(dev: Device, iface: Iface) {
    this.psecLearned.delete(`${dev.id}|${iface.name}`);
  }

  private portSecurityOk(sw: Device, iface: Iface, mac: string): boolean {
    const ps = iface.psec;
    if (!ps) return true;
    const known = this.secureMacs(sw, iface);
    if (known.some((k) => k.mac === mac)) return true;
    if (known.length < (ps.max ?? 1)) {
      if (ps.sticky) ps.macs = [...(ps.macs ?? []), `sticky:${mac}`];
      else this.psecLearned.set(`${sw.id}|${iface.name}`, [...(this.psecLearned.get(`${sw.id}|${iface.name}`) ?? []), mac]);
      return true;
    }
    const key = `${sw.id}|${iface.name}`;
    if ((ps.violation ?? "shutdown") !== "protect") this.psecViolations.set(key, (this.psecViolations.get(key) ?? 0) + 1);
    if ((ps.violation ?? "shutdown") === "shutdown") {
      iface.errdis = "psecure-violation";
      this.clearDynamic();
    }
    return false;
  }

  // ---------- DHCP snooping et DAI ----------

  private snoopBindings = new Map<string, { mac: string; ip: string; vlan: number; port: string }[]>();

  snoopingBindings(dev: Device) {
    return this.snoopBindings.get(dev.id) ?? [];
  }

  private snoopingOk(sw: Device, iface: Iface, v: number, frame: Frame): boolean {
    const snoop = sw.snooping?.enabled && sw.snooping.vlans.includes(v);
    if (snoop && frame.type === "ipv4" && frame.ip.dhcp) {
      const m = frame.ip.dhcp;
      const fromServer = m.op === "ack" || m.op === "nak";
      if (fromServer && !iface.dhcpTrust) return false; // serveur DHCP pirate sur un port non fiable
      if (fromServer && m.op === "ack" && m.yiaddr) {
        const port = this.macTables.get(sw.id)?.get(`${v}|${m.chaddr}`) ?? "?";
        const list = (this.snoopBindings.get(sw.id) ?? []).filter((b) => b.mac !== m.chaddr);
        list.push({ mac: m.chaddr, ip: m.yiaddr, vlan: v, port });
        this.snoopBindings.set(sw.id, list);
      }
    }
    if (frame.type === "arp" && sw.dai?.vlans.includes(v) && !iface.arpTrust) {
      const a = frame.arp;
      const ok = (this.snoopBindings.get(sw.id) ?? []).some((b) => b.mac === a.senderMac && b.ip === a.senderIp && b.vlan === v);
      if (!ok) {
        this.daiDrops.set(sw.id, (this.daiDrops.get(sw.id) ?? 0) + 1);
        return false;
      }
    }
    return true;
  }

  private daiDrops = new Map<string, number>();

  daiDropCount(dev: Device) {
    return this.daiDrops.get(dev.id) ?? 0;
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
    const outs = known ? [known] : this.logicalPorts(sw).map((l) => l.name);
    for (const p of outs) {
      if (p === inPort) continue;
      const iface = this.physOf(sw, p);
      if (!iface || !this.isSwitchport(sw, iface) || !this.portCarries(sw, iface, v) || !this.portActive(sw, iface, v)) continue;
      const tagged = this.opMode(sw, iface) === "trunk" && v !== (iface.nativeVlan ?? 1);
      this.emitPhys(sw, iface.name, { ...frame, vlan: tagged ? v : undefined });
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
    if (frame.dst !== BROADCAST_MAC && frame.dst !== iface.mac && !this.hsrpMacsOn(dev, name).includes(frame.dst)) return;
    if (frame.type === "arp") {
      const a = frame.arp;
      const virt = a.op === "req" ? (this.hsrpState().get(dev.id) ?? []).find((x) => x.iface === name && x.state === "Active" && x.vip === a.targetIp) : undefined;
      if (virt) {
        this.learnArp(dev, a.senderIp, a.senderMac, name);
        this.emitL3(dev, name, { src: virt.mac, dst: a.senderMac, type: "arp", arp: { op: "rep", senderIp: virt.vip!, senderMac: virt.mac, targetIp: a.senderIp } });
        return;
      }
      if (a.op === "req" && iface.ip && a.targetIp === iface.ip) {
        this.learnArp(dev, a.senderIp, a.senderMac, name);
        this.emitL3(dev, name, { src: iface.mac, dst: a.senderMac, type: "arp", arp: { op: "rep", senderIp: iface.ip, senderMac: iface.mac, targetIp: a.senderIp } });
      } else if (a.op === "rep" && a.targetIp === iface.ip) {
        this.learnArp(dev, a.senderIp, a.senderMac, name);
      }
      return;
    }
    if (frame.type === "ipv6") return this.receive6(dev, iface, frame);
    let pkt = frame.ip;
    // DHCP (diffusions UDP 67/68)
    if (pkt.dhcp && this.handleDhcp(dev, iface, pkt)) return;
    if (pkt.dst === IP_BROADCAST || (iface.ip && iface.mask && pkt.dst === broadcastOf(iface.ip, iface.mask))) return;
    // ACL en entrée
    if (iface.aclIn && !this.aclPermits(dev, iface.aclIn, pkt)) return this.unreachable(dev, iface, pkt);
    // NAT : retour de l'extérieur vers l'intérieur
    if (iface.nat === "outside" && dev.kind === "router") pkt = this.natIn(dev, pkt);
    if (this.ownsIp(dev, pkt.dst)) return this.deliverLocal(dev, pkt);
    if (!this.routes(dev)) return; // un PC ou un switch de couche 2 ne route pas
    if (pkt.ttl <= 1) {
      if (pkt.icmp?.type === "echo" && iface.ip) this.sendIp(dev, { src: iface.ip, dst: pkt.src, ttl: 255, proto: "icmp", icmp: { ...pkt.icmp, type: "ttl-exceeded" } });
      return;
    }
    this.sendIp(dev, { ...pkt, ttl: pkt.ttl - 1 }, iface);
  }

  /** Paquet destiné à l'équipement lui-même. */
  private deliverLocal(dev: Device, pkt: IpPacket) {
    if (pkt.proto === "icmp" && pkt.icmp) {
      if (pkt.icmp.type === "echo") {
        this.sendIp(dev, { src: pkt.dst, dst: pkt.src, ttl: this.initialTtl(dev), proto: "icmp", icmp: { ...pkt.icmp, type: "reply" } });
      } else {
        const box = this.inbox.get(dev.id) ?? [];
        box.push({ ...pkt.icmp, from: pkt.src, ttl: pkt.ttl });
        this.inbox.set(dev.id, box);
      }
      return;
    }
    if (pkt.proto === "tcp" && pkt.tcp) {
      if (pkt.tcp.flag === "syn") {
        // Un équipement réseau accepte telnet (23) et ssh (22) ; un PC accepte le web (80/443) s'il joue le rôle de serveur
        const open = dev.kind === "pc" ? [80, 443, 21] : [22, 23];
        this.sendIp(dev, { src: pkt.dst, dst: pkt.src, ttl: this.initialTtl(dev), proto: "tcp", sport: pkt.dport, dport: pkt.sport, tcp: { flag: open.includes(pkt.dport ?? 0) ? "synack" : "rst", id: pkt.tcp.id } });
      } else {
        const box = this.tcpInbox.get(dev.id) ?? [];
        box.push({ id: pkt.tcp.id, flag: pkt.tcp.flag, from: pkt.src });
        this.tcpInbox.set(dev.id, box);
      }
    }
  }

  /** ICMP « destination injoignable » (ACL ou absence de route), limité comme sur IOS : U.U.U */
  private unreachable(dev: Device, via: Iface | undefined, pkt: IpPacket) {
    if (!this.routes(dev) || !via?.ip || pkt.proto === "icmp" && pkt.icmp?.type !== "echo") return;
    const k = this.unreachToggle.get(dev.id) ?? 0;
    this.unreachToggle.set(dev.id, k + 1);
    if (k % 2) return;
    if (pkt.proto === "icmp") this.sendIp(dev, { src: via.ip, dst: pkt.src, ttl: 255, proto: "icmp", icmp: { ...pkt.icmp!, type: "unreachable" } });
    else if (pkt.tcp) this.sendIp(dev, { src: via.ip, dst: pkt.src, ttl: 255, proto: "icmp", icmp: { type: "unreachable", id: -pkt.tcp.id, seq: 0 } });
  }

  // ---------- ACL ----------

  private aclPermits(dev: Device, name: string, pkt: IpPacket): boolean {
    const acl = dev.acls?.find((a) => a.name === name);
    if (!acl) return true; // ACL appliquée mais inexistante : tout passe (comme sur IOS)
    const rule = firstMatch(acl, { src: pkt.src, dst: pkt.dst, proto: pkt.proto, sport: pkt.sport ?? pkt.icmp?.id, dport: pkt.dport, icmpType: pkt.icmp ? { echo: "echo", reply: "echo-reply", unreachable: "unreachable", "ttl-exceeded": "time-exceeded" }[pkt.icmp.type] : undefined });
    if (rule) {
      const key = `${dev.id}|${name}|${rule.seq}`;
      this.aclHits.set(key, (this.aclHits.get(key) ?? 0) + 1);
    }
    return rule?.action === "permit";
  }

  aclMatches(dev: Device, name: string, seq: number): number {
    return this.aclHits.get(`${dev.id}|${name}|${seq}`) ?? 0;
  }

  clearAclCounters(dev: Device) {
    for (const k of [...this.aclHits.keys()]) if (k.startsWith(`${dev.id}|`)) this.aclHits.delete(k);
  }

  // ---------- NAT / PAT ----------

  private natTables = new Map<string, NatEntry[]>();

  natTable(dev: Device): NatEntry[] {
    const statics: NatEntry[] = (dev.nat?.statics ?? []).map((s) => ({ proto: "---", insideLocal: s.local, insideGlobal: s.global, static: true }));
    return [...statics, ...(this.natTables.get(dev.id) ?? [])];
  }

  clearNat(dev: Device) {
    this.natTables.delete(dev.id);
  }

  /** Paquet venant de l'extérieur : adresse (et port) globale -> locale. */
  private natIn(dev: Device, pkt: IpPacket): IpPacket {
    const port = pkt.proto === "icmp" ? pkt.icmp?.id : pkt.dport;
    const dyn = (this.natTables.get(dev.id) ?? []).find((e) => e.insideGlobal === pkt.dst && (e.globalPort === undefined || e.globalPort === port) && (e.proto === pkt.proto || e.globalPort === undefined));
    if (dyn) {
      if (dyn.globalPort === undefined) return { ...pkt, dst: dyn.insideLocal };
      return pkt.proto === "icmp" ? { ...pkt, dst: dyn.insideLocal, icmp: { ...pkt.icmp!, id: dyn.localPort! } } : { ...pkt, dst: dyn.insideLocal, dport: dyn.localPort };
    }
    const st = dev.nat?.statics.find((s) => s.global === pkt.dst);
    return st ? { ...pkt, dst: st.local } : pkt;
  }

  /** Paquet de l'intérieur qui sort : adresse (et port avec PAT) locale -> globale. */
  private natOut(dev: Device, pkt: IpPacket, out: Iface): IpPacket {
    const nat = dev.nat;
    if (!nat) return pkt;
    const st = nat.statics.find((s) => s.local === pkt.src);
    if (st) return { ...pkt, src: st.global };
    const table = this.natTables.get(dev.id) ?? [];
    this.natTables.set(dev.id, table);
    const port = pkt.proto === "icmp" ? pkt.icmp?.id : pkt.sport;
    for (const rule of nat.rules) {
      if (!this.aclPermitsQuiet(dev, rule.acl, pkt.src)) continue;
      // Traduction déjà existante ?
      const existing = table.find((e) => e.insideLocal === pkt.src && (e.localPort === undefined ? !rule.overload : e.localPort === port && e.proto === pkt.proto));
      let entry = existing;
      if (!entry) {
        let global: string | undefined;
        if (rule.iface) global = this.findIface(dev, rule.iface)?.ip;
        else {
          const pool = nat.pools.find((p) => p.name === rule.pool);
          if (pool) {
            const used = new Set(table.filter((e) => e.localPort === undefined).map((e) => e.insideGlobal));
            for (let n = ipToInt(pool.start)!; n <= ipToInt(pool.end)!; n++) {
              const cand = intToIp(n);
              if (rule.overload || !used.has(cand)) {
                global = cand;
                break;
              }
            }
          }
        }
        if (!global) return pkt; // pool épuisé : pas de traduction (paquet envoyé tel quel)
        if (rule.overload) {
          let gp = port ?? 1024;
          while (table.some((e) => e.insideGlobal === global && e.globalPort === gp && e.proto === pkt.proto)) gp = gp < 1024 ? 1024 : gp + 1;
          entry = { proto: pkt.proto, insideLocal: pkt.src, insideGlobal: global, localPort: port, globalPort: gp, outside: pkt.dst };
        } else entry = { proto: "---", insideLocal: pkt.src, insideGlobal: global };
        table.push(entry);
      }
      if (entry.globalPort === undefined) return { ...pkt, src: entry.insideGlobal };
      return pkt.proto === "icmp" ? { ...pkt, src: entry.insideGlobal, icmp: { ...pkt.icmp!, id: entry.globalPort } } : { ...pkt, src: entry.insideGlobal, sport: entry.globalPort };
    }
    void out;
    return pkt;
  }

  private aclPermitsQuiet(dev: Device, name: string, src: string): boolean {
    const acl = dev.acls?.find((a) => a.name === name);
    if (!acl) return false;
    return firstMatch(acl, { src, dst: "0.0.0.0", proto: "icmp" })?.action === "permit";
  }

  // ---------- DHCP ----------

  private dhcpInbox = new Map<string, DhcpMsg>();

  /** Traite un message DHCP reçu. Renvoie true s'il a été consommé. */
  private handleDhcp(dev: Device, iface: Iface, pkt: IpPacket): boolean {
    const m = pkt.dhcp!;
    if (m.op === "discover") {
      const toMe = pkt.dst === IP_BROADCAST || this.ownsIp(dev, pkt.dst);
      if (!toMe || dev.kind === "pc" || dev.kind === "switch") return true; // seuls les équipements de couche 3 servent ou relaient
      const subnetIp = m.giaddr ?? iface.ip;
      const pool = subnetIp ? (dev.dhcpPools ?? []).find((p) => p.network && p.mask && sameSubnet(p.network, subnetIp, p.mask)) : undefined;
      if (pool) {
        const ack = this.dhcpOffer(dev, pool, m);
        if (m.giaddr) this.sendIp(dev, { src: iface.ip ?? "", dst: m.giaddr, ttl: 255, proto: "udp", sport: 67, dport: 67, dhcp: ack });
        else this.emitL3(dev, iface.name, { src: iface.mac, dst: m.chaddr, type: "ipv4", ip: { src: iface.ip ?? "0.0.0.0", dst: IP_BROADCAST, ttl: 255, proto: "udp", sport: 67, dport: 68, dhcp: ack } });
        return true;
      }
      // Relais (ip helper-address) : seulement pour une diffusion reçue sur l'interface
      if (pkt.dst === IP_BROADCAST && iface.ip && iface.helpers?.length && this.routes(dev)) {
        for (const h of iface.helpers) this.sendIp(dev, { src: iface.ip, dst: h, ttl: 255, proto: "udp", sport: 67, dport: 67, dhcp: { ...m, giaddr: iface.ip } });
      }
      return true;
    }
    // Réponse du serveur
    if (m.chaddr === iface.mac && (pkt.dst === IP_BROADCAST || pkt.dst === iface.ip)) {
      this.dhcpInbox.set(`${dev.id}|${m.xid}`, m);
      return true;
    }
    // Relais : réponse du serveur à renvoyer vers le client
    if (this.ownsIp(dev, pkt.dst) && m.giaddr) {
      const back = this.l3Ifaces(dev).find((i) => i.ip === m.giaddr);
      if (back) this.emitL3(dev, back.name, { src: back.mac, dst: m.chaddr, type: "ipv4", ip: { src: back.ip!, dst: IP_BROADCAST, ttl: 255, proto: "udp", sport: 67, dport: 68, dhcp: m } });
      return true;
    }
    return pkt.dst === IP_BROADCAST;
  }

  /** Choisit une adresse libre dans le pool (ou celle déjà attribuée au client). */
  private dhcpOffer(dev: Device, pool: DhcpPool, m: DhcpMsg): DhcpMsg {
    const leases = (dev.dhcpLeases ??= []);
    const mine = leases.find((l) => l.mac === m.chaddr && l.pool === pool.name);
    const server = this.l3Ifaces(dev).find((i) => i.ip)?.ip;
    const base = { xid: m.xid, chaddr: m.chaddr, giaddr: m.giaddr, mask: pool.mask, router: pool.router, dns: pool.dns, server };
    if (mine) return { op: "ack", yiaddr: mine.ip, ...base };
    const net = ipToInt(networkOf(pool.network!, pool.mask!))!;
    const bc = ipToInt(broadcastOf(pool.network!, pool.mask!))!;
    const excluded = (n: number) => (dev.dhcpExcluded ?? []).some(([a, b]) => n >= ipToInt(a)! && n <= ipToInt(b)!);
    const taken = new Set([...leases.map((l) => l.ip), ...this.l3Ifaces(dev).map((i) => i.ip).filter(Boolean)]);
    for (let n = net + 1; n < bc; n++) {
      const ip = intToIp(n);
      if (excluded(n) || taken.has(ip) || ip === pool.router) continue;
      leases.push({ ip, mac: m.chaddr, pool: pool.name });
      return { op: "ack", yiaddr: ip, ...base };
    }
    return { op: "nak", ...base };
  }

  /**
   * Le client (PC ou interface « ip address dhcp ») demande une adresse :
   * diffusion DHCP sur le réseau, réponse d'un serveur local ou relayée.
   */
  dhcpRequest(dev: Device, ifaceName: string): DhcpMsg | null {
    const iface = this.findIface(dev, ifaceName);
    if (!iface || !this.isUp(dev, iface)) return null;
    const xid = this.icmpId++;
    iface.ip = iface.mask = undefined;
    this.arp.delete(dev.id); // seules les entrées du client sont oubliées
    this.emitL3(dev, iface.name, { src: iface.mac, dst: BROADCAST_MAC, type: "ipv4", ip: { src: "0.0.0.0", dst: IP_BROADCAST, ttl: 64, proto: "udp", sport: 68, dport: 67, dhcp: { op: "discover", xid, chaddr: iface.mac } } });
    this.run();
    const ack = this.dhcpInbox.get(`${dev.id}|${xid}`);
    this.dhcpInbox.delete(`${dev.id}|${xid}`);
    if (!ack || ack.op !== "ack" || !ack.yiaddr) return ack ?? null;
    iface.ip = ack.yiaddr;
    iface.mask = ack.mask;
    if (dev.kind === "pc") {
      dev.gateway = ack.router;
      dev.dns = ack.dns;
    }
    this.arp.delete(dev.id);
    return ack;
  }

  /** Rend l'adresse (ipconfig /release). */
  dhcpRelease(dev: Device, ifaceName: string) {
    const iface = this.findIface(dev, ifaceName);
    if (!iface) return;
    for (const d of this.devices) d.dhcpLeases = d.dhcpLeases?.filter((l) => l.mac !== iface.mac || l.ip !== iface.ip);
    iface.ip = iface.mask = undefined;
    if (dev.kind === "pc") dev.gateway = dev.dns = undefined;
    this.clearDynamic();
  }

  private learnArp(dev: Device, ip: string, mac: string, port: string) {
    let t = this.arp.get(dev.id);
    if (!t) this.arp.set(dev.id, (t = new Map()));
    t.set(ip, { mac, port });
  }

  private initialTtl(dev: Device) {
    return dev.kind === "pc" ? 128 : 255;
  }

  /**
   * Envoie un paquet IP : routage, NAT, ACL de sortie puis résolution ARP.
   * « from » = interface d'entrée quand le paquet est routé (absent s'il est émis par l'équipement).
   * Retourne false si le paquet est perdu.
   */
  private sendIp(dev: Device, pkt: IpPacket, from?: Iface): boolean {
    const r = this.route(dev, pkt.dst);
    if (!r) {
      if (from) this.unreachable(dev, from, pkt);
      return false;
    }
    let out = { ...pkt, src: pkt.src || r.out.ip! };
    if (from) {
      if (from.nat === "inside" && r.out.nat === "outside") out = this.natOut(dev, out, r.out);
      if (r.out.aclOut && !this.aclPermits(dev, r.out.aclOut, out)) {
        this.unreachable(dev, from, pkt);
        return false;
      }
    }
    const entry = this.arp.get(dev.id)?.get(r.nextHop);
    if (!entry) {
      // Pas d'entrée ARP : on envoie une requête et le paquet est perdu (le « . » du premier ping)
      this.emitL3(dev, r.out.name, { src: r.out.mac, dst: BROADCAST_MAC, type: "arp", arp: { op: "req", senderIp: r.out.ip!, senderMac: r.out.mac, targetIp: r.nextHop } });
      return false;
    }
    this.emitL3(dev, r.out.name, { src: r.out.mac, dst: entry.mac, type: "ipv4", ip: out });
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

  // ---------- IPv6 ----------

  private nd = new Map<string, Map<string, { mac: string; port: string }>>();
  private raInbox = new Map<string, { router: string; prefixes: { prefix: string; len: number }[] }>();

  /** Adresses IPv6 d'une interface : link-local (si IPv6 est actif) puis globales. */
  v6Addrs(iface: Iface): { addr: string; len: number; ll: boolean }[] {
    const on = !!iface.ipv6?.length || iface.ipv6Enabled || iface.ipv6Autoconfig;
    if (!on) return [];
    return [{ addr: iface.ll ?? linkLocal(iface.mac), len: 64, ll: true }, ...(iface.ipv6 ?? []).map((a) => ({ addr: a.addr, len: a.len, ll: false }))];
  }

  routes6Enabled(dev: Device): boolean {
    return (dev.kind === "router" || dev.kind === "l3switch") && !!dev.ipv6Routing;
  }

  ndTable(dev: Device) {
    return [...(this.nd.get(dev.id) ?? new Map()).entries()].map(([addr, e]) => ({ addr, mac: e.mac, port: e.port }));
  }

  private owns6(dev: Device, addr: string, on?: Iface): boolean {
    const ifs = on ? [on] : this.l3Ifaces(dev);
    return ifs.some((i) => this.isUp(dev, i) && this.v6Addrs(i).some((a) => a.addr === addr));
  }

  /** Routes IPv6 utilisables : connectées, locales, statiques. */
  candidates6(dev: Device): { code: string; prefix: string; len: number; ad: number; out: Iface | null; nextHop: string | null }[] {
    const out: { code: string; prefix: string; len: number; ad: number; out: Iface | null; nextHop: string | null }[] = [];
    for (const i of this.l3Ifaces(dev)) {
      if (!this.isUp(dev, i)) continue;
      for (const a of i.ipv6 ?? []) {
        out.push({ code: "C", prefix: network6(a.addr, a.len), len: a.len, ad: 0, out: i, nextHop: null });
        out.push({ code: "L", prefix: a.addr, len: 128, ad: 0, out: i, nextHop: null });
      }
    }
    for (const r of dev.routes6 ?? []) {
      let o: Iface | undefined;
      if (r.iface) o = this.l3Ifaces(dev).find((i) => i.name === r.iface);
      else if (r.nextHop && !isLinkLocal6(r.nextHop)) o = this.l3Ifaces(dev).find((i) => this.isUp(dev, i) && (i.ipv6 ?? []).some((a) => inPrefix6(r.nextHop!, a.addr, a.len)));
      if (o && this.isUp(dev, o) && this.v6Addrs(o).length) out.push({ code: "S", prefix: network6(r.prefix, r.len), len: r.len, ad: r.ad ?? 1, out: o, nextHop: r.nextHop ?? null });
    }
    return out;
  }

  private route6(dev: Device, dst: string): { out: Iface; nextHop: string } | null {
    const ifs = this.l3Ifaces(dev).filter((i) => this.isUp(dev, i) && this.v6Addrs(i).length);
    if (!this.routes6Enabled(dev)) {
      if (!ifs.length) return null;
      if (isLinkLocal6(dst)) return { out: ifs[0], nextHop: dst };
      const local = ifs.find((i) => (i.ipv6 ?? []).some((a) => inPrefix6(dst, a.addr, a.len)));
      if (local) return { out: local, nextHop: dst };
      return dev.gateway6 ? { out: ifs[0], nextHop: dev.gateway6 } : null;
    }
    if (isLinkLocal6(dst)) return null; // une adresse link-local n'est jamais routée
    let best: { out: Iface; nextHop: string; len: number; ad: number } | null = null;
    for (const c of this.candidates6(dev)) {
      if (c.code === "L" || !c.out || !inPrefix6(dst, c.prefix, c.len)) continue;
      if (!best || c.len > best.len || (c.len === best.len && c.ad < best.ad)) best = { out: c.out, nextHop: c.nextHop ?? dst, len: c.len, ad: c.ad };
    }
    return best ? { out: best.out, nextHop: best.nextHop } : null;
  }

  private srcFor6(out: Iface, dst: string): string {
    const addrs = this.v6Addrs(out);
    return (isLinkLocal6(dst) ? addrs.find((a) => a.ll) : addrs.find((a) => !a.ll) ?? addrs[0])?.addr ?? "::";
  }

  private sendIp6(dev: Device, pkt: Ip6Packet, from?: Iface): boolean {
    const r = this.route6(dev, pkt.dst);
    if (!r) return false;
    const out = { ...pkt, src: pkt.src || this.srcFor6(r.out, pkt.dst) };
    const entry = this.nd.get(dev.id)?.get(r.nextHop);
    if (!entry) {
      this.emitL3(dev, r.out.name, { src: r.out.mac, dst: BROADCAST_MAC, type: "ipv6", ip6: { src: this.srcFor6(r.out, r.nextHop), dst: "ff02::1", hop: 255, nd: { op: "ns", target: r.nextHop, mac: r.out.mac } } });
      return false;
    }
    void from;
    this.emitL3(dev, r.out.name, { src: r.out.mac, dst: entry.mac, type: "ipv6", ip6: out });
    return true;
  }

  private learnNd(dev: Device, addr: string, mac: string, port: string) {
    let t = this.nd.get(dev.id);
    if (!t) this.nd.set(dev.id, (t = new Map()));
    t.set(addr, { mac, port });
  }

  private receive6(dev: Device, iface: Iface, frame: Frame & { type: "ipv6" }) {
    const p = frame.ip6;
    const mine = this.v6Addrs(iface);
    if (!mine.length) return;
    if (p.nd) {
      const nd = p.nd;
      if (nd.op === "ns" && nd.target && mine.some((a) => a.addr === nd.target)) {
        this.learnNd(dev, p.src, nd.mac, iface.name);
        this.emitL3(dev, iface.name, { src: iface.mac, dst: nd.mac, type: "ipv6", ip6: { src: nd.target, dst: p.src, hop: 255, nd: { op: "na", target: nd.target, mac: iface.mac } } });
      } else if (nd.op === "na" && nd.target) this.learnNd(dev, nd.target, nd.mac, iface.name);
      else if (nd.op === "rs" && this.routes6Enabled(dev) && iface.ipv6?.length) {
        const ll = mine.find((a) => a.ll)!.addr;
        const prefixes = (iface.ipv6 ?? []).filter((a) => a.len === 64).map((a) => ({ prefix: network6(a.addr, 64), len: 64 }));
        this.emitL3(dev, iface.name, { src: iface.mac, dst: nd.mac, type: "ipv6", ip6: { src: ll, dst: p.src, hop: 255, nd: { op: "ra", mac: iface.mac, prefixes } } });
      } else if (nd.op === "ra") {
        this.learnNd(dev, p.src, nd.mac, iface.name);
        this.raInbox.set(`${dev.id}|${iface.name}`, { router: p.src, prefixes: nd.prefixes ?? [] });
      }
      return;
    }
    if (this.owns6(dev, p.dst)) {
      if (p.icmp?.type === "echo") this.sendIp6(dev, { src: p.dst, dst: p.src, hop: dev.kind === "pc" ? 128 : 64, icmp: { ...p.icmp, type: "reply" } });
      else if (p.icmp) {
        const box = this.inbox.get(dev.id) ?? [];
        box.push({ ...p.icmp, from: p.src, ttl: p.hop });
        this.inbox.set(dev.id, box);
      }
      return;
    }
    if (!this.routes6Enabled(dev)) return;
    if (p.hop <= 1) {
      const src = this.srcFor6(iface, p.src);
      if (p.icmp?.type === "echo") this.sendIp6(dev, { src, dst: p.src, hop: 64, icmp: { ...p.icmp, type: "ttl-exceeded" } });
      return;
    }
    this.sendIp6(dev, { ...p, hop: p.hop - 1 }, iface);
  }

  private prepareNd(dev: Device, dst: string) {
    if (this.routes6Enabled(dev)) return;
    const r = this.route6(dev, dst);
    if (!r || this.nd.get(dev.id)?.has(r.nextHop)) return;
    this.emitL3(dev, r.out.name, { src: r.out.mac, dst: BROADCAST_MAC, type: "ipv6", ip6: { src: this.srcFor6(r.out, r.nextHop), dst: "ff02::1", hop: 255, nd: { op: "ns", target: r.nextHop, mac: r.out.mac } } });
    this.run();
  }

  ping6(dev: Device, dst: string, count = 5): { ok: boolean; ttl?: number; from?: string; kind?: IcmpType }[] {
    const target = expand6(dst);
    const results: { ok: boolean; ttl?: number; from?: string; kind?: IcmpType }[] = [];
    if (!target) return results;
    for (let seq = 0; seq < count; seq++) {
      const id = this.icmpId++;
      this.inbox.set(dev.id, []);
      if (this.owns6(dev, target)) {
        results.push({ ok: true, ttl: 64, from: target });
        continue;
      }
      this.prepareNd(dev, target);
      this.sendIp6(dev, { src: "", dst: target, hop: dev.kind === "pc" ? 128 : 64, icmp: { type: "echo", id, seq } });
      this.run();
      const reply = (this.inbox.get(dev.id) ?? []).find((m) => m.id === id);
      results.push(reply ? { ok: reply.type === "reply", ttl: reply.ttl, from: reply.from, kind: reply.type } : { ok: false });
    }
    return results;
  }

  traceroute6(dev: Device, dst: string, maxHops = 15): (string | null)[] {
    const target = expand6(dst);
    const hops: (string | null)[] = [];
    if (!target) return hops;
    for (let hop = 1; hop <= maxHops; hop++) {
      let found: string | null = null;
      let done = false;
      for (let attempt = 0; attempt < 2 && !found; attempt++) {
        const id = this.icmpId++;
        this.inbox.set(dev.id, []);
        this.prepareNd(dev, target);
        this.sendIp6(dev, { src: "", dst: target, hop, icmp: { type: "echo", id, seq: hop } });
        this.run();
        const m = (this.inbox.get(dev.id) ?? []).find((x) => x.id === id);
        if (m) {
          found = m.from;
          done = m.type === "reply";
        }
      }
      hops.push(found);
      if (done) break;
    }
    return hops;
  }

  /** SLAAC : sollicitation de routeur, puis adresse = préfixe annoncé + EUI-64 et passerelle = routeur. */
  slaac(dev: Device, ifaceName: string): { addrs: string[]; router: string } | null {
    const iface = this.findIface(dev, ifaceName);
    if (!iface || !this.isUp(dev, iface)) return null;
    iface.ipv6Autoconfig = true;
    iface.ipv6 = (iface.ipv6 ?? []).filter((a) => !a.auto);
    this.raInbox.delete(`${dev.id}|${iface.name}`);
    const ll = this.v6Addrs(iface)[0].addr;
    this.emitL3(dev, iface.name, { src: iface.mac, dst: BROADCAST_MAC, type: "ipv6", ip6: { src: ll, dst: "ff02::2", hop: 255, nd: { op: "rs", mac: iface.mac } } });
    this.run();
    const ra = this.raInbox.get(`${dev.id}|${iface.name}`);
    if (!ra) return null;
    const addrs = ra.prefixes.map((p) => withEui64(p.prefix, iface.mac));
    iface.ipv6 = [...(iface.ipv6 ?? []), ...addrs.map((addr) => ({ addr, len: 64, eui: true, auto: true }))];
    if (dev.kind === "pc") dev.gateway6 = ra.router;
    return { addrs, router: ra.router };
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
      this.sendIp(dev, { src: "", dst, ttl: this.initialTtl(dev), proto: "icmp", icmp: { type: "echo", id, seq } });
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
        this.sendIp(dev, { src: "", dst, ttl, proto: "icmp", icmp: { type: "echo", id, seq: ttl } });
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

  /** Adresse source utilisée pour joindre une destination (pour access-class). */
  sourceIpFor(dev: Device, dst: string): string | null {
    return this.route(dev, dst)?.out.ip ?? null;
  }

  /** Essai de connexion TCP (telnet, ssh, http…) : ouvert, refusé, bloqué par une ACL ou sans réponse. */
  tcpConnect(dev: Device, dst: string, port: number): "open" | "refused" | "filtered" | "timeout" {
    if (!isIp(dst)) return "timeout";
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = this.icmpId++;
      this.tcpInbox.set(dev.id, []);
      this.inbox.set(dev.id, []);
      this.prepareArp(dev, dst);
      this.sendIp(dev, { src: "", dst, ttl: this.initialTtl(dev), proto: "tcp", sport: 49152 + (id % 16000), dport: port, tcp: { flag: "syn", id } });
      this.run();
      const r = (this.tcpInbox.get(dev.id) ?? []).find((m) => m.id === id);
      if (r) return r.flag === "synack" ? "open" : "refused";
      if ((this.inbox.get(dev.id) ?? []).some((m) => m.type === "unreachable" && m.id === -id)) return "filtered";
    }
    return "timeout";
  }

  // ---------- Journal (show logging) ----------

  private logs = new Map<string, string[]>();

  log(dev: Device, lines: string[]) {
    this.logs.set(dev.id, [...(this.logs.get(dev.id) ?? []), ...lines].slice(-200));
  }

  logOf(dev: Device): string[] {
    return this.logs.get(dev.id) ?? [];
  }

  clearLog(dev: Device) {
    this.logs.delete(dev.id);
  }

  // ---------- Redémarrage ----------

  /** Champs de configuration d'un équipement (ce que « copy run start » sauvegarde). */
  static configOf(dev: Device): string {
    const { id: _i, x: _x, y: _y, saved: _s, startup: _st, ...cfg } = dev;
    return JSON.stringify(cfg);
  }

  /** « reload » : la configuration sauvegardée remplace la configuration en cours (ou réglages d'usine). */
  reloadDevice(dev: Device) {
    const fresh = (() => {
      if (dev.saved) return JSON.parse(dev.saved) as Partial<Device>;
      const tmp = new Network();
      const f = tmp.addDevice(dev.kind, 0, 0, dev.model);
      // garde les adresses MAC d'origine
      f.ifaces = f.ifaces.map((i, k) => ({ ...i, mac: dev.ifaces[k]?.mac ?? i.mac }));
      if (f.svis && dev.svis?.[0]) f.svis[0].mac = dev.svis[0].mac;
      const { id: _i, x: _x, y: _y, ...cfg } = f;
      return { ...cfg, hostname: f.hostname.replace(/\d+$/, "") === dev.hostname.replace(/\d+$/, "") ? dev.hostname : f.hostname } as Partial<Device>;
    })();
    const keep = { id: dev.id, x: dev.x, y: dev.y, saved: dev.saved, startup: dev.startup };
    for (const k of Object.keys(dev) as (keyof Device)[]) delete (dev as Record<string, unknown>)[k];
    Object.assign(dev, fresh, keep);
    if (!dev.saved) dev.hostname = { router: "Router", switch: "Switch", l3switch: "Switch", pc: dev.hostname }[dev.kind];
    this.clearDynamic();
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

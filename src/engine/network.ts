// Moteur réseau de KoraLab : équipements, câbles, commutation Ethernet, ARP, routage IPv4 et ICMP.
// Tout est simulé dans le navigateur, de façon déterministe (pas de vrai temps).

import { BROADCAST_MAC, ipToInt, isIp, makeMac, maskToPrefix, networkOf, sameSubnet } from "./ip";

export type DeviceKind = "router" | "switch" | "pc";

export type Iface = {
  name: string; // nom complet : GigabitEthernet0/0/0
  mac: string;
  ip?: string;
  mask?: string;
  adminUp: boolean;
  description: string;
};

export type StaticRoute = { network: string; mask: string; nextHop?: string; iface?: string };

export type Device = {
  id: string;
  kind: DeviceKind;
  model: string;
  hostname: string;
  x: number;
  y: number;
  ifaces: Iface[];
  /** Interface virtuelle de gestion (switch : Vlan1) */
  svi?: Iface;
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
type Frame = { src: string; dst: string; type: "arp"; arp: ArpPayload } | { src: string; dst: string; type: "ipv4"; ip: IpPacket };

/** Une « interface L3 » : interface de routeur, carte réseau de PC ou SVI de switch. */
type L3If = { dev: Device; iface: Iface; port: string };

export const SVI = "Vlan1";

const MODELS: Record<DeviceKind, string> = { router: "KR-4300", switch: "KS-24", pc: "PC" };

function makeIfaces(kind: DeviceKind, seed: () => number): Iface[] {
  const mk = (name: string, adminUp: boolean): Iface => ({ name, mac: makeMac(seed()), adminUp, description: "" });
  if (kind === "router") return [0, 1, 2].map((i) => mk(`GigabitEthernet0/0/${i}`, false)); // éteintes par défaut, comme en vrai
  if (kind === "switch")
    return [
      ...Array.from({ length: 24 }, (_, i) => mk(`FastEthernet0/${i + 1}`, true)),
      mk("GigabitEthernet0/1", true),
      mk("GigabitEthernet0/2", true),
    ];
  return [mk("FastEthernet0", true)];
}

/** Abréviation d'un nom d'interface : GigabitEthernet0/0/0 -> Gi0/0/0 */
export function shortIf(name: string): string {
  return name.replace(/^GigabitEthernet/, "Gi").replace(/^FastEthernet/, "Fa").replace(/^Vlan/, "Vl");
}

/** Résout un nom tapé par l'utilisateur (g0/0/0, fa 0/1, vlan 1…) vers une interface existante. */
export function resolveIfaceName(dev: Device, raw: string): string | null {
  const s = raw.replace(/\s+/g, "").toLowerCase();
  const m = s.match(/^([a-z]+)(\d+(?:\/\d+)*)$/);
  if (!m) return null;
  const [, typed, num] = m;
  const types: [string, string][] = [
    ["gigabitethernet", "GigabitEthernet"],
    ["fastethernet", "FastEthernet"],
    ["vlan", "Vlan"],
  ];
  for (const [full, canon] of types) {
    if (full.startsWith(typed)) {
      const name = `${canon}${num}`;
      if (canon === "Vlan") return dev.kind === "switch" && num === "1" ? SVI : null;
      if (dev.ifaces.some((i) => i.name === name)) return name;
    }
  }
  return null;
}

export class Network {
  devices: Device[] = [];
  links: Link[] = [];
  private macSeed = 1;
  private nextId = 1;
  /** Tables dynamiques (non sauvegardées) */
  private arp = new Map<string, Map<string, { mac: string; port: string }>>();
  private macTables = new Map<string, Map<string, string>>();
  private inbox = new Map<string, { type: IcmpType; id: number; seq: number; from: string; ttl: number }[]>();
  private icmpId = 1;

  // ---------- Construction ----------

  addDevice(kind: DeviceKind, x = 0, y = 0): Device {
    const prefix = kind === "router" ? "R" : kind === "switch" ? "S" : "PC";
    let n = 1;
    while (this.devices.some((d) => d.hostname === `${prefix}${n}`)) n++;
    const dev: Device = {
      id: `d${this.nextId++}`,
      kind,
      model: MODELS[kind],
      hostname: `${prefix}${n}`,
      x,
      y,
      ifaces: makeIfaces(kind, () => this.macSeed++),
      routes: [],
      extra: [],
    };
    if (kind === "switch") dev.svi = { name: SVI, mac: makeMac(this.macSeed++), adminUp: false, description: "" };
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

  private freeIface(dev: Device, peerKind: DeviceKind): string | null {
    const used = new Set(this.links.flatMap((l) => [l.a, l.b]).filter((e) => e.dev === dev.id).map((e) => e.iface));
    const free = dev.ifaces.filter((i) => !used.has(i.name));
    if (dev.kind === "switch" && peerKind !== "pc") {
      // liaisons montantes (vers routeur ou switch) : d'abord les ports Gigabit
      const gig = free.find((i) => i.name.startsWith("Gigabit"));
      if (gig) return gig.name;
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
    const link: Link = { id: `l${this.nextId++}`, a: { dev: a.id, iface: ai }, b: { dev: b.id, iface: bi } };
    this.links.push(link);
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

  /** État « up/up » d'une interface physique : activée, câblée, et l'autre bout activé. */
  isUp(dev: Device, iface: Iface): boolean {
    if (iface.name === SVI) return iface.adminUp && dev.ifaces.some((i) => this.isUp(dev, i));
    if (!iface.adminUp) return false;
    const peer = this.peerOf(dev.id, iface.name);
    return !!peer && peer.iface.adminUp;
  }

  findIface(dev: Device, name: string): Iface | undefined {
    if (name === SVI) return dev.svi;
    return dev.ifaces.find((i) => i.name === name);
  }

  clearDynamic() {
    this.arp.clear();
    this.macTables.clear();
  }

  // ---------- Tables (pour les commandes show) ----------

  arpTable(dev: Device) {
    const own = this.l3Ifaces(dev)
      .filter((l) => l.iface.ip && this.isUp(dev, l.iface))
      .map((l) => ({ ip: l.iface.ip!, mac: l.iface.mac, port: l.iface.name, own: true }));
    const learned = [...(this.arp.get(dev.id) ?? new Map()).entries()].map(([ip, e]) => ({ ip, mac: e.mac, port: e.port, own: false }));
    return [...own, ...learned].sort((x, y) => (ipToInt(x.ip) ?? 0) - (ipToInt(y.ip) ?? 0));
  }

  macTable(dev: Device) {
    return [...(this.macTables.get(dev.id) ?? new Map()).entries()].map(([mac, port]) => ({ mac, port }));
  }

  /** Table de routage : routes connectées (C), locales (L) et statiques (S). */
  routingTable(dev: Device) {
    const routes: { code: "C" | "L" | "S"; network: string; prefix: number; via?: string; iface?: string }[] = [];
    for (const i of dev.ifaces) {
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

  private l3Ifaces(dev: Device): L3If[] {
    if (dev.kind === "switch") return dev.svi ? [{ dev, iface: dev.svi, port: SVI }] : [];
    return dev.ifaces.map((iface) => ({ dev, iface, port: iface.name }));
  }

  private ownsIp(dev: Device, ip: string) {
    return this.l3Ifaces(dev).some((l) => l.iface.ip === ip && this.isUp(dev, l.iface));
  }

  private resolveStatic(dev: Device, r: StaticRoute): { out: Iface; nextHop: string | null } | null {
    if (r.iface) {
      const out = dev.ifaces.find((i) => i.name === r.iface);
      return out && this.isUp(dev, out) ? { out, nextHop: r.nextHop ?? null } : null;
    }
    if (!r.nextHop) return null;
    const out = dev.ifaces.find((i) => i.ip && i.mask && this.isUp(dev, i) && sameSubnet(i.ip, r.nextHop!, i.mask));
    return out ? { out, nextHop: r.nextHop } : null;
  }

  /** Choisit l'interface de sortie et le prochain saut pour une destination. */
  private route(dev: Device, dst: string): { out: Iface; nextHop: string } | null {
    if (dev.kind !== "router") {
      const nic = dev.kind === "switch" ? dev.svi : dev.ifaces[0];
      if (!nic?.ip || !nic.mask || !this.isUp(dev, nic)) return null;
      if (sameSubnet(nic.ip, dst, nic.mask)) return { out: nic, nextHop: dst };
      return dev.gateway ? { out: nic, nextHop: dev.gateway } : null;
    }
    // Routeur : correspondance la plus longue entre routes connectées et statiques
    let best: { out: Iface; nextHop: string; prefix: number } | null = null;
    for (const i of dev.ifaces) {
      if (!i.ip || !i.mask || !this.isUp(dev, i) || !sameSubnet(i.ip, dst, i.mask)) continue;
      const p = maskToPrefix(i.mask);
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

  private queue: { dev: Device; port: string; frame: Frame }[] = [];

  /** Émet une trame depuis un port (physique ou Vlan1). */
  private emit(dev: Device, port: string, frame: Frame) {
    if (dev.kind === "switch" && port === SVI) {
      this.switchForward(dev, SVI, frame);
      return;
    }
    const iface = dev.ifaces.find((i) => i.name === port);
    if (!iface || !this.isUp(dev, iface)) return;
    const peer = this.peerOf(dev.id, port);
    if (peer) this.queue.push({ dev: peer.dev, port: peer.iface.name, frame });
  }

  private switchForward(sw: Device, inPort: string, frame: Frame) {
    let table = this.macTables.get(sw.id);
    if (!table) this.macTables.set(sw.id, (table = new Map()));
    if (inPort !== SVI) table.set(frame.src, inPort);
    const svi = sw.svi!;
    const toSvi = inPort !== SVI && svi.adminUp && (frame.dst === BROADCAST_MAC || frame.dst === svi.mac);
    if (toSvi) this.queue.push({ dev: sw, port: SVI, frame });
    if (frame.dst === svi.mac) return;
    const known = frame.dst !== BROADCAST_MAC ? table.get(frame.dst) : undefined;
    const outs = known ? [known] : sw.ifaces.map((i) => i.name);
    for (const p of outs) if (p !== inPort) this.emit(sw, p, frame);
  }

  private run() {
    let steps = 0;
    while (this.queue.length && steps++ < 5000) {
      const { dev, port, frame } = this.queue.shift()!;
      if (dev.kind === "switch" && port !== SVI) this.switchForward(dev, port, frame);
      else this.receiveL3(dev, port, frame);
    }
    this.queue = [];
  }

  private receiveL3(dev: Device, port: string, frame: Frame) {
    const iface = this.findIface(dev, port);
    if (!iface || !this.isUp(dev, iface)) return;
    if (frame.dst !== BROADCAST_MAC && frame.dst !== iface.mac) return;
    if (frame.type === "arp") {
      const a = frame.arp;
      if (a.op === "req" && a.targetIp === iface.ip) {
        this.learnArp(dev, a.senderIp, a.senderMac, port);
        this.emit(dev, port, { src: iface.mac, dst: a.senderMac, type: "arp", arp: { op: "rep", senderIp: iface.ip!, senderMac: iface.mac, targetIp: a.senderIp } });
      } else if (a.op === "rep" && a.targetIp === iface.ip) {
        this.learnArp(dev, a.senderIp, a.senderMac, port);
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
    if (dev.kind !== "router") return; // un PC ou un switch ne route pas
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
    const port = r.out.name;
    const entry = this.arp.get(dev.id)?.get(r.nextHop);
    if (!entry) {
      // Pas d'entrée ARP : on envoie une requête et le paquet est perdu (le « . » du premier ping)
      this.emit(dev, port, { src: r.out.mac, dst: BROADCAST_MAC, type: "arp", arp: { op: "req", senderIp: r.out.ip!, senderMac: r.out.mac, targetIp: r.nextHop } });
      return false;
    }
    this.emit(dev, port, { src: r.out.mac, dst: entry.mac, type: "ipv4", ip: { ...pkt, src } });
    return true;
  }

  /**
   * Un PC (ou la SVI d'un switch) attend la réponse ARP avant d'envoyer son paquet,
   * alors qu'un routeur le jette : c'est ce qui donne « .!!!! » sur un routeur.
   */
  private prepareArp(dev: Device, dst: string) {
    if (dev.kind === "router") return;
    const r = this.route(dev, dst);
    if (!r || this.arp.get(dev.id)?.has(r.nextHop)) return;
    this.emit(dev, r.out.name, { src: r.out.mac, dst: BROADCAST_MAC, type: "arp", arp: { op: "req", senderIp: r.out.ip!, senderMac: r.out.mac, targetIp: r.nextHop } });
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
    return { version: 1, devices: this.devices, links: this.links, macSeed: this.macSeed, nextId: this.nextId };
  }

  static fromJSON(data: unknown): Network {
    const n = new Network();
    const d = data as ReturnType<Network["toJSON"]>;
    if (!d || !Array.isArray(d.devices) || !Array.isArray(d.links)) throw new Error("Fichier de lab invalide");
    n.devices = d.devices.map((x) => ({ ...x, routes: x.routes ?? [], extra: x.extra ?? [] }));
    n.links = d.links;
    n.macSeed = d.macSeed ?? 1000;
    n.nextId = d.nextId ?? 1000;
    return n;
  }
}

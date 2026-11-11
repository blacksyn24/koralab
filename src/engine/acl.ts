// Listes de contrôle d'accès (ACL) de style Cisco : lecture des règles et correspondance avec un paquet.

import { ipToInt, isIp } from "./ip";

export type Proto = "ip" | "icmp" | "tcp" | "udp";
export type AddrSpec = { any: true } | { ip: string; wildcard: string };
export type PortSpec = { op: "eq" | "neq" | "gt" | "lt" | "range"; ports: number[] };

export type AclRule = {
  seq: number;
  action: "permit" | "deny";
  proto: Proto;
  src: AddrSpec;
  dst?: AddrSpec; // ACL étendue uniquement
  sport?: PortSpec;
  dport?: PortSpec;
  icmpType?: string;
  text: string; // forme affichée par « show access-lists »
  cfg: string; // forme de la running-config (sans le numéro de séquence)
};

export type Acl = { name: string; extended: boolean; rules: AclRule[]; remarks?: string[] };

/** Ce qu'une ACL regarde dans un paquet. */
export type PacketView = { src: string; dst: string; proto: "icmp" | "tcp" | "udp"; sport?: number; dport?: number; icmpType?: string };

export const PORT_NAMES: Record<string, number> = {
  "ftp-data": 20,
  ftp: 21,
  ssh: 22,
  telnet: 23,
  smtp: 25,
  domain: 53,
  dns: 53,
  bootps: 67,
  bootpc: 68,
  tftp: 69,
  www: 80,
  http: 80,
  pop3: 110,
  ntp: 123,
  snmp: 161,
  snmptrap: 162,
  bgp: 179,
  https: 443,
  syslog: 514,
};

/** Numéro → type : 1-99 et 1300-1999 standard ; 100-199 et 2000-2699 étendue. */
export function aclKindFromNumber(n: number): "standard" | "extended" | null {
  if ((n >= 1 && n <= 99) || (n >= 1300 && n <= 1999)) return "standard";
  if ((n >= 100 && n <= 199) || (n >= 2000 && n <= 2699)) return "extended";
  return null;
}

function parsePort(tok: string | undefined): number | null {
  if (!tok) return null;
  if (/^\d+$/.test(tok)) return Number(tok) <= 65535 ? Number(tok) : null;
  return PORT_NAMES[tok.toLowerCase()] ?? null;
}

/** Lit une adresse : any | host A.B.C.D | A.B.C.D wildcard | (standard) A.B.C.D seul. */
function parseAddr(t: string[], k: number, standard: boolean): { spec: AddrSpec; next: number } | null {
  const w = t[k]?.toLowerCase();
  if (!w) return null;
  if (w === "any") return { spec: { any: true }, next: k + 1 };
  if (w === "host") return isIp(t[k + 1] ?? "") ? { spec: { ip: t[k + 1], wildcard: "0.0.0.0" }, next: k + 2 } : null;
  if (!isIp(t[k])) return null;
  if (isIp(t[k + 1] ?? "")) return { spec: { ip: t[k], wildcard: t[k + 1] }, next: k + 2 };
  return standard ? { spec: { ip: t[k], wildcard: "0.0.0.0" }, next: k + 1 } : null;
}

function parsePortSpec(t: string[], k: number): { spec?: PortSpec; next: number } | null {
  const op = t[k]?.toLowerCase();
  if (op === "eq" || op === "neq" || op === "gt" || op === "lt") {
    const p = parsePort(t[k + 1]);
    return p === null ? null : { spec: { op, ports: [p] }, next: k + 2 };
  }
  if (op === "range") {
    const a = parsePort(t[k + 1]);
    const b = parsePort(t[k + 2]);
    return a === null || b === null ? null : { spec: { op: "range", ports: [a, b] }, next: k + 3 };
  }
  return { next: k };
}

const addrText = (a: AddrSpec) => ("any" in a ? "any" : a.wildcard === "0.0.0.0" ? `host ${a.ip}` : `${a.ip} ${a.wildcard}`);
const PORT_LABEL: Record<number, string> = { 20: "ftp-data", 21: "ftp", 23: "telnet", 25: "smtp", 53: "domain", 67: "bootps", 68: "bootpc", 69: "tftp", 80: "www", 110: "pop3", 123: "ntp", 161: "snmp", 514: "syslog" };
const portText = (p?: PortSpec) => (p ? ` ${p.op} ${p.ports.map((n) => PORT_LABEL[n] ?? n).join(" ")}` : "");

/**
 * Lit une règle : « permit 192.168.1.0 0.0.0.255 » (standard)
 * ou « deny tcp any host 10.0.0.1 eq 80 » (étendue). Renvoie null si la syntaxe est invalide.
 */
export function parseRule(words: string[], extended: boolean, seq: number): AclRule | null {
  const t = words.filter(Boolean);
  const action = t[0]?.toLowerCase();
  if (action !== "permit" && action !== "deny") return null;
  if (!extended) {
    const src = parseAddr(t, 1, true);
    if (!src) return null;
    const cfgAddr = "any" in src.spec ? "any" : src.spec.wildcard === "0.0.0.0" ? `host ${src.spec.ip}` : `${src.spec.ip} ${src.spec.wildcard}`;
    return { seq, action, proto: "ip", src: src.spec, cfg: `${action} ${cfgAddr}`, text: `${action} ${"any" in src.spec ? "any" : src.spec.wildcard === "0.0.0.0" ? src.spec.ip : `${src.spec.ip}, wildcard bits ${src.spec.wildcard}`}` };
  }
  const proto = t[1]?.toLowerCase();
  if (proto !== "ip" && proto !== "icmp" && proto !== "tcp" && proto !== "udp") return null;
  const src = parseAddr(t, 2, false);
  if (!src) return null;
  let k = src.next;
  let sport: PortSpec | undefined;
  if (proto === "tcp" || proto === "udp") {
    const ps = parsePortSpec(t, k);
    if (!ps) return null;
    sport = ps.spec;
    k = ps.next;
  }
  const dst = parseAddr(t, k, false);
  if (!dst) return null;
  k = dst.next;
  let dport: PortSpec | undefined;
  let icmpType: string | undefined;
  if (proto === "tcp" || proto === "udp") {
    const ps = parsePortSpec(t, k);
    if (!ps) return null;
    dport = ps.spec;
    k = ps.next;
  } else if (proto === "icmp" && t[k] && !["log", "log-input"].includes(t[k].toLowerCase())) {
    icmpType = t[k].toLowerCase();
    if (!["echo", "echo-reply", "unreachable", "time-exceeded"].includes(icmpType)) return null;
    k++;
  }
  const rest = t.slice(k).map((x) => x.toLowerCase());
  if (rest.some((x) => !["log", "log-input", "established"].includes(x))) return null;
  const text = `${action} ${proto} ${addrText(src.spec)}${portText(sport)} ${addrText(dst.spec)}${portText(dport)}${icmpType ? ` ${icmpType}` : ""}${rest.length ? ` ${rest.join(" ")}` : ""}`;
  return { seq, action, proto, src: src.spec, dst: dst.spec, sport, dport, icmpType, text, cfg: text };
}

function addrMatch(a: AddrSpec, ip: string): boolean {
  if ("any" in a) return true;
  const wc = ipToInt(a.wildcard) ?? 0;
  const care = ~wc >>> 0;
  return (((ipToInt(ip) ?? 0) & care) >>> 0) === (((ipToInt(a.ip) ?? 0) & care) >>> 0);
}

function portMatch(p: PortSpec | undefined, port: number | undefined): boolean {
  if (!p) return true;
  if (port === undefined) return false;
  const [a, b] = p.ports;
  return p.op === "eq" ? port === a : p.op === "neq" ? port !== a : p.op === "gt" ? port > a : p.op === "lt" ? port < a : port >= a && port <= b;
}

export function ruleMatches(r: AclRule, pkt: PacketView): boolean {
  if (r.proto !== "ip" && r.proto !== pkt.proto) return false;
  if (!addrMatch(r.src, pkt.src)) return false;
  if (r.dst && !addrMatch(r.dst, pkt.dst)) return false;
  if (!portMatch(r.sport, pkt.sport) || !portMatch(r.dport, pkt.dport)) return false;
  if (r.icmpType && r.icmpType !== pkt.icmpType) return false;
  return true;
}

/** Première règle qui correspond (ou null : refus implicite « deny any » en fin de liste). */
export function firstMatch(acl: Acl, pkt: PacketView): AclRule | null {
  return acl.rules.find((r) => ruleMatches(r, pkt)) ?? null;
}

// Outils IPv6 : écriture complète / abrégée, préfixes, EUI-64 et adresses link-local.

/** « 2001:db8::1 » -> « 2001:0db8:0000:0000:0000:0000:0000:0001 », ou null si invalide. */
export function expand6(addr: string): string | null {
  const a = addr.trim().toLowerCase();
  if (!/^[0-9a-f:]+$/.test(a) || (a.match(/::/g) ?? []).length > 1 || a.includes(":::")) return null;
  let groups: string[];
  if (a.includes("::")) {
    const [l, r] = a.split("::");
    const left = l ? l.split(":") : [];
    const right = r ? r.split(":") : [];
    const fill = 8 - left.length - right.length;
    if (fill < 1) return null;
    groups = [...left, ...Array(fill).fill("0"), ...right];
  } else groups = a.split(":");
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0")).join(":");
}

export const isIp6 = (s: string) => expand6(s) !== null;

/** Écriture abrégée (RFC 5952) : zéros de tête supprimés, plus longue suite de zéros remplacée par « :: ». */
export function compress6(addr: string): string {
  const full = expand6(addr);
  if (!full) return addr;
  const g = full.split(":").map((x) => x.replace(/^0+(?=.)/, ""));
  let best = { at: -1, len: 0 };
  for (let i = 0; i < 8; ) {
    if (g[i] !== "0") {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && g[j] === "0") j++;
    if (j - i > best.len && j - i > 1) best = { at: i, len: j - i };
    i = j;
  }
  if (best.at < 0) return g.join(":");
  const left = g.slice(0, best.at).join(":");
  const right = g.slice(best.at + best.len).join(":");
  return `${left}::${right}`;
}

/** Adresse en majuscules, comme dans les sorties IOS. */
export const show6 = (addr: string) => compress6(addr).toUpperCase();

function toBig(addr: string): bigint {
  return BigInt("0x" + expand6(addr)!.replace(/:/g, ""));
}

function fromBig(n: bigint): string {
  const hex = n.toString(16).padStart(32, "0");
  return hex.match(/.{4}/g)!.join(":");
}

/** Réseau d'une adresse : 2001:db8:1::5 /64 -> 2001:db8:1:: */
export function network6(addr: string, len: number): string {
  if (len === 0) return fromBig(0n);
  const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - len)) - 1n);
  return fromBig(toBig(addr) & mask);
}

export function inPrefix6(addr: string, prefix: string, len: number): boolean {
  return network6(addr, len) === network6(prefix, len);
}

/** « 2001:db8::1/64 » -> { addr, len } */
export function parseCidr6(s: string): { addr: string; len: number } | null {
  const m = s.trim().match(/^([0-9a-fA-F:]+)\/(\d{1,3})$/);
  if (!m) return null;
  const addr = expand6(m[1]);
  const len = Number(m[2]);
  return addr && len <= 128 ? { addr, len } : null;
}

/** Identifiant d'interface EUI-64 à partir d'une MAC Cisco (aaaa.bbbb.cccc). */
export function eui64(mac: string): string {
  const hex = mac.replace(/\./g, "").padStart(12, "0");
  const first = (parseInt(hex.slice(0, 2), 16) ^ 0x02).toString(16).padStart(2, "0");
  const id = `${first}${hex.slice(2, 6)}fffe${hex.slice(6)}`;
  return id.match(/.{4}/g)!.join(":");
}

/** Préfixe /64 + EUI-64 -> adresse complète. */
export function withEui64(prefix: string, mac: string): string {
  const net = network6(prefix, 64).split(":").slice(0, 4).join(":");
  return expand6(`${net}:${eui64(mac)}`)!;
}

export function linkLocal(mac: string): string {
  return withEui64("fe80::", mac);
}

export const isLinkLocal6 = (addr: string) => expand6(addr)?.startsWith("fe8") ?? false;

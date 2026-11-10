// Outils IPv4 : conversion, masques, sous-réseaux.

/** "192.168.1.10" -> entier non signé 32 bits, ou null si invalide. */
export function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export const isIp = (s: string) => ipToInt(s) !== null;

/** Masque décimal valide (bits contigus) ? */
export function isMask(mask: string): boolean {
  const m = ipToInt(mask);
  if (m === null) return false;
  const inv = ~m >>> 0;
  return ((inv + 1) & inv) === 0;
}

export function maskToPrefix(mask: string): number {
  let m = ipToInt(mask) ?? 0;
  let n = 0;
  while (m & 0x80000000) {
    n++;
    m = (m << 1) >>> 0;
  }
  return n;
}

export function prefixToMask(prefix: number): string {
  return intToIp(prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
}

export function networkOf(ip: string, mask: string): string {
  return intToIp(((ipToInt(ip) ?? 0) & (ipToInt(mask) ?? 0)) >>> 0);
}

export function broadcastOf(ip: string, mask: string): string {
  const m = ipToInt(mask) ?? 0;
  return intToIp((((ipToInt(ip) ?? 0) & m) | (~m >>> 0)) >>> 0);
}

export function sameSubnet(a: string, b: string, mask: string): boolean {
  return networkOf(a, mask) === networkOf(b, mask);
}

/** "192.168.1.10/24" ou "192.168.1.10 255.255.255.0" -> { ip, mask } */
export function parseCidr(input: string): { ip: string; mask: string } | null {
  const m = input.trim().match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
  if (!m) return null;
  const prefix = Number(m[2]);
  if (!isIp(m[1]) || prefix > 32) return null;
  return { ip: m[1], mask: prefixToMask(prefix) };
}

/** Adresse MAC pseudo-aléatoire mais stable, au format Cisco aaaa.bbbb.cccc */
export function makeMac(seed: number): string {
  const hex = (0x00d0_0000_0000 + seed * 0x1f3d).toString(16).padStart(12, "0").slice(-12);
  return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`;
}

export const BROADCAST_MAC = "ffff.ffff.ffff";

// Vérification automatique des TP : chaque critère est testé sur le réseau simulé de l'étudiant.

import { isIp } from "./ip";
import { Network, SVI, shortIf, type Device } from "./network";

export type Check =
  | { type: "hostname"; device: string; value: string }
  | { type: "ip"; device: string; iface: string; ip: string; mask: string }
  | { type: "up"; device: string; iface: string }
  | { type: "gateway"; device: string; value: string }
  | { type: "route"; device: string; network: string; mask: string }
  | { type: "ping"; device: string; to: string };

export const CHECK_TYPES: { type: Check["type"]; label: string }[] = [
  { type: "ping", label: "Ping réussi" },
  { type: "ip", label: "Adresse IP d'une interface" },
  { type: "up", label: "Interface active (up/up)" },
  { type: "hostname", label: "Nom de l'équipement" },
  { type: "gateway", label: "Passerelle (PC ou switch)" },
  { type: "route", label: "Route présente dans la table" },
];

export type CheckResult = { check?: Check; ok: boolean; label: string; hint?: string };

/** Texte lisible d'un critère, à partir des noms d'origine des équipements. */
export function describe(c: Check, name: (id: string) => string): string {
  const d = name(c.device);
  switch (c.type) {
    case "hostname":
      return `${d} s'appelle « ${c.value} »`;
    case "ip":
      return `${d} ${shortIf(c.iface)} a l'adresse ${c.ip} ${c.mask}`;
    case "up":
      return `${d} ${shortIf(c.iface)} est active (up/up)`;
    case "gateway":
      return `${d} a pour passerelle ${c.value}`;
    case "route":
      return `${d} a une route vers ${c.network} ${c.mask}`;
    case "ping":
      return `${d} réussit à pinguer ${c.to}`;
  }
}

function iface(dev: Device, name: string) {
  return name === SVI ? dev.svi : dev.ifaces.find((i) => i.name === name);
}

/** Teste tous les critères. Les équipements sont retrouvés par identifiant (le nom peut avoir changé). */
export function evaluate(net: Network, checks: Check[], originalName: (id: string) => string): CheckResult[] {
  return checks.map((c) => {
    const label = describe(c, originalName);
    const dev = net.getDevice(c.device);
    if (!dev) return { check: c, ok: false, label, hint: "Cet équipement a été supprimé de la topologie." };
    switch (c.type) {
      case "hostname":
        return { check: c, ok: dev.hostname === c.value, label, hint: `Nom actuel : ${dev.hostname}` };
      case "ip": {
        const i = iface(dev, c.iface);
        const ok = i?.ip === c.ip && i?.mask === c.mask;
        return { check: c, ok, label, hint: i?.ip ? `Adresse actuelle : ${i.ip} ${i.mask}` : "Aucune adresse sur cette interface." };
      }
      case "up": {
        const i = iface(dev, c.iface);
        const ok = !!i && net.isUp(dev, i);
        return { check: c, ok, label, hint: !i?.adminUp ? "L'interface est éteinte (shutdown)." : "Le câble ou l'autre extrémité n'est pas actif." };
      }
      case "gateway":
        return { check: c, ok: dev.gateway === c.value, label, hint: dev.gateway ? `Passerelle actuelle : ${dev.gateway}` : "Aucune passerelle configurée." };
      case "route": {
        const ok = net.routingTable(dev).some((r) => r.network === c.network && r.prefix === maskBits(c.mask));
        return { check: c, ok, label, hint: "Vérifiez avec « show ip route »." };
      }
      case "ping": {
        if (!isIp(c.to)) return { check: c, ok: false, label };
        // Plusieurs essais : les premiers servent à résoudre l'ARP, comme en vrai
        const ok = net.ping(dev, c.to, 5).slice(-2).every((r) => r.ok);
        return { check: c, ok, label, hint: "Vérifiez les adresses, les masques, les passerelles et les interfaces." };
      }
    }
  });
}

function maskBits(mask: string) {
  return mask.split(".").reduce((n, o) => n + (Number(o) >>> 0).toString(2).replace(/0/g, "").length, 0);
}

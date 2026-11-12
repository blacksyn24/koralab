// Vérification automatique des TP : chaque critère est testé sur le réseau simulé de l'étudiant.

import { IosCli } from "./cli/ios";
import { PcCli } from "./cli/pc";
import { isIp, sameSubnet } from "./ip";
import { Network, findIfaceOn, shortIf, type Device } from "./network";

export type Check =
  | { type: "hostname"; device: string; value: string }
  | { type: "ip"; device: string; iface: string; ip: string; mask: string }
  | { type: "up"; device: string; iface: string }
  | { type: "gateway"; device: string; value: string }
  | { type: "route"; device: string; network: string; mask: string }
  | { type: "ping"; device: string; to: string }
  | { type: "noping"; device: string; to: string }
  | { type: "vlan"; device: string; vlan: number; name?: string }
  | { type: "access"; device: string; iface: string; vlan: number }
  | { type: "trunk"; device: string; iface: string }
  | { type: "dhcp"; device: string; network: string; mask: string }
  | { type: "tcp"; device: string; to: string; port: number; open: boolean }
  | { type: "show"; device: string; command: string; pattern: string; text: string; hint?: string };

export const CHECK_TYPES: { type: Check["type"]; label: string }[] = [
  { type: "ping", label: "Ping réussi" },
  { type: "ip", label: "Adresse IP d'une interface" },
  { type: "up", label: "Interface active (up/up)" },
  { type: "hostname", label: "Nom de l'équipement" },
  { type: "gateway", label: "Passerelle (PC ou switch)" },
  { type: "route", label: "Route présente dans la table" },
  { type: "noping", label: "Ping bloqué (ACL, isolation)" },
  { type: "vlan", label: "VLAN créé (avec son nom)" },
  { type: "access", label: "Port d'accès dans un VLAN" },
  { type: "trunk", label: "Port en mode trunk" },
  { type: "dhcp", label: "Adresse obtenue par DHCP" },
  { type: "tcp", label: "Connexion TCP autorisée / bloquée" },
  { type: "show", label: "Sortie d'une commande show (avancé)" },
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
    case "noping":
      return `${d} ne peut pas joindre ${c.to}`;
    case "vlan":
      return `${d} a le VLAN ${c.vlan}${c.name ? ` nommé ${c.name}` : ""}`;
    case "access":
      return `${d} ${shortIf(c.iface)} est un port d'accès du VLAN ${c.vlan}`;
    case "trunk":
      return `${d} ${shortIf(c.iface)} est un trunk 802.1Q`;
    case "dhcp":
      return `${d} obtient une adresse du réseau ${c.network} par DHCP`;
    case "tcp":
      return `${d} ${c.open ? "peut" : "ne peut pas"} ouvrir une connexion TCP ${c.port} vers ${c.to}`;
    case "show":
      return c.text || `${d} : « ${c.command} »`;
  }
}

function iface(dev: Device, name: string) {
  return findIfaceOn(dev, name);
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
      case "noping": {
        if (!isIp(c.to)) return { check: c, ok: false, label };
        const ok = !net.ping(dev, c.to, 5).some((r) => r.ok);
        return { check: c, ok, label, hint: "Ce trafic devrait être bloqué : vérifiez l'ACL, son sens (in/out) et l'interface où elle est appliquée." };
      }
      case "vlan": {
        const v = dev.vlans?.find((x) => x.id === c.vlan);
        const ok = !!v && (!c.name || v.name?.toLowerCase() === c.name.toLowerCase());
        return { check: c, ok, label, hint: v ? `Nom actuel : ${v.name ?? "(aucun)"}` : "Ce VLAN n'existe pas sur l'équipement (show vlan brief)." };
      }
      case "access": {
        const i = iface(dev, c.iface);
        const ok = !!i && net.isSwitchport(dev, i) && net.opMode(dev, i) === "access" && (i.accessVlan ?? 1) === c.vlan;
        return { check: c, ok, label, hint: i ? `Actuellement : ${net.isSwitchport(dev, i) ? net.opMode(dev, i) : "port routé"}, VLAN ${i.accessVlan ?? 1}` : "Interface introuvable." };
      }
      case "trunk": {
        const i = iface(dev, c.iface);
        const ok = !!i && net.isSwitchport(dev, i) && net.opMode(dev, i) === "trunk";
        return { check: c, ok, label, hint: "Vérifiez avec « show interfaces trunk »." };
      }
      case "dhcp": {
        const n = dev.ifaces[0];
        const ok = !!n?.dhcp && !!n.ip && !!n.mask && sameSubnet(n.ip, c.network, c.mask);
        return { check: c, ok, label, hint: n?.ip ? `Adresse actuelle : ${n.ip}${n.dhcp ? " (DHCP)" : " (statique)"}` : "Aucune adresse : cliquez sur « Obtenir par DHCP »." };
      }
      case "tcp": {
        const r = net.tcpConnect(dev, c.to, c.port);
        const ok = c.open ? r === "open" : r === "filtered" || r === "timeout";
        return { check: c, ok, label, hint: `Résultat actuel : ${r === "open" ? "connexion ouverte" : r === "refused" ? "connexion refusée par le serveur" : "aucune réponse (filtré)"}.` };
      }
      case "show": {
        let out = "";
        try {
          out = dev.kind === "pc" ? new PcCli(net, dev).exec(c.command) : new IosCli(net, dev).runAs("priv", c.command);
        } catch {
          out = "";
        }
        let ok = false;
        try {
          ok = new RegExp(c.pattern, "im").test(out);
        } catch {
          ok = false;
        }
        return { check: c, ok, label, hint: c.hint ?? `Vérifiez avec « ${c.command} ».` };
      }
    }
  });
}

function maskBits(mask: string) {
  return mask.split(".").reduce((n, o) => n + (Number(o) >>> 0).toString(2).replace(/0/g, "").length, 0);
}

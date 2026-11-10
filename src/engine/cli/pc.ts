// Invite de commandes des PC KoraLab (style Windows) : ipconfig, ping, tracert, et « ip » pour configurer vite.

import { isIp, isMask, parseCidr } from "../ip";
import type { Device, Network } from "../network";

export class PcCli {
  constructor(public net: Network, public dev: Device) {}

  prompt() {
    return "C:\\>";
  }

  banner() {
    return `KoraLab PC Command Line 1.0\nTapez « help » pour voir les commandes disponibles.`;
  }

  get nic() {
    return this.dev.ifaces[0];
  }

  complete(line: string) {
    const words = ["ipconfig", "ping", "tracert", "ip", "help", "arp"];
    const m = words.filter((w) => w.startsWith(line.trim().toLowerCase()));
    return m.length === 1 && !line.includes(" ") ? `${m[0]} ` : line;
  }

  exec(line: string): string {
    const [cmd = "", ...args] = line.trim().split(/\s+/);
    switch (cmd.toLowerCase()) {
      case "":
        return "";
      case "help":
      case "?":
        return [
          "Commandes disponibles :",
          "  ipconfig            Afficher la configuration IP",
          "  ipconfig /all       Configuration détaillée (MAC, DNS…)",
          "  ip <IP> <masque> [passerelle]   Configurer l'adresse (ex. ip 192.168.1.10 255.255.255.0 192.168.1.1)",
          "  ip <IP>/<préfixe> [passerelle]  Variante (ex. ip 192.168.1.10/24 192.168.1.1)",
          "  ping <IP>           Tester la connectivité",
          "  tracert <IP>        Suivre le chemin jusqu'à une destination",
          "  arp -a              Table ARP",
          "  cls                 Effacer l'écran",
        ].join("\n");
      case "ipconfig":
        return this.ipconfig(args[0]?.toLowerCase() === "/all");
      case "ip":
        return this.setIp(args);
      case "ping":
        return this.ping(args[0]);
      case "tracert":
      case "traceroute":
        return this.tracert(args[0]);
      case "arp":
        return this.arp();
      default:
        return `'${cmd}' n'est pas reconnu en tant que commande interne\nou externe, un programme exécutable ou un fichier de commandes.`;
    }
  }

  private ipconfig(all: boolean) {
    const n = this.nic;
    const lines = [
      "",
      "FastEthernet0 Connection:(default port)",
      "",
      ...(all ? [`   Physical Address................: ${n.mac.replace(/\./g, "").toUpperCase().replace(/(..)(?!$)/g, "$1-")}`] : []),
      `   IPv4 Address....................: ${n.ip ?? "0.0.0.0"}`,
      `   Subnet Mask.....................: ${n.mask ?? "0.0.0.0"}`,
      `   Default Gateway.................: ${this.dev.gateway ?? "0.0.0.0"}`,
      ...(all ? [`   DNS Servers.....................: ${this.dev.dns ?? "0.0.0.0"}`] : []),
    ];
    return lines.join("\n");
  }

  private setIp(args: string[]) {
    let ip: string | undefined, mask: string | undefined, gw: string | undefined;
    const cidr = args[0] ? parseCidr(args[0]) : null;
    if (cidr) {
      ({ ip, mask } = cidr);
      gw = args[1];
    } else [ip, mask, gw] = args;
    if (!ip || !isIp(ip) || !mask || !isMask(mask)) return "Usage : ip <IP> <masque> [passerelle]   ex. ip 192.168.1.10 255.255.255.0 192.168.1.1";
    if (gw && !isIp(gw)) return "Passerelle invalide.";
    this.nic.ip = ip;
    this.nic.mask = mask;
    this.dev.gateway = gw;
    this.net.clearDynamic();
    return `Adresse configurée : ${ip} ${mask}${gw ? ` · passerelle ${gw}` : ""}`;
  }

  private ping(dst?: string) {
    if (!dst || !isIp(dst)) return "Usage : ping <adresse IP>";
    if (!this.nic.ip) return "Ce PC n'a pas d'adresse IP. Configurez-la avec « ip » ou dans l'onglet Configuration.";
    const res = this.net.ping(this.dev, dst, 4);
    const ok = res.filter((r) => r.ok).length;
    const lines = res.map((r) =>
      r.ok ? `Reply from ${dst}: bytes=32 time<1ms TTL=${r.ttl}` : r.kind === "ttl-exceeded" ? `Reply from ${r.from}: TTL expired in transit.` : "Request timed out."
    );
    return [
      "",
      `Pinging ${dst} with 32 bytes of data:`,
      "",
      ...lines,
      "",
      `Ping statistics for ${dst}:`,
      `    Packets: Sent = 4, Received = ${ok}, Lost = ${4 - ok} (${Math.round(((4 - ok) / 4) * 100)}% loss),`,
      ...(ok ? ["Approximate round trip times in milli-seconds:", "    Minimum = 0ms, Maximum = 1ms, Average = 0ms"] : []),
    ].join("\n");
  }

  private tracert(dst?: string) {
    if (!dst || !isIp(dst)) return "Usage : tracert <adresse IP>";
    if (!this.nic.ip) return "Ce PC n'a pas d'adresse IP.";
    const hops = this.net.traceroute(this.dev, dst);
    const lines = hops.map((h, k) => `  ${String(k + 1).padStart(2)}   ${h ? `0 ms     0 ms     1 ms     ${h}` : "*        *        *        Request timed out."}`);
    const reached = hops.at(-1) === dst;
    return ["", `Tracing route to ${dst} over a maximum of 15 hops:`, "", ...lines, "", reached ? "Trace complete." : "Trace incomplete."].join("\n");
  }

  private arp() {
    const rows = this.net.arpTable(this.dev).filter((e) => !e.own);
    if (!rows.length) return "No ARP Entries Found";
    return [`Internet Address      Physical Address      Type`, ...rows.map((r) => `  ${r.ip.padEnd(20)}${r.mac.padEnd(22)}dynamic`)].join("\n");
  }
}

// Invite de commandes des PC KoraLab (style Windows) : ipconfig, ping, tracert, et « ip » pour configurer vite.

import { isIp, isMask, parseCidr } from "../ip";
import type { Device, Network } from "../network";
import { IosCli } from "./ios";
import { SessionHost } from "./session";

export class PcCli {
  session: SessionHost;
  constructor(
    public net: Network,
    public dev: Device
  ) {
    this.session = new SessionHost(net, dev, (target) => new IosCli(net, target, true));
  }

  prompt() {
    return this.session.prompt() ?? "C:\\>";
  }

  masked() {
    return this.session.masked();
  }

  banner() {
    return `KoraLab PC Command Line 1.0\nTapez « help » pour voir les commandes disponibles.`;
  }

  get nic() {
    return this.dev.ifaces[0];
  }

  complete(line: string) {
    if (this.session.busy) return this.session.complete(line);
    const words = ["ipconfig", "ping", "tracert", "ip", "help", "arp", "telnet", "ssh"];
    const m = words.filter((w) => w.startsWith(line.trim().toLowerCase()));
    return m.length === 1 && !line.includes(" ") ? `${m[0]} ` : line;
  }

  exec(line: string): string {
    if (this.session.busy) return this.session.exec(line);
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
          "  ipconfig /renew     Obtenir une adresse par DHCP",
          "  ipconfig /release   Rendre l'adresse DHCP",
          "  ip <IP> <masque> [passerelle]   Configurer l'adresse (ex. ip 192.168.1.10 255.255.255.0 192.168.1.1)",
          "  ip <IP>/<préfixe> [passerelle]  Variante (ex. ip 192.168.1.10/24 192.168.1.1)",
          "  ping <IP>           Tester la connectivité",
          "  tracert <IP>        Suivre le chemin jusqu'à une destination",
          "  arp -a              Table ARP",
          "  telnet <IP> [port]  Tester une connexion telnet (ou un autre port TCP)",
          "  ssh -l <user> <IP>  Tester une connexion SSH",
          "  cls                 Effacer l'écran",
        ].join("\n");
      case "ipconfig": {
        const opt = args[0]?.toLowerCase();
        if (opt === "/renew") return this.renew();
        if (opt === "/release") return this.release();
        return this.ipconfig(opt === "/all");
      }
      case "telnet":
        if (args[1] && args[1] !== "23") return this.connect(args[0], Number(args[1]));
        if (!args[0] || !isIp(args[0])) return "Usage : telnet <adresse IP> [port]";
        if (!this.nic.ip) return "Ce PC n'a pas d'adresse IP.";
        return this.session.open(args[0], "telnet");
      case "ssh": {
        const li = args.indexOf("-l");
        const ip = args.at(-1);
        if (!ip || !isIp(ip) || li < 0) return "Usage : ssh -l <utilisateur> <adresse IP>";
        if (!this.nic.ip) return "Ce PC n'a pas d'adresse IP.";
        return this.session.open(ip, "ssh", args[li + 1]);
      }
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
      `FastEthernet0 Connection:(default port)${n.dhcp ? "   [DHCP]" : ""}`,
      "",
      ...(all ? [`   Physical Address................: ${n.mac.replace(/\./g, "").toUpperCase().replace(/(..)(?!$)/g, "$1-")}`] : []),
      `   IPv4 Address....................: ${n.ip ?? "0.0.0.0"}`,
      `   Subnet Mask.....................: ${n.mask ?? "0.0.0.0"}`,
      `   Default Gateway.................: ${this.dev.gateway ?? "0.0.0.0"}`,
      ...(all ? [`   DNS Servers.....................: ${this.dev.dns ?? "0.0.0.0"}`] : []),
    ];
    return lines.join("\n");
  }

  private renew() {
    this.nic.dhcp = true;
    const ack = this.net.dhcpRequest(this.dev, this.nic.name);
    if (!ack) return "\nDHCP request failed : aucun serveur DHCP n'a répondu.\n(Vérifiez le câble, le pool DHCP du routeur ou le relais « ip helper-address ».)";
    if (ack.op !== "ack") return "\nDHCP request failed : le pool n'a plus d'adresse libre.";
    return this.ipconfig(false);
  }

  private release() {
    this.net.dhcpRelease(this.dev, this.nic.name);
    return this.ipconfig(false);
  }

  private connect(dst: string | undefined, port: number) {
    if (!dst || !isIp(dst) || !Number.isInteger(port)) return "Usage : telnet <adresse IP> [port]   ou   ssh -l <utilisateur> <adresse IP>";
    if (!this.nic.ip) return "Ce PC n'a pas d'adresse IP.";
    const r = this.net.tcpConnect(this.dev, dst, port);
    const head = `Trying ${dst} ...`;
    if (r === "open") return `${head}Open\n\n[KoraLab] Connexion établie sur le port ${port} : le chemin et les ACL laissent passer la session.\n[Connection to ${dst} closed by foreign host]`;
    if (r === "refused") return `${head}\n% Connection refused by remote host`;
    if (r === "filtered") return `${head}\n% Destination unreachable (bloqué par une ACL ou pas de route)`;
    return `${head}\n% Connection timed out; remote host not responding`;
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
    this.nic.dhcp = undefined;
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
      r.ok ? `Reply from ${dst}: bytes=32 time<1ms TTL=${r.ttl}` : r.kind === "ttl-exceeded" ? `Reply from ${r.from}: TTL expired in transit.` : r.kind === "unreachable" ? `Reply from ${r.from}: Destination host unreachable.` : "Request timed out."
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

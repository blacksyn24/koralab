// Sessions à distance Telnet / SSH entre équipements KoraLab, avec l'authentification de style IOS :
// lignes vty (login, login local, password, transport input, access-class), comptes « username »,
// clés RSA et nom de domaine pour SSH.

import { firstMatch } from "../acl";
import type { Device, Network } from "../network";

/** Ce qu'une session distante doit savoir faire (un IosCli lancé en mode vty). */
export type RemoteShell = {
  prompt(): string;
  exec(line: string): string;
  complete(line: string): string;
  masked(): boolean;
  closed: boolean;
};

type Pending = { stage: "user" | "pass"; target: Device; ip: string; proto: "telnet" | "ssh"; user?: string; tries: number };

/** Mot de passe d'un compte local : « username admin secret cisco » ou « … password cisco ». */
export function localUser(dev: Device, user: string): string | null {
  for (const l of dev.extra) {
    const m = l.match(/^username\s+(\S+)(?:\s+privilege\s+\d+)?\s+(?:secret|password)\s+(?:[057]\s+)?(\S+)/);
    if (m && m[1] === user) return m[2];
  }
  return null;
}

/** Bloc de configuration d'une ligne : « line con 0 » ou la première « line vty … ». */
export function lineBlock(dev: Device, kind: "con" | "vty"): string[] | null {
  const entries = Object.entries(dev.lines ?? {});
  const hit = entries.find(([k]) => (kind === "con" ? k === "line con 0" : k.startsWith("line vty")));
  return hit ? hit[1] : null;
}

export function lineAuth(block: string[] | null): { mode: "none" | "password" | "local"; password?: string } {
  if (!block) return { mode: "none" };
  const login = block.find((l) => l.trim().startsWith("login"));
  const pw = block.find((l) => l.trim().startsWith("password "))?.trim().split(/\s+/).at(-1);
  if (login?.trim() === "login local") return { mode: "local" };
  if (login) return { mode: "password", password: pw };
  return { mode: "none" };
}

export class SessionHost {
  remote: RemoteShell | null = null;
  remoteIp = "";
  pending: Pending | null = null;

  constructor(
    private net: Network,
    private dev: Device,
    private make: (target: Device) => RemoteShell
  ) {}

  get busy() {
    return !!this.remote || !!this.pending;
  }

  prompt(): string | null {
    if (this.pending) return this.pending.stage === "user" ? "Username: " : "Password: ";
    return this.remote ? this.remote.prompt() : null;
  }

  masked(): boolean {
    return this.pending?.stage === "pass" || !!this.remote?.masked();
  }

  complete(line: string): string {
    return this.remote && !this.pending ? this.remote.complete(line) : line;
  }

  /** Ouvre une session vers une adresse. Renvoie le texte à afficher. */
  open(ip: string, proto: "telnet" | "ssh", user?: string): string {
    const head = proto === "telnet" ? `Trying ${ip} ...` : "";
    const r = this.net.tcpConnect(this.dev, ip, proto === "ssh" ? 22 : 23);
    if (r === "filtered") return `${head}\n% Destination unreachable; gateway or host down`.trim();
    if (r === "timeout") return `${head}\n% Connection timed out; remote host not responding`.trim();
    const target = this.net.devices.find((d) => d.kind !== "pc" && this.net.l3Ifaces(d).some((i) => i.ip === ip && this.net.isUp(d, i)));
    if (r === "refused" || !target) return `${head}\n% Connection refused by remote host`.trim();
    const vty = lineBlock(target, "vty") ?? [" login"]; // par défaut, les lignes vty demandent un mot de passe
    const transport = vty?.find((l) => l.trim().startsWith("transport input"))?.trim().split(/\s+/).slice(2) ?? ["all"];
    const allowed = transport.includes("all") || transport.includes(proto);
    if (!vty || !allowed || transport.includes("none")) return `${head}\n% Connection refused by remote host`.trim();
    // access-class sur les lignes vty : l'adresse source doit être autorisée
    const acName = vty.find((l) => l.trim().startsWith("access-class"))?.trim().split(/\s+/)[1];
    if (acName) {
      const acl = target.acls?.find((a) => a.name === acName);
      const src = this.net.sourceIpFor(this.dev, ip);
      if (acl && src && firstMatch(acl, { src, dst: ip, proto: "tcp", dport: proto === "ssh" ? 22 : 23 })?.action !== "permit") return `${head}\n% Connection refused by remote host`.trim();
    }
    const auth = lineAuth(vty);
    const banner = this.bannerOf(target);
    if (proto === "ssh") {
      const hasKey = target.extra.some((l) => l.startsWith("crypto key generate rsa"));
      if (!hasKey) return "% Connection refused by remote host";
      if (!user) return "% No user specified (ssh -l <utilisateur> <adresse>)";
      if (auth.mode !== "local") return "% Connection refused by remote host";
      this.pending = { stage: "pass", target, ip, proto, user, tries: 0 };
      return banner;
    }
    const open = `${head} Open${banner ? `\n${banner}` : ""}\n\nUser Access Verification`;
    if (auth.mode === "none") {
      if (vty.some((l) => l.trim() === "no login")) return this.start(target, ip, `${head} Open`);
      return `${head} Open\n\n\nPassword required, but none set\n\n[Connection to ${ip} closed by foreign host]`;
    }
    if (auth.mode === "password" && !auth.password) return `${head} Open\n\n\nPassword required, but none set\n\n[Connection to ${ip} closed by foreign host]`;
    this.pending = { stage: auth.mode === "local" ? "user" : "pass", target, ip, proto, tries: 0 };
    return open;
  }

  private bannerOf(d: Device): string {
    const motd = d.extra.find((l) => l.startsWith("banner motd "));
    if (!motd) return "";
    const body = motd.slice("banner motd ".length).trim();
    return body.length > 1 && body.endsWith(body[0]) ? body.slice(1, -1).trim() : body;
  }

  private start(target: Device, ip: string, text: string): string {
    this.remote = this.make(target);
    this.remoteIp = ip;
    this.pending = null;
    return text;
  }

  exec(line: string): string {
    const p = this.pending;
    if (p) {
      if (p.stage === "user") {
        p.user = line.trim();
        p.stage = "pass";
        return "";
      }
      const auth = lineAuth(lineBlock(p.target, "vty"));
      const ok = auth.mode === "local" || p.proto === "ssh" ? !!p.user && localUser(p.target, p.user) === line : line === auth.password;
      if (ok) return this.start(p.target, p.ip, "");
      p.tries++;
      if (p.tries >= 3) {
        this.pending = null;
        return `% ${auth.mode === "local" || p.proto === "ssh" ? "Login invalid" : "Bad passwords"}\n\n[Connection to ${p.ip} closed by foreign host]`;
      }
      if (auth.mode === "local" || p.proto === "ssh") {
        if (p.proto === "telnet") p.stage = "user";
        return "% Login invalid\n";
      }
      return "";
    }
    if (!this.remote) return "";
    const out = this.remote.exec(line);
    if (this.remote.closed) {
      const ip = this.remoteIp;
      this.remote = null;
      return `${out ? `${out}\n` : ""}\n[Connection to ${ip} closed by foreign host]`;
    }
    return out;
  }
}

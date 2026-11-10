// Interpréteur de commandes de style Cisco IOS pour les routeurs et switchs KoraLab.
// Gère les modes, les abréviations (conf t, sh ip int br), l'aide « ? » et la complétion Tab.

import { isIp, isMask, networkOf } from "../ip";
import { Network, SVI, resolveIfaceName, shortIf, type Device, type Iface } from "../network";

type Mode = "user" | "priv" | "config" | "if" | "line";

type Ctx = { args: string[]; raw: string; cli: IosCli };
type Cmd = {
  modes: Mode[];
  /** mots-clés et paramètres : <ip> <mask> <if> (reste de la ligne) <word> <rest> (texte libre) <dest> (ip ou interface) */
  words: string[];
  help: string;
  run: (ctx: Ctx) => string | void;
  only?: "router" | "switch";
};

const PARAMS: Record<string, string> = {
  "<ip>": "A.B.C.D",
  "<mask>": "A.B.C.D",
  "<if>": "Interface (ex. g0/0/0, fa0/1)",
  "<word>": "WORD",
  "<rest>": "LINE",
  "<dest>": "A.B.C.D ou interface",
  "<num>": "<0-99>",
};

const EXEC: Mode[] = ["user", "priv"];
const PRIV: Mode[] = ["priv"];
const CONF: Mode[] = ["config"];
const IFM: Mode[] = ["if"];

function linkMsgs(name: string, up: boolean, admin = false) {
  if (admin) return `%LINK-5-CHANGED: Interface ${name}, changed state to administratively down\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to down`;
  return up
    ? `%LINK-5-CHANGED: Interface ${name}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to up`
    : `%LINK-5-CHANGED: Interface ${name}, changed state to down`;
}

export class IosCli {
  mode: Mode = "user";
  ifName: string | null = null;
  lineName: string | null = null;

  constructor(public net: Network, public dev: Device) {}

  get iface(): Iface | undefined {
    return this.ifName ? this.net.findIface(this.dev, this.ifName) : undefined;
  }

  prompt(): string {
    const h = this.dev.hostname;
    return { user: `${h}>`, priv: `${h}#`, config: `${h}(config)#`, if: `${h}(config-if)#`, line: `${h}(config-line)#` }[this.mode];
  }

  /** Texte de la bannière : « banner motd #Accès réservé#  » -> « Accès réservé » */
  banner(): string {
    const motd = this.dev.extra.find((l) => l.startsWith("banner motd "));
    if (!motd) return "";
    const body = motd.slice("banner motd ".length).trim();
    const d = body[0];
    return body.endsWith(d) && body.length > 1 ? body.slice(1, -1).trim() : body;
  }

  // ---------- Commandes ----------

  private cmds: Cmd[] = [
    // --- Navigation entre les modes ---
    { modes: ["user"], words: ["enable"], help: "Passer en mode privilégié", run: ({ cli }) => void (cli.mode = "priv") },
    { modes: PRIV, words: ["disable"], help: "Revenir en mode utilisateur", run: ({ cli }) => void (cli.mode = "user") },
    { modes: PRIV, words: ["configure", "terminal"], help: "Entrer en mode configuration", run: ({ cli }) => ((cli.mode = "config"), "Enter configuration commands, one per line.  End with CNTL/Z.") },
    { modes: ["user", "priv", "config", "if", "line"], words: ["exit"], help: "Quitter le mode actuel", run: ({ cli }) => cli.exit() },
    { modes: ["config", "if", "line"], words: ["end"], help: "Revenir au mode privilégié", run: ({ cli }) => cli.end() },
    { modes: ["config", "if", "line"], words: ["do", "<rest>"], help: "Exécuter une commande du mode privilégié", run: ({ cli, args }) => cli.runAs("priv", args[0]) },

    // --- Affichage ---
    { modes: EXEC, words: ["show", "ip", "interface", "brief"], help: "Résumé des interfaces", run: ({ cli }) => cli.showIpIntBrief() },
    { modes: PRIV, words: ["show", "running-config"], help: "Configuration en cours", run: ({ cli }) => cli.runningConfig() },
    { modes: PRIV, words: ["show", "startup-config"], help: "Configuration sauvegardée", run: ({ cli }) => cli.dev.startup ?? "startup-config is not present" },
    { modes: EXEC, words: ["show", "ip", "route"], help: "Table de routage", run: ({ cli }) => cli.showIpRoute(), only: "router" },
    { modes: EXEC, words: ["show", "arp"], help: "Table ARP", run: ({ cli }) => cli.showArp() },
    { modes: EXEC, words: ["show", "mac", "address-table"], help: "Table des adresses MAC", run: ({ cli }) => cli.showMac(), only: "switch" },
    { modes: EXEC, words: ["show", "interfaces", "description"], help: "Descriptions des interfaces", run: ({ cli }) => cli.showDescriptions() },
    { modes: EXEC, words: ["show", "version"], help: "Informations système", run: ({ cli }) => cli.showVersion() },
    { modes: EXEC, words: ["ping", "<ip>"], help: "Tester la connectivité", run: ({ cli, args }) => cli.ping(args[0]) },
    { modes: EXEC, words: ["traceroute", "<ip>"], help: "Suivre le chemin vers une destination", run: ({ cli, args }) => cli.trace(args[0]) },
    { modes: PRIV, words: ["copy", "running-config", "startup-config"], help: "Sauvegarder la configuration", run: ({ cli }) => cli.save() },
    { modes: PRIV, words: ["write", "memory"], help: "Sauvegarder la configuration", run: ({ cli }) => cli.save() },

    // --- Configuration globale ---
    {
      modes: CONF,
      words: ["hostname", "<word>"],
      help: "Nom de l'équipement",
      run: ({ cli, args }) => void (cli.dev.hostname = args[0].slice(0, 63)),
    },
    {
      modes: ["config", "if"],
      words: ["interface", "<if>"],
      help: "Configurer une interface",
      run: ({ cli, args }) => {
        const name = resolveIfaceName(cli.dev, args[0]);
        if (!name) return "% Invalid input detected at '^' marker.";
        cli.ifName = name;
        cli.mode = "if";
        if (name === SVI && cli.dev.svi && !cli.dev.svi.ip) return "";
      },
    },
    { modes: CONF, words: ["ip", "route", "<ip>", "<mask>", "<dest>"], help: "Route statique", run: ({ cli, args }) => cli.addRoute(args), only: "router" },
    { modes: CONF, words: ["no", "ip", "route", "<ip>", "<mask>", "<dest>"], help: "Supprimer une route statique", run: ({ cli, args }) => cli.delRoute(args), only: "router" },
    {
      modes: CONF,
      words: ["ip", "default-gateway", "<ip>"],
      help: "Passerelle par défaut du switch",
      run: ({ cli, args }) => (isIp(args[0]) ? void (cli.dev.gateway = args[0]) : "% Invalid input detected at '^' marker."),
      only: "switch",
    },
    { modes: CONF, words: ["no", "ip", "default-gateway"], help: "Supprimer la passerelle", run: ({ cli }) => void (cli.dev.gateway = undefined), only: "switch" },
    { modes: CONF, words: ["line", "<rest>"], help: "Configurer une ligne (console 0, vty 0 4…)", run: ({ cli, args }) => cli.enterLine(args[0]) },
    { modes: CONF, words: ["crypto", "key", "generate", "rsa", "<rest>"], help: "Générer les clés RSA", run: ({ cli, args }) => cli.crypto(args[0]) },

    // --- Configuration d'interface ---
    {
      modes: IFM,
      words: ["ip", "address", "<ip>", "<mask>"],
      help: "Adresse IPv4 de l'interface",
      run: ({ cli, args }) => cli.setIp(args[0], args[1]),
    },
    {
      modes: IFM,
      words: ["no", "ip", "address"],
      help: "Supprimer l'adresse IP",
      run: ({ cli }) => {
        if (!cli.iface) return;
        cli.iface.ip = cli.iface.mask = undefined;
        cli.net.clearDynamic();
      },
    },
    { modes: IFM, words: ["shutdown"], help: "Désactiver l'interface", run: ({ cli }) => cli.setAdmin(false) },
    { modes: IFM, words: ["no", "shutdown"], help: "Activer l'interface", run: ({ cli }) => cli.setAdmin(true) },
    { modes: IFM, words: ["description", "<rest>"], help: "Description de l'interface", run: ({ cli, args }) => void (cli.iface && (cli.iface.description = args[0].slice(0, 240))) },
    { modes: IFM, words: ["no", "description"], help: "Supprimer la description", run: ({ cli }) => void (cli.iface && (cli.iface.description = "")) },
  ];

  /** Commandes acceptées et conservées dans la configuration, sans effet simulé pour l'instant. */
  private accepted: { modes: Mode[]; prefix: string[]; help: string }[] = [
    { modes: CONF, prefix: ["enable", "secret"], help: "Mot de passe chiffré du mode privilégié" },
    { modes: CONF, prefix: ["enable", "password"], help: "Mot de passe du mode privilégié" },
    { modes: CONF, prefix: ["service", "password-encryption"], help: "Chiffrer les mots de passe" },
    { modes: CONF, prefix: ["no", "ip", "domain-lookup"], help: "Désactiver la résolution DNS" },
    { modes: CONF, prefix: ["ip", "domain-name"], help: "Nom de domaine" },
    { modes: CONF, prefix: ["banner", "motd"], help: "Bannière d'accueil" },
    { modes: CONF, prefix: ["username"], help: "Compte local" },
    { modes: CONF, prefix: ["security", "passwords", "min-length"], help: "Longueur minimale des mots de passe" },
    { modes: CONF, prefix: ["login", "block-for"], help: "Protection anti force brute" },
    { modes: CONF, prefix: ["ip", "ssh", "version"], help: "Version de SSH" },
    { modes: CONF, prefix: ["ipv6", "unicast-routing"], help: "Routage IPv6 (bientôt simulé)" },
    { modes: ["line"], prefix: ["password"], help: "Mot de passe de la ligne" },
    { modes: ["line"], prefix: ["login"], help: "Demander une authentification" },
    { modes: ["line"], prefix: ["transport", "input"], help: "Protocoles autorisés (ssh, telnet)" },
    { modes: ["line"], prefix: ["exec-timeout"], help: "Déconnexion automatique" },
    { modes: ["line"], prefix: ["logging", "synchronous"], help: "Messages qui ne coupent pas la saisie" },
  ];

  // ---------- Exécution d'une ligne ----------

  exec(line: string): string {
    const raw = line.replace(/\s+$/, "");
    if (!raw.trim()) return "";
    if (raw.trimEnd().endsWith("?")) return this.help(raw.slice(0, -1));
    if (raw.trim().startsWith("!")) return "";
    return this.dispatch(raw, this.mode) ?? "";
  }

  runAs(mode: Mode, line: string): string {
    return this.dispatch(line, mode) ?? "";
  }

  private available(mode: Mode) {
    return this.cmds.filter((c) => c.modes.includes(mode) && (!c.only || c.only === this.dev.kind));
  }

  private tokenize(line: string) {
    const tokens: { t: string; at: number }[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) tokens.push({ t: m[0], at: m.index });
    return tokens;
  }

  private caret(line: string, at: number) {
    return `${" ".repeat(this.prompt().length + at)}^\n% Invalid input detected at '^' marker.`;
  }

  private dispatch(line: string, mode: Mode): string | void {
    const tokens = this.tokenize(line);
    let cands = this.available(mode).map((c) => c);
    const args: string[] = [];
    const accepted = () => this.matchAccepted(tokens.map((x) => x.t), mode);
    let i = 0;
    let w = 0; // nombre de mots de commande consommés
    for (; i < tokens.length; i++) {
      const tok = tokens[i].t.toLowerCase();
      const atWord = cands.map((c) => c.words[i]).filter(Boolean);
      if (!atWord.length) break;
      const kws = [...new Set(atWord.filter((w) => !w.startsWith("<")))];
      const exact = kws.find((k) => k === tok);
      const matching = exact ? [exact] : kws.filter((k) => k.startsWith(tok));
      const params = cands.filter((c) => c.words[i]?.startsWith("<"));
      if (matching.length > 1) return "% Ambiguous command:  \"" + line.trim() + "\"";
      if (matching.length === 1) {
        cands = cands.filter((c) => c.words[i] === matching[0]);
        w = i + 1;
        continue;
      }
      if (params.length) {
        cands = params;
        const p = cands[0].words[i];
        if (p === "<rest>" || p === "<if>") {
          args.push(line.slice(tokens[i].at).trim());
          w = i + 1;
          i = tokens.length;
          break;
        }
        args.push(tokens[i].t);
        w = i + 1;
        continue;
      }
      const acc = accepted();
      if (acc !== null) return acc;
      if (i === 0 && tokens.length === 1 && (mode === "user" || mode === "priv")) return this.unknownHost(tokens[0].t);
      return this.caret(line, tokens[i].at);
    }
    if (i < tokens.length) return accepted() ?? this.caret(line, tokens[i].at);
    const complete = cands.find((c) => c.words.length === w);
    if (!complete) return accepted() ?? "% Incomplete command.";
    return complete.run({ args, raw: line, cli: this });
  }

  private matchAccepted(tokens: string[], mode: Mode): string | null {
    const lower = tokens.map((t) => t.toLowerCase());
    for (const a of this.accepted) {
      if (!a.modes.includes(mode)) continue;
      if (a.prefix.length > lower.length) continue;
      if (!a.prefix.every((w, k) => w.startsWith(lower[k]) && lower[k].length >= Math.min(2, w.length))) continue;
      const full = [...a.prefix, ...tokens.slice(a.prefix.length)].join(" ");
      if (mode === "line" && this.lineName) {
        const block = (this.dev.lines ??= {})[this.lineName] ?? [];
        this.dev.lines[this.lineName] = [...block.filter((l) => l.split(" ")[1] !== a.prefix[0]), ` ${full}`];
      } else {
        const key = a.prefix.join(" ");
        this.dev.extra = [...this.dev.extra.filter((l) => !l.startsWith(key)), full];
      }
      return "";
    }
    return null;
  }

  private unknownHost(word: string) {
    const lookup = !this.dev.extra.includes("no ip domain-lookup");
    return `${lookup ? `Translating "${word}"...domain server (255.255.255.255)\n` : ""}% Unknown command or computer name, or unable to find computer address`;
  }

  // ---------- Aide et complétion ----------

  help(partial: string): string {
    const tokens = this.tokenize(partial);
    const endsWithSpace = partial === "" || /\s$/.test(partial);
    const done = endsWithSpace ? tokens.map((t) => t.t) : tokens.slice(0, -1).map((t) => t.t);
    const prefix = endsWithSpace ? "" : (tokens.at(-1)?.t ?? "").toLowerCase();
    const options = this.nextWords(done);
    const list = [...options.entries()].filter(([w]) => w.startsWith("<") || w.startsWith(prefix));
    if (!list.length) return "% Unrecognized command";
    return list.map(([w, h]) => `  ${(PARAMS[w] ?? w).padEnd(22)} ${h}`).join("\n");
  }

  private nextWords(done: string[]): Map<string, string> {
    const out = new Map<string, string>();
    let cands = this.available(this.mode);
    for (let i = 0; i < done.length; i++) {
      const tok = done[i].toLowerCase();
      cands = cands.filter((c) => c.words[i] && (c.words[i].startsWith("<") || c.words[i].startsWith(tok)));
    }
    for (const c of cands) {
      const w = c.words[done.length];
      if (w) out.set(w, c.words.length === done.length + 1 ? c.help : "");
      else if (c.words.length === done.length) out.set("<cr>", "");
    }
    if (!done.length) for (const a of this.accepted) if (a.modes.includes(this.mode)) out.set(a.prefix[0], out.get(a.prefix[0]) || a.help);
    return out;
  }

  /** Complète le dernier mot s'il n'y a qu'une possibilité (touche Tab). */
  complete(line: string): string {
    const tokens = this.tokenize(line);
    if (!tokens.length || /\s$/.test(line)) return line;
    const done = tokens.slice(0, -1).map((t) => t.t);
    const last = tokens.at(-1)!;
    const kws = [...this.nextWords(done).keys()].filter((w) => !w.startsWith("<") && w !== "<cr>" && w.startsWith(last.t.toLowerCase()));
    if (kws.length !== 1) return line;
    return line.slice(0, last.at) + kws[0] + " ";
  }

  // ---------- Actions ----------

  exit(): string | void {
    if (this.mode === "if" || this.mode === "line") {
      this.mode = "config";
      this.ifName = this.lineName = null;
    } else if (this.mode === "config") this.mode = "priv";
    else {
      this.mode = "user";
      return `\n\n${this.dev.hostname} con0 is now available\n\nPress RETURN to get started.`;
    }
  }

  end(): string {
    this.mode = "priv";
    this.ifName = this.lineName = null;
    return `%SYS-5-CONFIG_I: Configured from console by console`;
  }

  setIp(ip: string, mask: string): string | void {
    const i = this.iface;
    if (!i) return;
    if (!isIp(ip) || !isMask(mask)) return "% Invalid input detected at '^' marker.";
    if (this.dev.kind === "switch" && i.name !== SVI) return "% Invalid input detected at '^' marker.";
    const overlap = this.dev.ifaces.find(
      (x) => x.name !== i.name && x.ip && x.mask && (networkOf(ip, x.mask) === networkOf(x.ip, x.mask) || networkOf(x.ip, mask) === networkOf(ip, mask))
    );
    if (overlap) return `% ${networkOf(ip, mask)} overlaps with ${overlap.name}`;
    i.ip = ip;
    i.mask = mask;
    this.net.clearDynamic();
  }

  setAdmin(up: boolean): string {
    const i = this.iface;
    if (!i || i.adminUp === up) return "";
    i.adminUp = up;
    this.net.clearDynamic();
    if (!up) return linkMsgs(i.name, false, true);
    if (i.name === SVI) return this.net.isUp(this.dev, i) ? `%LINK-5-CHANGED: Interface Vlan1, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface Vlan1, changed state to up` : "";
    return linkMsgs(i.name, this.net.isUp(this.dev, i));
  }

  addRoute(args: string[]): string | void {
    const [network, mask, dest] = args;
    if (!isIp(network) || !isMask(mask)) return "% Invalid input detected at '^' marker.";
    const route = isIp(dest) ? { network, mask, nextHop: dest } : { network, mask, iface: resolveIfaceName(this.dev, dest) ?? undefined };
    if (!route.nextHop && !route.iface) return "% Invalid input detected at '^' marker.";
    this.dev.routes = [...this.dev.routes.filter((r) => !(r.network === network && r.mask === mask && r.nextHop === route.nextHop && r.iface === route.iface)), route];
  }

  delRoute(args: string[]): string | void {
    const [network, mask, dest] = args;
    const iface = resolveIfaceName(this.dev, dest);
    this.dev.routes = this.dev.routes.filter((r) => !(r.network === network && r.mask === mask && (r.nextHop === dest || r.iface === iface)));
  }

  enterLine(rest: string): string | void {
    const m = rest.toLowerCase().match(/^(con|console)\s*0$|^vty\s+(\d+)\s+(\d+)$/);
    if (!m) return "% Invalid input detected at '^' marker.";
    this.lineName = m[1] ? "line con 0" : `line vty ${m[2]} ${m[3]}`;
    this.mode = "line";
  }

  crypto(rest: string): string {
    const domain = this.dev.extra.find((l) => l.startsWith("ip domain-name "))?.split(" ")[2];
    if (!domain) return "% Please define a domain-name first.";
    const bits = rest.match(/modulus\s+(\d+)/)?.[1] ?? "1024";
    this.dev.extra = [...this.dev.extra.filter((l) => !l.startsWith("crypto key")), `crypto key generate rsa general-keys modulus ${bits}`];
    return `The name for the keys will be: ${this.dev.hostname}.${domain}\n\n% The key modulus size is ${bits} bits\n% Generating ${bits} bit RSA keys, keys will be non-exportable...[OK]\n*Mar 1 0:0:0.000: %SSH-5-ENABLED: SSH 1.99 has been enabled`;
  }

  save(): string {
    this.dev.startup = this.runningConfig().replace("Current configuration", "Using");
    return "Destination filename [startup-config]?\nBuilding configuration...\n[OK]";
  }

  // ---------- Sorties « show » ----------

  showIpIntBrief(): string {
    const rows = [...this.dev.ifaces, ...(this.dev.svi ? [this.dev.svi] : [])].map((i) => {
      const status = !i.adminUp ? "administratively down" : this.net.isUp(this.dev, i) ? "up" : "down";
      const proto = this.net.isUp(this.dev, i) ? "up" : "down";
      return `${i.name.padEnd(23)}${(i.ip ?? "unassigned").padEnd(16)}YES ${(i.ip ? "manual" : "unset").padEnd(7)}${status.padEnd(22)}${proto}`;
    });
    return [`Interface              IP-Address      OK? Method Status                Protocol`, ...rows].join("\n");
  }

  showIpRoute(): string {
    const codes =
      "Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area\n       * - candidate default, U - per-user static route\n";
    const routes = this.net.routingTable(this.dev);
    const def = routes.find((r) => r.code === "S" && r.prefix === 0);
    const gw = def ? `Gateway of last resort is ${def.via ?? def.iface} to network 0.0.0.0` : "Gateway of last resort is not set";
    const lines = routes.map((r) => {
      const code = r.code === "S" && r.prefix === 0 ? "S*" : r.code;
      const dest = `${r.network}/${r.prefix}`;
      if (r.code === "S") return `${code.padEnd(9)}${dest} [1/0] ${r.via ? `via ${r.via}` : `is directly connected, ${r.iface}`}`;
      return `${code.padEnd(9)}${dest} is directly connected, ${r.iface}`;
    });
    return `${codes}\n${gw}\n\n${lines.join("\n")}`;
  }

  showArp(): string {
    const rows = this.net.arpTable(this.dev).map(
      (e) => `Internet  ${e.ip.padEnd(17)}${e.own ? "-" : "0"}`.padEnd(38) + `${e.mac.padEnd(16)}ARPA   ${e.port}`
    );
    return [`Protocol  Address          Age (min)  Hardware Addr   Type   Interface`, ...rows].join("\n");
  }

  showMac(): string {
    const rows = this.net.macTable(this.dev).map((e) => `   1    ${e.mac.padEnd(18)}DYNAMIC     ${shortIf(e.port)}`);
    return [`          Mac Address Table`, `-------------------------------------------`, ``, `Vlan    Mac Address       Type        Ports`, `----    -----------       --------    -----`, ...rows].join("\n");
  }

  showDescriptions(): string {
    const rows = [...this.dev.ifaces, ...(this.dev.svi ? [this.dev.svi] : [])].map((i) => {
      const status = !i.adminUp ? "admin down" : this.net.isUp(this.dev, i) ? "up" : "down";
      const proto = this.net.isUp(this.dev, i) ? "up" : "down";
      return `${shortIf(i.name).padEnd(31)}${status.padEnd(15)}${proto.padEnd(9)}${i.description}`;
    });
    return [`Interface                      Status         Protocol Description`, ...rows].join("\n");
  }

  showVersion(): string {
    const kind = this.dev.kind === "router" ? "Routeur" : "Switch";
    return `KoraLab simulated IOS-style software, ${kind} ${this.dev.model}\nThis is a simulation for training purposes (KoraLab is not affiliated with any vendor).\n\n${this.dev.hostname} uptime is 0 minutes\n${this.dev.ifaces.length} network interface(s)\nConfiguration register is 0x2102`;
  }

  runningConfig(): string {
    const out: string[] = ["!", `! KoraLab ${this.dev.model}`, "!", `hostname ${this.dev.hostname}`, "!"];
    const pw = this.dev.extra.includes("service password-encryption");
    const hide = (l: string) =>
      l
        .replace(/^(enable secret|username \S+ (?:privilege \d+ )?secret)\s+(?!\d\s)(\S+).*$/, "$1 5 $$1$$mERr$$hx5rVt7rPNoS4wqbXKX7m0")
        .replace(/^(enable password|username \S+ (?:privilege \d+ )?password)\s+(\S+)$/, (m, k, v) => (pw ? `${k} 7 0822455D0A16` : `${k} ${v}`));
    for (const l of this.dev.extra) if (!l.startsWith("crypto")) out.push(hide(l));
    if (this.dev.extra.length) out.push("!");
    for (const i of [...this.dev.ifaces, ...(this.dev.svi ? [this.dev.svi] : [])]) {
      out.push(`interface ${i.name}`);
      if (i.description) out.push(` description ${i.description}`);
      out.push(i.ip ? ` ip address ${i.ip} ${i.mask}` : " no ip address");
      if (!i.adminUp) out.push(" shutdown");
      out.push("!");
    }
    if (this.dev.gateway && this.dev.kind === "switch") out.push(`ip default-gateway ${this.dev.gateway}`, "!");
    for (const r of this.dev.routes) out.push(`ip route ${r.network} ${r.mask} ${r.nextHop ?? r.iface}`);
    if (this.dev.routes.length) out.push("!");
    for (const [name, block] of Object.entries(this.dev.lines ?? {})) {
      out.push(name, ...block.map((l) => (pw ? l.replace(/^ password (?!7 )(\S+)$/, " password 7 0822455D0A16") : l)), "!");
    }
    out.push("end");
    const body = out.join("\n");
    return `Building configuration...\n\nCurrent configuration : ${body.length} bytes\n${body}`;
  }

  ping(dst: string): string {
    if (!isIp(dst)) return "% Unrecognized host or address, or protocol not running.";
    const res = this.net.ping(this.dev, dst, 5);
    const ok = res.filter((r) => r.ok).length;
    const marks = res.map((r) => (r.ok ? "!" : r.kind === "unreachable" ? "U" : ".")).join("");
    return `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${dst}, timeout is 2 seconds:\n${marks}\nSuccess rate is ${Math.round((ok / 5) * 100)} percent (${ok}/5)${ok ? ", round-trip min/avg/max = 0/1/2 ms" : ""}`;
  }

  trace(dst: string): string {
    if (!isIp(dst)) return "% Unrecognized host or address, or protocol not running.";
    const hops = this.net.traceroute(this.dev, dst);
    const lines = hops.map((h, k) => `  ${String(k + 1).padStart(2)} ${h ? `${h} 0 msec 0 msec 1 msec` : "*  *  *"}`);
    return `Type escape sequence to abort.\nTracing the route to ${dst}\n\n${lines.join("\n")}`;
  }
}

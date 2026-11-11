// Interpréteur de commandes de style Cisco IOS pour les routeurs et switchs KoraLab.
// Gère les modes, les abréviations (conf t, sh ip int br), l'aide « ? » et la complétion Tab.

import { isIp, isMask, maskToPrefix, networkOf } from "../ip";
import {
  MODELS,
  Network,
  SVI,
  allIfaces,
  formatVlanList,
  isSubif,
  isSvi,
  isSwitchLike,
  parentOf,
  parseVlanList,
  resolveIfaceName,
  resolveIfaceRange,
  shortIf,
  vlanOf,
  type Device,
  type DeviceKind,
  type Iface,
  type PortMode,
} from "../network";

type Mode = "user" | "priv" | "config" | "if" | "line" | "vlan";

type Ctx = { args: string[]; raw: string; cli: IosCli };
type Cmd = {
  modes: Mode[];
  /** mots-clés et paramètres : <ip> <mask> <num> <word> ; <if> et <rest> prennent le reste de la ligne */
  words: string[];
  help: string;
  run: (ctx: Ctx) => string | void;
  only?: DeviceKind[];
};

const PARAMS: Record<string, string> = {
  "<ip>": "A.B.C.D",
  "<mask>": "A.B.C.D",
  "<if>": "Interface (ex. g0/0/0, fa0/1, vlan 10)",
  "<word>": "WORD",
  "<rest>": "LINE",
  "<dest>": "A.B.C.D ou interface",
  "<num>": "<1-4094>",
};

const EXEC: Mode[] = ["user", "priv"];
const PRIV: Mode[] = ["priv"];
const CONF: Mode[] = ["config"];
const IFM: Mode[] = ["if"];
const SW: DeviceKind[] = ["switch", "l3switch"];
const L3: DeviceKind[] = ["router", "l3switch"];
const NET: DeviceKind[] = ["router", "switch", "l3switch"];

const INVALID = "% Invalid input detected at '^' marker.";

function linkMsgs(name: string, up: boolean, admin = false) {
  if (admin) return `%LINK-5-CHANGED: Interface ${name}, changed state to administratively down\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to down`;
  return up
    ? `%LINK-5-CHANGED: Interface ${name}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to up`
    : `%LINK-5-CHANGED: Interface ${name}, changed state to down`;
}

/** Abréviation utilisée par CDP : Gig 0/0/0, Fas 0/1 */
const cdpIf = (name: string) => name.replace(/^GigabitEthernet/, "Gig ").replace(/^FastEthernet/, "Fas ");

const MODE_LABEL: Record<PortMode, string> = { access: "static access", trunk: "trunk", "dynamic-auto": "dynamic auto", "dynamic-desirable": "dynamic desirable" };

export class IosCli {
  mode: Mode = "user";
  /** Interfaces en cours de configuration (plusieurs avec « interface range ») */
  ifNames: string[] = [];
  lineName: string | null = null;
  vlanIds: number[] = [];

  constructor(public net: Network, public dev: Device) {}

  get ifName(): string | null {
    return this.ifNames[0] ?? null;
  }

  get iface(): Iface | undefined {
    return this.ifName ? this.net.findIface(this.dev, this.ifName) : undefined;
  }

  get ifaces(): Iface[] {
    return this.ifNames.map((n) => this.net.findIface(this.dev, n)).filter((i): i is Iface => !!i);
  }

  prompt(): string {
    const h = this.dev.hostname;
    if (this.mode === "if") {
      const kind = this.ifNames.length > 1 ? "if-range" : this.ifName && isSubif(this.ifName) ? "subif" : "if";
      return `${h}(config-${kind})#`;
    }
    return { user: `${h}>`, priv: `${h}#`, config: `${h}(config)#`, line: `${h}(config-line)#`, vlan: `${h}(config-vlan)#` }[this.mode];
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
    { modes: ["user", "priv", "config", "if", "line", "vlan"], words: ["exit"], help: "Quitter le mode actuel", run: ({ cli }) => cli.exit() },
    { modes: ["config", "if", "line", "vlan"], words: ["end"], help: "Revenir au mode privilégié", run: ({ cli }) => cli.end() },
    { modes: ["config", "if", "line", "vlan"], words: ["do", "<rest>"], help: "Exécuter une commande du mode privilégié", run: ({ cli, args }) => cli.runAs("priv", args[0]) },

    // --- Affichage ---
    { modes: EXEC, words: ["show", "ip", "interface", "brief"], help: "Résumé des interfaces", run: ({ cli }) => cli.showIpIntBrief() },
    { modes: PRIV, words: ["show", "running-config"], help: "Configuration en cours", run: ({ cli }) => cli.runningConfig() },
    { modes: PRIV, words: ["show", "startup-config"], help: "Configuration sauvegardée", run: ({ cli }) => cli.dev.startup ?? "startup-config is not present" },
    { modes: EXEC, words: ["show", "ip", "route"], help: "Table de routage", run: ({ cli }) => cli.showIpRoute(), only: NET },
    { modes: EXEC, words: ["show", "arp"], help: "Table ARP", run: ({ cli }) => cli.showArp() },
    { modes: EXEC, words: ["show", "mac", "address-table"], help: "Table des adresses MAC", run: ({ cli }) => cli.showMac(), only: SW },
    { modes: EXEC, words: ["show", "vlan"], help: "Base VLAN", run: ({ cli }) => cli.showVlan(false), only: SW },
    { modes: EXEC, words: ["show", "vlan", "brief"], help: "Résumé des VLAN", run: ({ cli }) => cli.showVlan(true), only: SW },
    { modes: EXEC, words: ["show", "interfaces", "description"], help: "Descriptions des interfaces", run: ({ cli }) => cli.showDescriptions() },
    { modes: EXEC, words: ["show", "interfaces", "status"], help: "État des ports", run: ({ cli }) => cli.showIntStatus(), only: SW },
    { modes: EXEC, words: ["show", "interfaces", "trunk"], help: "Ports en mode trunk", run: ({ cli }) => cli.showTrunk(), only: SW },
    { modes: EXEC, words: ["show", "interfaces", "<rest>"], help: "Détail d'une interface (ajoutez « switchport » sur un switch)", run: ({ cli, args }) => cli.showInterface(args[0]) },
    { modes: EXEC, words: ["show", "cdp", "neighbors"], help: "Voisins directement connectés (CDP)", run: ({ cli }) => cli.showCdp(false), only: NET },
    { modes: EXEC, words: ["show", "cdp", "neighbors", "detail"], help: "Voisins CDP en détail", run: ({ cli }) => cli.showCdp(true), only: NET },
    { modes: EXEC, words: ["show", "version"], help: "Informations système", run: ({ cli }) => cli.showVersion() },
    { modes: EXEC, words: ["ping", "<ip>"], help: "Tester la connectivité", run: ({ cli, args }) => cli.ping(args[0]) },
    { modes: EXEC, words: ["traceroute", "<ip>"], help: "Suivre le chemin vers une destination", run: ({ cli, args }) => cli.trace(args[0]) },
    { modes: PRIV, words: ["copy", "running-config", "startup-config"], help: "Sauvegarder la configuration", run: ({ cli }) => cli.save() },
    { modes: PRIV, words: ["write", "memory"], help: "Sauvegarder la configuration", run: ({ cli }) => cli.save() },
    { modes: PRIV, words: ["write"], help: "Sauvegarder la configuration", run: ({ cli }) => cli.save() },

    // --- Configuration globale ---
    { modes: CONF, words: ["hostname", "<word>"], help: "Nom de l'équipement", run: ({ cli, args }) => void (cli.dev.hostname = args[0].slice(0, 63)) },
    { modes: ["config", "if", "vlan"], words: ["interface", "<if>"], help: "Configurer une interface", run: ({ cli, args }) => cli.enterInterface(args[0]) },
    { modes: ["config", "if", "vlan"], words: ["interface", "range", "<rest>"], help: "Configurer plusieurs interfaces", run: ({ cli, args }) => cli.enterRange(args[0]), only: NET },
    { modes: CONF, words: ["no", "interface", "<if>"], help: "Supprimer une SVI ou une sous-interface", run: ({ cli, args }) => cli.removeInterface(args[0]) },
    { modes: CONF, words: ["ip", "route", "<ip>", "<mask>", "<dest>"], help: "Route statique", run: ({ cli, args }) => cli.addRoute(args), only: L3 },
    { modes: CONF, words: ["no", "ip", "route", "<ip>", "<mask>", "<dest>"], help: "Supprimer une route statique", run: ({ cli, args }) => cli.delRoute(args), only: L3 },
    { modes: CONF, words: ["ip", "routing"], help: "Activer le routage IP", run: ({ cli }) => void (cli.dev.ipRouting = true), only: L3 },
    { modes: CONF, words: ["no", "ip", "routing"], help: "Désactiver le routage IP", run: ({ cli }) => cli.noIpRouting(), only: L3 },
    {
      modes: CONF,
      words: ["ip", "default-gateway", "<ip>"],
      help: "Passerelle par défaut du switch",
      run: ({ cli, args }) => (isIp(args[0]) ? void (cli.dev.gateway = args[0]) : INVALID),
      only: SW,
    },
    { modes: CONF, words: ["no", "ip", "default-gateway"], help: "Supprimer la passerelle", run: ({ cli }) => void (cli.dev.gateway = undefined), only: SW },
    { modes: ["config", "vlan"], words: ["vlan", "<rest>"], help: "Créer ou configurer un VLAN", run: ({ cli, args }) => cli.enterVlan(args[0]), only: SW },
    { modes: CONF, words: ["no", "vlan", "<rest>"], help: "Supprimer un VLAN", run: ({ cli, args }) => cli.deleteVlan(args[0]), only: SW },
    { modes: CONF, words: ["line", "<rest>"], help: "Configurer une ligne (console 0, vty 0 4…)", run: ({ cli, args }) => cli.enterLine(args[0]) },
    { modes: CONF, words: ["crypto", "key", "generate", "rsa", "<rest>"], help: "Générer les clés RSA", run: ({ cli, args }) => cli.crypto(args[0]) },

    // --- Mode VLAN ---
    { modes: ["vlan"], words: ["name", "<word>"], help: "Nom du VLAN", run: ({ cli, args }) => cli.nameVlan(args[0]) },
    { modes: ["vlan"], words: ["no", "name"], help: "Nom par défaut", run: ({ cli }) => cli.nameVlan(null) },

    // --- Configuration d'interface ---
    { modes: IFM, words: ["ip", "address", "<ip>", "<mask>"], help: "Adresse IPv4 de l'interface", run: ({ cli, args }) => cli.setIp(args[0], args[1]) },
    { modes: IFM, words: ["no", "ip", "address"], help: "Supprimer l'adresse IP", run: ({ cli }) => cli.each((i) => void ((i.ip = i.mask = undefined), cli.net.clearDynamic())) },
    { modes: IFM, words: ["shutdown"], help: "Désactiver l'interface", run: ({ cli }) => cli.each((i) => cli.setAdmin(i, false)) },
    { modes: IFM, words: ["no", "shutdown"], help: "Activer l'interface", run: ({ cli }) => cli.each((i) => cli.setAdmin(i, true)) },
    { modes: IFM, words: ["description", "<rest>"], help: "Description de l'interface", run: ({ cli, args }) => cli.each((i) => void (i.description = args[0].slice(0, 240))) },
    { modes: IFM, words: ["no", "description"], help: "Supprimer la description", run: ({ cli }) => cli.each((i) => void (i.description = "")) },
    // ports de switch
    { modes: IFM, words: ["switchport", "mode", "<rest>"], help: "access, trunk, dynamic auto ou dynamic desirable", run: ({ cli, args }) => cli.setPortMode(args[0]), only: SW },
    { modes: IFM, words: ["no", "switchport", "mode"], help: "Mode par défaut (dynamic auto)", run: ({ cli }) => cli.eachPort((i) => void (i.mode = undefined)), only: SW },
    { modes: IFM, words: ["switchport", "access", "vlan", "<num>"], help: "VLAN du port d'accès", run: ({ cli, args }) => cli.setAccessVlan(args[0]), only: SW },
    { modes: IFM, words: ["no", "switchport", "access", "vlan"], help: "Remettre le port dans le VLAN 1", run: ({ cli }) => cli.eachPort((i) => void (i.accessVlan = undefined)), only: SW },
    { modes: IFM, words: ["switchport", "trunk", "native", "vlan", "<num>"], help: "VLAN natif du trunk", run: ({ cli, args }) => cli.setNative(args[0]), only: SW },
    { modes: IFM, words: ["no", "switchport", "trunk", "native", "vlan"], help: "VLAN natif par défaut (1)", run: ({ cli }) => cli.eachPort((i) => void (i.nativeVlan = undefined)), only: SW },
    { modes: IFM, words: ["switchport", "trunk", "allowed", "vlan", "<rest>"], help: "VLAN autorisés : liste, add, remove, all, none, except", run: ({ cli, args }) => cli.setAllowed(args[0]), only: SW },
    { modes: IFM, words: ["no", "switchport", "trunk", "allowed", "vlan"], help: "Autoriser tous les VLAN", run: ({ cli }) => cli.eachPort((i) => void (i.allowed = undefined)), only: SW },
    { modes: IFM, words: ["switchport", "trunk", "encapsulation", "<word>"], help: "Encapsulation du trunk (dot1q)", run: ({ cli, args }) => cli.setTrunkEncap(args[0]), only: SW },
    { modes: IFM, words: ["switchport", "nonegotiate"], help: "Désactiver la négociation DTP", run: ({ cli }) => cli.eachPort((i) => void (i.nonegotiate = true)), only: SW },
    { modes: IFM, words: ["no", "switchport", "nonegotiate"], help: "Réactiver DTP", run: ({ cli }) => cli.eachPort((i) => void (i.nonegotiate = undefined)), only: SW },
    { modes: IFM, words: ["switchport"], help: "Port de commutation (couche 2)", run: ({ cli }) => cli.setRouted(false), only: ["l3switch"] },
    { modes: IFM, words: ["no", "switchport"], help: "Port routé (couche 3)", run: ({ cli }) => cli.setRouted(true), only: ["l3switch"] },
    // sous-interfaces de routeur
    { modes: IFM, words: ["encapsulation", "dot1q", "<rest>"], help: "VLAN de la sous-interface (ajoutez « native » pour le VLAN natif)", run: ({ cli, args }) => cli.setDot1q(args[0]), only: ["router"] },
    { modes: IFM, words: ["no", "encapsulation", "dot1q"], help: "Retirer l'encapsulation", run: ({ cli }) => cli.each((i) => void ((i.encap = i.native = undefined), cli.net.clearDynamic())), only: ["router"] },
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
    return this.cmds.filter((c) => c.modes.includes(mode) && (!c.only || c.only.includes(this.dev.kind)));
  }

  private tokenize(line: string) {
    const tokens: { t: string; at: number }[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) tokens.push({ t: m[0], at: m.index });
    return tokens;
  }

  private caret(line: string, at: number) {
    return `${" ".repeat(this.prompt().length + at)}^\n${INVALID}`;
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
      const kws = [...new Set(atWord.filter((x) => !x.startsWith("<")))];
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
      if (!a.prefix.every((x, k) => x.startsWith(lower[k]) && lower[k].length >= Math.min(2, x.length))) continue;
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
    const list = [...options.entries()].filter(([x]) => x.startsWith("<") || x.startsWith(prefix));
    if (!list.length) return "% Unrecognized command";
    return list.map(([x, h]) => `  ${(PARAMS[x] ?? x).padEnd(22)} ${h}`).join("\n");
  }

  private nextWords(done: string[]): Map<string, string> {
    const out = new Map<string, string>();
    let cands = this.available(this.mode);
    for (let i = 0; i < done.length; i++) {
      const tok = done[i].toLowerCase();
      const kwMatch = cands.some((c) => c.words[i] && !c.words[i].startsWith("<") && c.words[i].startsWith(tok));
      cands = cands.filter((c) => c.words[i] && (c.words[i].startsWith("<") ? !kwMatch || c.words[i] === "<rest>" : c.words[i].startsWith(tok)));
      if (cands.some((c) => c.words[i] === "<rest>" || c.words[i] === "<if>")) return new Map([["<cr>", ""]]);
    }
    for (const c of cands) {
      const x = c.words[done.length];
      if (x) out.set(x, c.words.length === done.length + 1 ? c.help : out.get(x) ?? "");
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
    const kws = [...this.nextWords(done).keys()].filter((x) => !x.startsWith("<") && x !== "<cr>" && x.startsWith(last.t.toLowerCase()));
    if (kws.length !== 1) return line;
    return line.slice(0, last.at) + kws[0] + " ";
  }

  // ---------- Navigation ----------

  exit(): string | void {
    if (this.mode === "if" || this.mode === "line" || this.mode === "vlan") {
      this.mode = "config";
      this.ifNames = [];
      this.lineName = null;
      this.vlanIds = [];
    } else if (this.mode === "config") this.mode = "priv";
    else {
      this.mode = "user";
      return `\n\n${this.dev.hostname} con0 is now available\n\nPress RETURN to get started.`;
    }
  }

  end(): string {
    this.mode = "priv";
    this.ifNames = [];
    this.lineName = null;
    this.vlanIds = [];
    return `%SYS-5-CONFIG_I: Configured from console by console`;
  }

  enterInterface(raw: string): string | void {
    if (/^range\b/i.test(raw)) return this.enterRange(raw.replace(/^range\s*/i, ""));
    const name = resolveIfaceName(this.dev, raw);
    if (!name) return INVALID;
    const iface = this.net.ensureIface(this.dev, name);
    if (!iface) return INVALID;
    this.ifNames = [name];
    this.mode = "if";
    this.vlanIds = [];
  }

  enterRange(raw: string): string | void {
    const names = resolveIfaceRange(this.dev, raw);
    if (!names) return INVALID;
    this.ifNames = names;
    this.mode = "if";
    this.vlanIds = [];
  }

  removeInterface(raw: string): string | void {
    const name = resolveIfaceName(this.dev, raw);
    if (!name || (!isSvi(name) && !isSubif(name))) return "% Physical interfaces cannot be deleted";
    if (name === SVI) return "% Cannot remove VLAN 1 interface";
    this.net.removeIface(this.dev, name);
  }

  enterLine(rest: string): string | void {
    const m = rest.toLowerCase().match(/^(con|console)\s*0$|^vty\s+(\d+)\s+(\d+)$/);
    if (!m) return INVALID;
    this.lineName = m[1] ? "line con 0" : `line vty ${m[2]} ${m[3]}`;
    this.mode = "line";
  }

  // ---------- VLAN ----------

  enterVlan(rest: string): string | void {
    const ids = parseVlanList(rest.replace(/\s+/g, ""));
    if (!ids || !ids.size) return INVALID;
    for (const v of ids) {
      if (v < 1 || v > 4094) return INVALID;
      if (v >= 1002 && v <= 1005) return `Default VLAN ${v} may not have its name changed.`;
    }
    for (const v of ids) if (v !== 1 && !this.net.vlanExists(this.dev, v)) this.dev.vlans = [...(this.dev.vlans ?? []), { id: v, name: `VLAN${String(v).padStart(4, "0")}` }].sort((a, b) => a.id - b.id);
    this.vlanIds = [...ids];
    this.mode = "vlan";
    this.net.clearDynamic();
  }

  nameVlan(name: string | null): string | void {
    if (this.vlanIds.includes(1)) return "%Default VLAN 1 may not have its name changed.";
    if (this.vlanIds.length > 1 && name) return "% Applying VLAN name to a range of VLANs is not supported";
    for (const v of this.dev.vlans ?? []) if (this.vlanIds.includes(v.id)) v.name = name ? name.slice(0, 32) : `VLAN${String(v.id).padStart(4, "0")}`;
  }

  deleteVlan(rest: string): string | void {
    const ids = parseVlanList(rest.replace(/\s+/g, ""));
    if (!ids || !ids.size) return INVALID;
    if (ids.has(1)) return "%Default VLAN 1 may not be deleted.";
    this.dev.vlans = (this.dev.vlans ?? []).filter((v) => !ids.has(v.id));
    this.net.clearDynamic();
  }

  // ---------- Interfaces ----------

  /** Applique une action à toutes les interfaces sélectionnées et rassemble les messages. */
  each(fn: (i: Iface) => string | void): string {
    return this.ifaces
      .map(fn)
      .filter((x): x is string => !!x)
      .join("\n");
  }

  /** Comme each, mais seulement sur des ports physiques de switch (pas une SVI ni un port routé). */
  eachPort(fn: (i: Iface) => string | void): string {
    if (this.ifaces.some((i) => !this.dev.ifaces.includes(i) || i.routed)) return INVALID;
    const out = this.each(fn);
    this.net.clearDynamic();
    return out;
  }

  setIp(ip: string, mask: string): string | void {
    if (!isIp(ip) || !isMask(mask)) return INVALID;
    if (this.ifNames.length !== 1) return INVALID;
    const i = this.iface;
    if (!i) return;
    const isPhys = this.dev.ifaces.includes(i);
    if (this.dev.kind === "switch" && isPhys) return INVALID;
    if (this.dev.kind === "l3switch" && isPhys && !i.routed) return INVALID;
    if (isSubif(i.name) && !i.encap)
      return "% Configuring IP routing on a LAN subinterface is only allowed if that\nsubinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,\nor ISL vLAN.";
    const overlap = this.net
      .l3Ifaces(this.dev)
      .find((x) => x.name !== i.name && x.ip && x.mask && (networkOf(ip, x.mask) === networkOf(x.ip, x.mask) || networkOf(x.ip, mask) === networkOf(ip, mask)));
    if (overlap) return `% ${networkOf(ip, mask)} overlaps with ${overlap.name}`;
    i.ip = ip;
    i.mask = mask;
    this.net.clearDynamic();
  }

  setAdmin(i: Iface, up: boolean): string {
    if (i.adminUp === up) return "";
    i.adminUp = up;
    this.net.clearDynamic();
    if (!up) return linkMsgs(i.name, false, true);
    if (isSvi(i.name) || isSubif(i.name))
      return this.net.isUp(this.dev, i) ? `%LINK-5-CHANGED: Interface ${i.name}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${i.name}, changed state to up` : "";
    return linkMsgs(i.name, this.net.isUp(this.dev, i));
  }

  setPortMode(raw: string): string | void {
    const v = raw.toLowerCase().trim().replace(/\s+/g, " ");
    const map: Record<string, PortMode> = { access: "access", trunk: "trunk", "dynamic auto": "dynamic-auto", "dynamic desirable": "dynamic-desirable" };
    const mode = Object.entries(map).find(([k]) => k === v || (k.startsWith(v) && v.length >= 2) || k.split(" ").every((w, n) => w.startsWith(v.split(" ")[n] ?? "~")))?.[1];
    if (!mode) return INVALID;
    return this.eachPort((i) => void (i.mode = mode));
  }

  setAccessVlan(raw: string): string | void {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 1 || v > 4094) return INVALID;
    let msg = "";
    if (!this.net.vlanExists(this.dev, v)) {
      this.dev.vlans = [...(this.dev.vlans ?? []), { id: v, name: `VLAN${String(v).padStart(4, "0")}` }].sort((a, b) => a.id - b.id);
      msg = `% Access VLAN does not exist. Creating vlan ${v}`;
    }
    const r = this.eachPort((i) => void (i.accessVlan = v === 1 ? undefined : v));
    return r || msg;
  }

  setNative(raw: string): string | void {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 1 || v > 4094) return INVALID;
    return this.eachPort((i) => void (i.nativeVlan = v === 1 ? undefined : v));
  }

  setAllowed(raw: string): string | void {
    const s = raw.toLowerCase().trim();
    const m = s.match(/^(add|remove|except)\s+(.+)$/);
    const listOf = (x: string) => parseVlanList(x.replace(/\s+/g, ""));
    if (!m && s !== "all" && s !== "none" && !listOf(s)?.size) return INVALID;
    return this.eachPort((i) => {
      const current = parseVlanList(i.allowed) ?? new Set(Array.from({ length: 4094 }, (_, k) => k + 1));
      if (s === "all") i.allowed = undefined;
      else if (s === "none") i.allowed = "none";
      else if (!m) i.allowed = formatVlanList(listOf(s)!);
      else {
        const ids = listOf(m[2]);
        if (!ids?.size) return INVALID;
        if (m[1] === "add") ids.forEach((v) => current.add(v));
        if (m[1] === "remove") ids.forEach((v) => current.delete(v));
        const next = m[1] === "except" ? new Set([...Array.from({ length: 4094 }, (_, k) => k + 1)].filter((v) => !ids.has(v))) : current;
        i.allowed = next.size === 4094 ? undefined : next.size ? formatVlanList(next) : "none";
      }
    });
  }

  setTrunkEncap(raw: string): string | void {
    const v = raw.toLowerCase();
    if (!"dot1q".startsWith(v) && v !== "negotiate") return INVALID;
    if (this.dev.kind !== "l3switch") return INVALID; // les switchs de couche 2 ne gèrent que 802.1Q
    return this.eachPort((i) => void (i.trunkEncap = true));
  }

  setRouted(routed: boolean): string | void {
    if (this.ifaces.some((i) => !this.dev.ifaces.includes(i))) return INVALID;
    this.each((i) => {
      if (!!i.routed === routed) return;
      i.routed = routed || undefined;
      i.ip = i.mask = undefined;
      i.mode = i.accessVlan = i.nativeVlan = i.allowed = i.nonegotiate = i.trunkEncap = undefined;
    });
    this.net.clearDynamic();
  }

  setDot1q(raw: string): string | void {
    const m = raw.trim().toLowerCase().match(/^(\d+)(\s+native)?$/);
    if (!m) return INVALID;
    const v = Number(m[1]);
    if (v < 1 || v > 4094) return INVALID;
    const i = this.iface;
    if (!i || !isSubif(i.name) || this.ifNames.length !== 1) return "% Configuring encapsulation is only allowed on a subinterface";
    const clash = (this.dev.subifs ?? []).find((s) => s !== i && parentOf(s.name) === parentOf(i.name) && s.encap === v);
    if (clash) return `% VLAN ID ${v} is already in use on ${clash.name}`;
    i.encap = v;
    i.native = m[2] ? true : undefined;
    this.net.clearDynamic();
  }

  noIpRouting(): string | void {
    if (this.dev.kind === "router") return;
    this.dev.ipRouting = false;
    this.net.clearDynamic();
  }

  addRoute(args: string[]): string | void {
    const [network, mask, dest] = args;
    if (!isIp(network) || !isMask(mask)) return INVALID;
    const route = isIp(dest) ? { network, mask, nextHop: dest } : { network, mask, iface: resolveIfaceName(this.dev, dest) ?? undefined };
    if (!route.nextHop && !route.iface) return INVALID;
    this.dev.routes = [...this.dev.routes.filter((r) => !(r.network === network && r.mask === mask && r.nextHop === route.nextHop && r.iface === route.iface)), route];
  }

  delRoute(args: string[]): string | void {
    const [network, mask, dest] = args;
    const iface = resolveIfaceName(this.dev, dest);
    this.dev.routes = this.dev.routes.filter((r) => !(r.network === network && r.mask === mask && (r.nextHop === dest || r.iface === iface)));
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

  private status(i: Iface) {
    return !i.adminUp ? "administratively down" : this.net.isUp(this.dev, i) ? "up" : "down";
  }

  showIpIntBrief(): string {
    const rows = allIfaces(this.dev).map((i) => {
      const proto = this.net.isUp(this.dev, i) ? "up" : "down";
      return `${`${i.name} `.padEnd(23)}${(i.ip ?? "unassigned").padEnd(16)}YES ${(i.ip ? "manual" : "unset").padEnd(7)}${this.status(i).padEnd(22)}${proto}`;
    });
    return [`Interface              IP-Address      OK? Method Status                Protocol`, ...rows].join("\n");
  }

  showIpRoute(): string {
    if (!this.net.routes(this.dev)) {
      return `Default gateway is ${this.dev.gateway ?? "not set"}\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty`;
    }
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
    const rows = this.net.arpTable(this.dev).map((e) => `Internet  ${e.ip.padEnd(17)}${e.own ? "-" : "0"}`.padEnd(38) + `${e.mac.padEnd(16)}ARPA   ${e.port}`);
    return [`Protocol  Address          Age (min)  Hardware Addr   Type   Interface`, ...rows].join("\n");
  }

  showMac(): string {
    const rows = this.net.macTable(this.dev).map((e) => `${String(e.vlan).padStart(4)}    ${e.mac.padEnd(18)}DYNAMIC     ${shortIf(e.port)}`);
    return [`          Mac Address Table`, `-------------------------------------------`, ``, `Vlan    Mac Address       Type        Ports`, `----    -----------       --------    -----`, ...rows, `Total Mac Addresses for this criterion: ${rows.length}`].join("\n");
  }

  showVlan(brief: boolean): string {
    const ids = [1, ...(this.dev.vlans ?? []).map((v) => v.id)];
    const header = brief
      ? [`VLAN Name                             Status    Ports`, `---- -------------------------------- --------- -------------------------------`]
      : [`VLAN Name                             Status    Ports`, `---- -------------------------------- --------- -------------------------------`];
    const rows: string[] = [];
    for (const v of ids) {
      const ports = this.dev.ifaces.filter((p) => this.net.isSwitchport(this.dev, p) && this.net.opMode(this.dev, p) === "access" && (p.accessVlan ?? 1) === v).map((p) => shortIf(p.name));
      const chunks: string[][] = [];
      for (let k = 0; k < ports.length; k += 4) chunks.push(ports.slice(k, k + 4));
      const first = `${String(v).padEnd(5)}${this.net.vlanName(this.dev, v).padEnd(33)}active    ${(chunks[0] ?? []).join(", ")}`;
      rows.push(first.trimEnd(), ...chunks.slice(1).map((c) => `${" ".repeat(48)}${c.join(", ")}`));
    }
    rows.push(
      "1002 fddi-default                     act/unsup",
      "1003 token-ring-default               act/unsup",
      "1004 fddinet-default                  act/unsup",
      "1005 trnet-default                    act/unsup"
    );
    if (brief) return [...header, ...rows].join("\n");
    const types = ids.map((v) => `${String(v).padEnd(5)}enet  ${String(100000 + v).padEnd(10)}1500  -      -      -        -    -        0      0`);
    return [...header, ...rows, "", "VLAN Type  SAID       MTU   Parent RingNo BridgeNo Stp  BrdgMode Trans1 Trans2", "---- ----- ---------- ----- ------ ------ -------- ---- -------- ------ ------", ...types].join("\n");
  }

  showTrunk(): string {
    const trunks = this.dev.ifaces.filter((p) => this.net.isSwitchport(this.dev, p) && this.net.isUp(this.dev, p) && this.net.opMode(this.dev, p) === "trunk");
    if (!trunks.length) return "";
    const modeOf = (p: Iface) => ({ trunk: "on", access: "off", "dynamic-auto": "auto", "dynamic-desirable": "desirable" })[p.mode ?? "dynamic-auto"];
    const allowedOf = (p: Iface) => (p.allowed ? (p.allowed === "none" ? "none" : p.allowed) : "1-4094");
    const active = (p: Iface) => {
      const set = parseVlanList(p.allowed);
      const ids = [1, ...(this.dev.vlans ?? []).map((v) => v.id)].filter((v) => !set || set.has(v));
      return ids.length ? formatVlanList(ids) : "none";
    };
    const col = (s: string) => s.padEnd(12);
    return [
      `Port        Mode             Encapsulation  Status        Native vlan`,
      ...trunks.map((p) => `${col(shortIf(p.name))}${modeOf(p).padEnd(17)}${(this.dev.kind === "l3switch" && !p.trunkEncap && p.mode !== "trunk" ? "n-802.1q" : "802.1q").padEnd(15)}${"trunking".padEnd(14)}${p.nativeVlan ?? 1}`),
      "",
      `Port        Vlans allowed on trunk`,
      ...trunks.map((p) => `${col(shortIf(p.name))}${allowedOf(p)}`),
      "",
      `Port        Vlans allowed and active in management domain`,
      ...trunks.map((p) => `${col(shortIf(p.name))}${active(p)}`),
      "",
      `Port        Vlans in spanning tree forwarding state and not pruned`,
      ...trunks.map((p) => `${col(shortIf(p.name))}${active(p)}`),
    ].join("\n");
  }

  showIntStatus(): string {
    const rows = this.dev.ifaces.map((p) => {
      const st = !p.adminUp ? "disabled" : this.net.isUp(this.dev, p) ? "connected" : "notconnect";
      const vlan = p.routed ? "routed" : this.net.opMode(this.dev, p) === "trunk" ? "trunk" : String(p.accessVlan ?? 1);
      const gig = p.name.startsWith("Gigabit");
      return `${shortIf(p.name).padEnd(10)}${p.description.slice(0, 18).padEnd(19)}${st.padEnd(13)}${vlan.padEnd(11)}${(st === "connected" ? "a-full" : "auto").padEnd(8)}${(st === "connected" ? (gig ? "a-1000" : "a-100") : "auto").padEnd(7)}${gig ? "10/100/1000BaseTX" : "10/100BaseTX"}`;
    });
    return [`Port      Name               Status       Vlan       Duplex  Speed Type`, ...rows].join("\n");
  }

  showInterface(raw: string): string {
    const m = raw.trim().match(/^(.*?)\s+switchport$/i);
    const name = resolveIfaceName(this.dev, (m ? m[1] : raw).trim());
    const i = name ? this.net.findIface(this.dev, name) : undefined;
    if (!i) return INVALID;
    if (m) {
      if (!this.net.isSwitchport(this.dev, i)) return `Name: ${shortIf(i.name)}\nSwitchport: Disabled`;
      const op = this.net.opMode(this.dev, i);
      const admin = i.mode ?? "dynamic-auto";
      const vlanTxt = (v: number) => `${v} (${this.net.vlanName(this.dev, v)})`;
      return [
        `Name: ${shortIf(i.name)}`,
        `Switchport: Enabled`,
        `Administrative Mode: ${MODE_LABEL[admin]}`,
        `Operational Mode: ${op === "trunk" ? "trunk" : this.net.isUp(this.dev, i) ? "static access" : "down"}`,
        `Administrative Trunking Encapsulation: dot1q`,
        `Operational Trunking Encapsulation: ${op === "trunk" ? "dot1q" : "native"}`,
        `Negotiation of Trunking: ${i.nonegotiate || admin === "access" ? "Off" : "On"}`,
        `Access Mode VLAN: ${vlanTxt(i.accessVlan ?? 1)}`,
        `Trunking Native Mode VLAN: ${vlanTxt(i.nativeVlan ?? 1)}`,
        `Administrative Native VLAN tagging: enabled`,
        `Voice VLAN: none`,
        `Trunking VLANs Enabled: ${i.allowed ? i.allowed.toUpperCase() : "ALL"}`,
        `Pruning VLANs Enabled: 2-1001`,
      ].join("\n");
    }
    const up = this.net.isUp(this.dev, i);
    const status = !i.adminUp ? "administratively down" : up ? "up" : "down";
    const hw = isSvi(i.name) ? "EtherSVI" : isSubif(i.name) ? "PQ3_TSEC" : i.name.startsWith("Gigabit") ? "Gigabit Ethernet" : "Fast Ethernet";
    const lines = [
      `${i.name} is ${status}, line protocol is ${up ? "up" : "down"}`,
      `  Hardware is ${hw}, address is ${i.mac} (bia ${i.mac})`,
      ...(i.description ? [`  Description: ${i.description}`] : []),
      ...(i.ip && i.mask ? [`  Internet address is ${i.ip}/${maskToPrefix(i.mask)}`] : []),
      `  MTU 1500 bytes, BW ${i.name.startsWith("Fast") ? "100000" : "1000000"} Kbit/sec, DLY 10 usec,`,
      `     reliability 255/255, txload 1/255, rxload 1/255`,
      isSubif(i.name) && i.encap ? `  Encapsulation 802.1Q Virtual LAN, Vlan ID  ${i.encap}.` : `  Encapsulation ARPA, loopback not set`,
      `  ARP type: ARPA, ARP Timeout 04:00:00`,
    ];
    return lines.join("\n");
  }

  showCdp(detail: boolean): string {
    const neighbors = this.dev.ifaces
      .filter((i) => this.net.isUp(this.dev, i))
      .map((i) => ({ local: i, peer: this.net.peerOf(this.dev.id, i.name) }))
      .filter((n): n is { local: Iface; peer: { dev: Device; iface: Iface } } => !!n.peer && n.peer.dev.kind !== "pc");
    const cap = (d: Device) => (d.kind === "router" ? "R B S I" : d.kind === "l3switch" ? "R S I" : "S I");
    if (detail) {
      return neighbors
        .map(({ local, peer }) => {
          const ip = this.net.l3Ifaces(peer.dev).find((x) => x.ip && this.net.isUp(peer.dev, x))?.ip;
          return [
            "-------------------------",
            `Device ID: ${peer.dev.hostname}`,
            "Entry address(es):",
            ...(ip ? [`  IP address: ${ip}`] : []),
            `Platform: KoraLab ${peer.dev.model},  Capabilities: ${cap(peer.dev).replace(/ /g, " ")}`,
            `Interface: ${local.name},  Port ID (outgoing port): ${peer.iface.name}`,
            "Holdtime : 170 sec",
            "",
            "Version :",
            `KoraLab simulated IOS-style software (${MODELS[peer.dev.model]?.label ?? peer.dev.model})`,
          ].join("\n");
        })
        .join("\n\n");
    }
    const rows = neighbors.map(({ local, peer }) => `${peer.dev.hostname.padEnd(17)}${cdpIf(local.name).padEnd(18)}${"170".padEnd(11)}${cap(peer.dev).padStart(9).padEnd(12)}${peer.dev.model.padEnd(10)}${cdpIf(peer.iface.name)}`);
    return [
      "Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge",
      "                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone",
      "",
      "Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID",
      ...rows,
      "",
      `Total cdp entries displayed : ${rows.length}`,
    ].join("\n");
  }

  showDescriptions(): string {
    const rows = allIfaces(this.dev).map((i) => {
      const status = !i.adminUp ? "admin down" : this.net.isUp(this.dev, i) ? "up" : "down";
      const proto = this.net.isUp(this.dev, i) ? "up" : "down";
      return `${shortIf(i.name).padEnd(31)}${status.padEnd(15)}${proto.padEnd(9)}${i.description}`;
    });
    return [`Interface                      Status         Protocol Description`, ...rows].join("\n");
  }

  showVersion(): string {
    const spec = MODELS[this.dev.model];
    return `KoraLab simulated IOS-style software, ${spec?.label ?? this.dev.model}\nThis is a simulation for training purposes (KoraLab is not affiliated with any vendor).\n\n${this.dev.hostname} uptime is 0 minutes\n${spec?.description ?? ""}\n${this.dev.ifaces.length} network interface(s)\nConfiguration register is 0x2102`;
  }

  runningConfig(): string {
    const d = this.dev;
    const out: string[] = ["!", `! KoraLab ${d.model}`, "!", `hostname ${d.hostname}`, "!"];
    const pw = d.extra.includes("service password-encryption");
    const hide = (l: string) =>
      l
        .replace(/^(enable secret|username \S+ (?:privilege \d+ )?secret)\s+(?!\d\s)(\S+).*$/, "$1 5 $$1$$mERr$$hx5rVt7rPNoS4wqbXKX7m0")
        .replace(/^(enable password|username \S+ (?:privilege \d+ )?password)\s+(\S+)$/, (_m, k, v) => (pw ? `${k} 7 0822455D0A16` : `${k} ${v}`));
    for (const l of d.extra) if (!l.startsWith("crypto")) out.push(hide(l));
    if (d.extra.length) out.push("!");
    if (d.kind === "l3switch" && d.ipRouting) out.push("ip routing", "!");
    for (const v of d.vlans ?? []) {
      out.push(`vlan ${v.id}`);
      if (v.name !== `VLAN${String(v.id).padStart(4, "0")}`) out.push(` name ${v.name}`);
      out.push("!");
    }
    const ifaceBlock = (i: Iface) => {
      out.push(`interface ${i.name}`);
      if (i.description) out.push(` description ${i.description}`);
      if (isSubif(i.name) && i.encap) out.push(` encapsulation dot1Q ${i.encap}${i.native ? " native" : ""}`);
      if (this.net.isSwitchport(d, i)) {
        if (i.trunkEncap) out.push(" switchport trunk encapsulation dot1q");
        if (i.accessVlan) out.push(` switchport access vlan ${i.accessVlan}`);
        if (i.nativeVlan) out.push(` switchport trunk native vlan ${i.nativeVlan}`);
        if (i.allowed) out.push(` switchport trunk allowed vlan ${i.allowed}`);
        if (i.mode === "access" || i.mode === "trunk") out.push(` switchport mode ${i.mode}`);
        if (i.mode === "dynamic-desirable") out.push(" switchport mode dynamic desirable");
        if (i.nonegotiate) out.push(" switchport nonegotiate");
      } else {
        if (i.routed) out.push(" no switchport");
        out.push(i.ip ? ` ip address ${i.ip} ${i.mask}` : " no ip address");
      }
      if (!i.adminUp) out.push(" shutdown");
      out.push("!");
    };
    for (const i of d.ifaces) {
      ifaceBlock(i);
      for (const s of (d.subifs ?? []).filter((x) => parentOf(x.name) === i.name)) ifaceBlock(s);
    }
    for (const s of d.svis ?? []) ifaceBlock(s);
    if (d.gateway && isSwitchLike(d)) out.push(`ip default-gateway ${d.gateway}`, "!");
    for (const r of d.routes) out.push(`ip route ${r.network} ${r.mask} ${r.nextHop ?? r.iface}`);
    if (d.routes.length) out.push("!");
    for (const [name, block] of Object.entries(d.lines ?? {})) {
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

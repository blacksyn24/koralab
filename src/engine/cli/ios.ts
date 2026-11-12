// Interpréteur de commandes de style Cisco IOS pour les routeurs et switchs KoraLab.
// Gère les modes, les abréviations (conf t, sh ip int br), l'aide « ? » et la complétion Tab.

import { aclKindFromNumber, parseRule, type Acl } from "../acl";
import { SessionHost, lineAuth, lineBlock, localUser } from "./session";
import { isIp, isMask, maskToPrefix, networkOf, prefixToMask } from "../ip";
import { expand6, isIp6, isLinkLocal6, network6, parseCidr6, show6, withEui64 } from "../ip6";
import {
  MODELS,
  Network,
  SVI,
  allIfaces,
  formatVlanList,
  isLoopback,
  isPortChannel,
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

type Mode = "user" | "priv" | "config" | "if" | "line" | "vlan" | "acl" | "dhcp" | "router";
const SUB: Mode[] = ["if", "line", "vlan", "acl", "dhcp", "router"];

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
  aclName: string | null = null;
  poolName: string | null = null;
  /** Session console ouverte (après le mot de passe de « line con 0 » s'il y en a un) */
  authed = false;
  /** Saisie d'un mot de passe en cours (console ou enable) */
  auth: { kind: "console" | "enable"; stage: "user" | "pass"; user?: string; tries: number } | null = null;
  /** Session vty fermée (exit / logout) */
  closed = false;
  session: SessionHost;
  history: string[] = [];

  constructor(
    public net: Network,
    public dev: Device,
    /** Session ouverte à distance par telnet / ssh */
    public vty = false
  ) {
    this.session = new SessionHost(net, dev, (target) => new IosCli(net, target, true));
    if (vty) this.authed = true;
  }

  masked(): boolean {
    return this.session.busy ? this.session.masked() : this.auth?.stage === "pass";
  }

  /** Mot de passe du mode privilégié : enable secret prioritaire sur enable password. */
  private enablePassword(): string | null {
    const sec = this.dev.extra.find((l) => l.startsWith("enable secret "));
    if (sec) return sec.split(/\s+/).at(-1)!;
    const pw = this.dev.extra.find((l) => l.startsWith("enable password "));
    return pw ? pw.split(/\s+/).at(-1)! : null;
  }

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
    const remote = this.session.prompt();
    if (remote !== null) return remote;
    if (this.auth) return this.auth.stage === "user" ? "Username: " : "Password: ";
    const h = this.dev.hostname;
    if (this.mode === "if") {
      const kind = this.ifNames.length > 1 && !isPortChannel(this.ifNames[0]) ? "if-range" : this.ifName && isSubif(this.ifName) ? "subif" : "if";
      return `${h}(config-${kind})#`;
    }
    if (this.mode === "acl") return `${h}(config-${this.dev.acls?.find((a) => a.name === this.aclName)?.extended ? "ext" : "std"}-nacl)#`;
    return { user: `${h}>`, priv: `${h}#`, config: `${h}(config)#`, line: `${h}(config-line)#`, vlan: `${h}(config-vlan)#`, dhcp: `${h}(dhcp-config)#`, router: `${h}(config-router)#` }[this.mode as "user"];
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
    { modes: ["user"], words: ["enable"], help: "Passer en mode privilégié", run: ({ cli }) => cli.doEnable() },
    { modes: ["user", "priv"], words: ["logout"], help: "Fermer la session", run: ({ cli }) => cli.logout() },
    { modes: PRIV, words: ["disable"], help: "Revenir en mode utilisateur", run: ({ cli }) => void (cli.mode = "user") },
    { modes: PRIV, words: ["configure", "terminal"], help: "Entrer en mode configuration", run: ({ cli }) => ((cli.mode = "config"), "Enter configuration commands, one per line.  End with CNTL/Z.") },
    { modes: ["user", "priv", "config", ...SUB], words: ["exit"], help: "Quitter le mode actuel", run: ({ cli }) => cli.exit() },
    { modes: ["config", ...SUB], words: ["end"], help: "Revenir au mode privilégié", run: ({ cli }) => cli.end() },
    { modes: ["config", ...SUB], words: ["do", "<rest>"], help: "Exécuter une commande du mode privilégié", run: ({ cli, args }) => cli.runAs("priv", args[0]) },

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
    { modes: EXEC, words: ["ping", "<ip>"], help: "Tester la connectivité (IPv4 ou IPv6)", run: ({ cli, args }) => cli.ping(args[0]) },
    { modes: EXEC, words: ["ping", "ipv6", "<word>"], help: "Ping IPv6", run: ({ cli, args }) => cli.ping(args[0]) },
    { modes: EXEC, words: ["traceroute", "<ip>"], help: "Suivre le chemin vers une destination", run: ({ cli, args }) => cli.trace(args[0]) },
    { modes: EXEC, words: ["traceroute", "ipv6", "<word>"], help: "Traceroute IPv6", run: ({ cli, args }) => cli.trace(args[0]) },
    { modes: PRIV, words: ["copy", "running-config", "startup-config"], help: "Sauvegarder la configuration", run: ({ cli }) => cli.save() },
    { modes: PRIV, words: ["write", "memory"], help: "Sauvegarder la configuration", run: ({ cli }) => cli.save() },
    { modes: PRIV, words: ["write"], help: "Sauvegarder la configuration", run: ({ cli }) => cli.save() },

    // --- Configuration globale ---
    { modes: CONF, words: ["hostname", "<word>"], help: "Nom de l'équipement", run: ({ cli, args }) => void (cli.dev.hostname = args[0].slice(0, 63)) },
    { modes: ["config", "if", "vlan"], words: ["interface", "<if>"], help: "Configurer une interface", run: ({ cli, args }) => cli.enterInterface(args[0]) },
    { modes: ["config", "if", "vlan"], words: ["interface", "range", "<rest>"], help: "Configurer plusieurs interfaces", run: ({ cli, args }) => cli.enterRange(args[0]), only: NET },
    { modes: CONF, words: ["no", "interface", "<if>"], help: "Supprimer une SVI ou une sous-interface", run: ({ cli, args }) => cli.removeInterface(args[0]) },
    { modes: CONF, words: ["ip", "route", "<ip>", "<mask>", "<rest>"], help: "Route statique : prochain saut et/ou interface [distance]", run: ({ cli, args }) => cli.addRoute(args), only: L3 },
    { modes: CONF, words: ["no", "ip", "route", "<ip>", "<mask>", "<rest>"], help: "Supprimer une route statique", run: ({ cli, args }) => cli.delRoute(args), only: L3 },
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

    // --- ACL ---
    { modes: CONF, words: ["access-list", "<num>", "<rest>"], help: "ACL numérotée (1-99 standard, 100-199 étendue)", run: ({ cli, args }) => cli.numberedAcl(args[0], args[1]), only: NET },
    { modes: CONF, words: ["no", "access-list", "<num>"], help: "Supprimer une ACL", run: ({ cli, args }) => void (cli.dev.acls = (cli.dev.acls ?? []).filter((a) => a.name !== args[0])), only: NET },
    { modes: CONF, words: ["ip", "access-list", "standard", "<word>"], help: "ACL standard nommée", run: ({ cli, args }) => cli.enterAcl(args[0], false), only: NET },
    { modes: CONF, words: ["ip", "access-list", "extended", "<word>"], help: "ACL étendue nommée", run: ({ cli, args }) => cli.enterAcl(args[0], true), only: NET },
    { modes: CONF, words: ["no", "ip", "access-list", "standard", "<word>"], help: "Supprimer l'ACL", run: ({ cli, args }) => void (cli.dev.acls = (cli.dev.acls ?? []).filter((a) => a.name !== args[0])), only: NET },
    { modes: CONF, words: ["no", "ip", "access-list", "extended", "<word>"], help: "Supprimer l'ACL", run: ({ cli, args }) => void (cli.dev.acls = (cli.dev.acls ?? []).filter((a) => a.name !== args[0])), only: NET },
    { modes: ["acl"], words: ["permit", "<rest>"], help: "Autoriser", run: ({ cli, args }) => cli.aclLine(null, `permit ${args[0]}`) },
    { modes: ["acl"], words: ["deny", "<rest>"], help: "Refuser", run: ({ cli, args }) => cli.aclLine(null, `deny ${args[0]}`) },
    { modes: ["acl"], words: ["remark", "<rest>"], help: "Commentaire", run: ({ cli, args }) => cli.aclRemark(args[0]) },
    { modes: ["acl"], words: ["<num>", "<rest>"], help: "Règle avec numéro de séquence", run: ({ cli, args }) => cli.aclLine(Number(args[0]), args[1]) },
    { modes: ["acl"], words: ["no", "<num>"], help: "Supprimer une règle", run: ({ cli, args }) => cli.aclDelete(Number(args[0])) },
    { modes: IFM, words: ["ip", "access-group", "<rest>"], help: "Appliquer une ACL (in ou out)", run: ({ cli, args }) => cli.accessGroup(args[0], true), only: NET },
    { modes: IFM, words: ["no", "ip", "access-group", "<rest>"], help: "Retirer une ACL", run: ({ cli, args }) => cli.accessGroup(args[0], false), only: NET },
    { modes: EXEC, words: ["show", "access-lists"], help: "ACL et compteurs", run: ({ cli }) => cli.showAcls(), only: NET },
    { modes: EXEC, words: ["show", "access-lists", "<word>"], help: "Une ACL", run: ({ cli, args }) => cli.showAcls(args[0]), only: NET },
    { modes: EXEC, words: ["show", "ip", "access-lists"], help: "ACL IP et compteurs", run: ({ cli }) => cli.showAcls(), only: NET },
    { modes: PRIV, words: ["clear", "access-list", "counters"], help: "Remettre les compteurs à zéro", run: ({ cli }) => void cli.net.clearAclCounters(cli.dev), only: NET },
    { modes: EXEC, words: ["show", "ip", "interface", "<rest>"], help: "Détail IP d'une interface (ACL, NAT, relais DHCP)", run: ({ cli, args }) => cli.showIpInterface(args[0]) },

    // --- DHCP ---
    { modes: CONF, words: ["ip", "dhcp", "pool", "<word>"], help: "Pool DHCP", run: ({ cli, args }) => cli.enterPool(args[0]), only: L3 },
    { modes: CONF, words: ["no", "ip", "dhcp", "pool", "<word>"], help: "Supprimer un pool", run: ({ cli, args }) => void (cli.dev.dhcpPools = (cli.dev.dhcpPools ?? []).filter((p) => p.name !== args[0])), only: L3 },
    { modes: CONF, words: ["ip", "dhcp", "excluded-address", "<rest>"], help: "Adresses à ne pas distribuer", run: ({ cli, args }) => cli.excluded(args[0], true), only: L3 },
    { modes: CONF, words: ["no", "ip", "dhcp", "excluded-address", "<rest>"], help: "Retirer une plage exclue", run: ({ cli, args }) => cli.excluded(args[0], false), only: L3 },
    { modes: ["dhcp"], words: ["network", "<rest>"], help: "Réseau du pool (adresse + masque ou /préfixe)", run: ({ cli, args }) => cli.poolNetwork(args[0]) },
    { modes: ["dhcp"], words: ["default-router", "<ip>"], help: "Passerelle donnée aux clients", run: ({ cli, args }) => cli.poolSet("router", args[0]) },
    { modes: ["dhcp"], words: ["dns-server", "<ip>"], help: "Serveur DNS donné aux clients", run: ({ cli, args }) => cli.poolSet("dns", args[0]) },
    { modes: ["dhcp"], words: ["domain-name", "<word>"], help: "Nom de domaine", run: ({ cli, args }) => cli.poolSet("domain", args[0]) },
    { modes: ["dhcp"], words: ["option", "43", "<rest>"], help: "Adresse du contrôleur Wi-Fi pour les points d'accès (hex f104… ou ip A.B.C.D)", run: ({ cli, args }) => cli.option43(args[0]) },
    { modes: ["dhcp"], words: ["no", "option", "43"], help: "Retirer l'option 43", run: ({ cli }) => void (cli.pool() && (cli.pool()!.wlc = undefined)) },
    { modes: ["dhcp"], words: ["lease", "<rest>"], help: "Durée du bail (jours heures minutes)", run: ({ cli, args }) => cli.poolSet("lease", args[0]) },
    { modes: IFM, words: ["ip", "helper-address", "<ip>"], help: "Relais DHCP vers un serveur", run: ({ cli, args }) => cli.helper(args[0], true), only: L3 },
    { modes: IFM, words: ["no", "ip", "helper-address"], help: "Supprimer les relais DHCP", run: ({ cli }) => cli.each((i) => void (i.helpers = undefined)), only: L3 },
    { modes: IFM, words: ["ip", "address", "dhcp"], help: "Obtenir l'adresse par DHCP", run: ({ cli }) => cli.ipDhcp() },
    { modes: EXEC, words: ["show", "ip", "dhcp", "binding"], help: "Baux DHCP attribués", run: ({ cli }) => cli.showDhcpBinding(), only: L3 },
    { modes: EXEC, words: ["show", "ip", "dhcp", "pool"], help: "Pools DHCP", run: ({ cli }) => cli.showDhcpPool(), only: L3 },
    { modes: PRIV, words: ["clear", "ip", "dhcp", "binding", "<rest>"], help: "Effacer des baux (* pour tous)", run: ({ cli, args }) => cli.clearBinding(args[0]), only: L3 },

    // --- NAT ---
    { modes: IFM, words: ["ip", "nat", "inside"], help: "Interface côté réseau interne", run: ({ cli }) => cli.each((i) => void ((i.nat = "inside"), cli.net.clearNat(cli.dev))), only: ["router"] },
    { modes: IFM, words: ["ip", "nat", "outside"], help: "Interface côté Internet", run: ({ cli }) => cli.each((i) => void ((i.nat = "outside"), cli.net.clearNat(cli.dev))), only: ["router"] },
    { modes: IFM, words: ["no", "ip", "nat", "<rest>"], help: "Retirer le rôle NAT", run: ({ cli }) => cli.each((i) => void (i.nat = undefined)), only: ["router"] },
    { modes: CONF, words: ["ip", "nat", "inside", "source", "static", "<ip>", "<ip>"], help: "NAT statique (local global)", run: ({ cli, args }) => cli.natStatic(args[0], args[1], true), only: ["router"] },
    { modes: CONF, words: ["no", "ip", "nat", "inside", "source", "static", "<ip>", "<ip>"], help: "Supprimer le NAT statique", run: ({ cli, args }) => cli.natStatic(args[0], args[1], false), only: ["router"] },
    { modes: CONF, words: ["ip", "nat", "inside", "source", "list", "<word>", "<rest>"], help: "NAT dynamique : pool <nom> [overload] ou interface <if> overload", run: ({ cli, args }) => cli.natRule(args[0], args[1]), only: ["router"] },
    { modes: CONF, words: ["no", "ip", "nat", "inside", "source", "list", "<word>", "<rest>"], help: "Supprimer la règle NAT", run: ({ cli, args }) => cli.natRuleDelete(args[0]), only: ["router"] },
    { modes: CONF, words: ["ip", "nat", "pool", "<word>", "<rest>"], help: "Pool NAT : début fin netmask masque (ou prefix-length N)", run: ({ cli, args }) => cli.natPool(args[0], args[1]), only: ["router"] },
    { modes: CONF, words: ["no", "ip", "nat", "pool", "<word>"], help: "Supprimer le pool NAT", run: ({ cli, args }) => void (cli.natCfg().pools = cli.natCfg().pools.filter((p) => p.name !== args[0])), only: ["router"] },
    { modes: EXEC, words: ["show", "ip", "nat", "translations"], help: "Table des traductions NAT", run: ({ cli }) => cli.showNat(), only: ["router"] },
    { modes: EXEC, words: ["show", "ip", "nat", "statistics"], help: "Statistiques NAT", run: ({ cli }) => cli.showNatStats(), only: ["router"] },
    { modes: PRIV, words: ["clear", "ip", "nat", "translation", "<rest>"], help: "Effacer les traductions dynamiques (*)", run: ({ cli }) => void cli.net.clearNat(cli.dev), only: ["router"] },

    // --- Tests de connexion ---
    { modes: EXEC, words: ["telnet", "<ip>"], help: "Ouvrir une session telnet", run: ({ cli, args }) => (isIp(args[0]) ? cli.session.open(args[0], "telnet") : INVALID) },
    { modes: EXEC, words: ["ssh", "<rest>"], help: "Ouvrir une session SSH (ssh -l utilisateur ip)", run: ({ cli, args }) => cli.sshCmd(args[0]) },

    // --- OSPF ---
    { modes: CONF, words: ["router", "ospf", "<num>"], help: "Processus OSPF", run: ({ cli, args }) => cli.enterOspf(Number(args[0])), only: L3 },
    { modes: CONF, words: ["no", "router", "ospf", "<num>"], help: "Supprimer le processus OSPF", run: ({ cli }) => void ((cli.dev.ospf = undefined), cli.net.clearDynamic()), only: L3 },
    { modes: ["router"], words: ["network", "<ip>", "<mask>", "area", "<num>"], help: "Activer OSPF sur les interfaces de ce réseau (adresse wildcard area n)", run: ({ cli, args }) => cli.ospfNetwork(args, true) },
    { modes: ["router"], words: ["no", "network", "<ip>", "<mask>", "area", "<num>"], help: "Retirer un réseau", run: ({ cli, args }) => cli.ospfNetwork(args, false) },
    { modes: ["router"], words: ["router-id", "<ip>"], help: "Identifiant du routeur", run: ({ cli, args }) => cli.ospfSet((o) => (o.routerId = args[0]), args[0]) },
    { modes: ["router"], words: ["no", "router-id"], help: "Identifiant automatique", run: ({ cli }) => cli.ospfSet((o) => (o.routerId = undefined)) },
    { modes: ["router"], words: ["passive-interface", "default"], help: "Toutes les interfaces passives", run: ({ cli }) => cli.ospfSet((o) => ((o.passiveDefault = true), (o.noPassive = []))) },
    { modes: ["router"], words: ["no", "passive-interface", "default"], help: "Plus d'interfaces passives par défaut", run: ({ cli }) => cli.ospfSet((o) => ((o.passiveDefault = false), (o.passive = []))) },
    { modes: ["router"], words: ["passive-interface", "<if>"], help: "Ne pas envoyer de Hello sur l'interface", run: ({ cli, args }) => cli.ospfPassive(args[0], true) },
    { modes: ["router"], words: ["no", "passive-interface", "<if>"], help: "Réactiver les Hello", run: ({ cli, args }) => cli.ospfPassive(args[0], false) },
    { modes: ["router"], words: ["default-information", "originate"], help: "Annoncer la route par défaut", run: ({ cli }) => cli.ospfSet((o) => (o.defaultOriginate = true)) },
    { modes: ["router"], words: ["no", "default-information", "originate"], help: "Ne plus annoncer la route par défaut", run: ({ cli }) => cli.ospfSet((o) => (o.defaultOriginate = undefined)) },
    { modes: ["router"], words: ["auto-cost", "reference-bandwidth", "<num>"], help: "Bande passante de référence (Mbit/s)", run: ({ cli, args }) => cli.ospfSet((o) => (o.refBw = Number(args[0]) || 100)) },
    { modes: IFM, words: ["ip", "ospf", "<num>", "area", "<num>"], help: "Activer OSPF sur l'interface", run: ({ cli, args }) => cli.ifOspf((i) => (i.ospfArea = { pid: Number(args[0]), area: Number(args[1]) })), only: L3 },
    { modes: IFM, words: ["ip", "ospf", "cost", "<num>"], help: "Coût OSPF de l'interface", run: ({ cli, args }) => cli.ifOspf((i) => (i.ospfCost = Number(args[0]))), only: L3 },
    { modes: IFM, words: ["ip", "ospf", "priority", "<num>"], help: "Priorité pour l'élection DR/BDR (0 = jamais DR)", run: ({ cli, args }) => cli.ifOspf((i) => (i.ospfPriority = Number(args[0]))), only: L3 },
    { modes: IFM, words: ["ip", "ospf", "hello-interval", "<num>"], help: "Intervalle Hello (s)", run: ({ cli, args }) => cli.ifOspf((i) => ((i.ospfHello = Number(args[0])), i.ospfDead === undefined && (i.ospfDead = Number(args[0]) * 4))), only: L3 },
    { modes: IFM, words: ["ip", "ospf", "dead-interval", "<num>"], help: "Délai Dead (s)", run: ({ cli, args }) => cli.ifOspf((i) => (i.ospfDead = Number(args[0]))), only: L3 },
    { modes: IFM, words: ["ip", "ospf", "network", "point-to-point"], help: "Type de réseau point à point (pas de DR)", run: ({ cli }) => cli.ifOspf((i) => (i.ospfP2p = true)), only: L3 },
    { modes: IFM, words: ["no", "ip", "ospf", "<rest>"], help: "Retirer un réglage OSPF", run: ({ cli, args }) => cli.noIfOspf(args[0]), only: L3 },
    { modes: EXEC, words: ["show", "ip", "ospf", "neighbor"], help: "Voisins OSPF", run: ({ cli }) => cli.showOspfNeighbors(), only: L3 },
    { modes: EXEC, words: ["show", "ip", "ospf", "interface", "brief"], help: "Interfaces OSPF (résumé)", run: ({ cli }) => cli.showOspfIfBrief(), only: L3 },
    { modes: EXEC, words: ["show", "ip", "ospf", "interface", "<rest>"], help: "Interface OSPF en détail", run: ({ cli, args }) => cli.showOspfIf(args[0]), only: L3 },
    { modes: EXEC, words: ["show", "ip", "ospf", "interface"], help: "Interfaces OSPF en détail", run: ({ cli }) => cli.showOspfIf(null), only: L3 },
    { modes: EXEC, words: ["show", "ip", "ospf", "database"], help: "Base de données OSPF (LSA)", run: ({ cli }) => cli.showOspfDb(), only: L3 },
    { modes: EXEC, words: ["show", "ip", "ospf"], help: "Processus OSPF", run: ({ cli }) => cli.showOspf(), only: L3 },
    { modes: EXEC, words: ["show", "ip", "protocols"], help: "Protocoles de routage actifs", run: ({ cli }) => cli.showProtocols(), only: L3 },
    { modes: EXEC, words: ["show", "ip", "route", "<word>"], help: "Filtrer : connected, static, ospf, ou une adresse", run: ({ cli, args }) => cli.showIpRoute(args[0]), only: NET },
    { modes: PRIV, words: ["clear", "ip", "ospf", "process"], help: "Redémarrer OSPF", run: ({ cli }) => ((cli.net.clearDynamic(), "Reset ALL OSPF processes? [no]: yes")), only: L3 },

    // --- Spanning Tree ---
    { modes: CONF, words: ["spanning-tree", "mode", "<word>"], help: "pvst ou rapid-pvst", run: ({ cli, args }) => cli.stpMode(args[0]), only: SW },
    { modes: CONF, words: ["spanning-tree", "vlan", "<rest>"], help: "<vlan> priority <n> | root primary | root secondary", run: ({ cli, args }) => cli.stpVlan(args[0], true), only: SW },
    { modes: CONF, words: ["no", "spanning-tree", "vlan", "<rest>"], help: "Priorité par défaut", run: ({ cli, args }) => cli.stpVlan(args[0], false), only: SW },
    { modes: CONF, words: ["spanning-tree", "portfast", "<rest>"], help: "default | bpduguard default (edge facultatif)", run: ({ cli, args }) => cli.stpGlobal(args[0], true), only: SW },
    { modes: CONF, words: ["no", "spanning-tree", "portfast", "<rest>"], help: "Désactiver", run: ({ cli, args }) => cli.stpGlobal(args[0], false), only: SW },
    { modes: IFM, words: ["spanning-tree", "portfast"], help: "Port d'accès vers un hôte (passe tout de suite en FWD)", run: ({ cli }) => cli.eachPort((i) => void (i.portfast = true)), only: SW },
    { modes: IFM, words: ["spanning-tree", "portfast", "<rest>"], help: "edge, trunk ou disable", run: ({ cli, args }) => cli.eachPort((i) => void (i.portfast = !args[0].toLowerCase().startsWith("dis"))), only: SW },
    { modes: IFM, words: ["no", "spanning-tree", "portfast"], help: "Désactiver PortFast", run: ({ cli }) => cli.eachPort((i) => void (i.portfast = undefined)), only: SW },
    { modes: IFM, words: ["spanning-tree", "bpduguard", "<word>"], help: "enable ou disable", run: ({ cli, args }) => cli.eachPort((i) => void (i.bpduguard = args[0].toLowerCase().startsWith("e"))), only: SW },
    { modes: IFM, words: ["no", "spanning-tree", "bpduguard"], help: "BPDU Guard par défaut", run: ({ cli }) => cli.eachPort((i) => void (i.bpduguard = undefined)), only: SW },
    { modes: IFM, words: ["spanning-tree", "cost", "<num>"], help: "Coût STP du port", run: ({ cli, args }) => cli.eachPort((i) => void (i.stpCost = Number(args[0]) || undefined)), only: SW },
    { modes: IFM, words: ["spanning-tree", "port-priority", "<num>"], help: "Priorité du port (multiple de 16)", run: ({ cli, args }) => (Number(args[0]) % 16 ? "% Port Priority in increments of 16 is required" : cli.eachPort((i) => void (i.stpPrio = Number(args[0])))), only: SW },
    { modes: EXEC, words: ["show", "spanning-tree"], help: "Spanning Tree de tous les VLAN", run: ({ cli }) => cli.showStp(null), only: SW },
    { modes: EXEC, words: ["show", "spanning-tree", "vlan", "<num>"], help: "Spanning Tree d'un VLAN", run: ({ cli, args }) => cli.showStp(Number(args[0])), only: SW },
    { modes: EXEC, words: ["show", "spanning-tree", "summary"], help: "Résumé du Spanning Tree", run: ({ cli }) => cli.showStpSummary(), only: SW },

    // --- EtherChannel ---
    { modes: IFM, words: ["channel-group", "<num>", "mode", "<word>"], help: "active/passive (LACP), desirable/auto (PAgP) ou on", run: ({ cli, args }) => cli.channelGroup(Number(args[0]), args[1]), only: SW },
    { modes: IFM, words: ["no", "channel-group"], help: "Retirer le port de l'EtherChannel", run: ({ cli }) => cli.eachPort((i) => void (i.channel = undefined)), only: SW },
    { modes: EXEC, words: ["show", "etherchannel", "summary"], help: "Résumé des EtherChannel", run: ({ cli }) => cli.showEtherchannel(), only: SW },

    // --- Sécurité des ports, DHCP snooping, DAI ---
    { modes: IFM, words: ["switchport", "port-security"], help: "Activer la sécurité du port", run: ({ cli }) => cli.psecEnable(true), only: SW },
    { modes: IFM, words: ["no", "switchport", "port-security"], help: "Désactiver la sécurité du port", run: ({ cli }) => cli.psecEnable(false), only: SW },
    { modes: IFM, words: ["switchport", "port-security", "maximum", "<num>"], help: "Nombre maximal d'adresses MAC", run: ({ cli, args }) => cli.psecSet((p) => (p.max = Number(args[0]))), only: SW },
    { modes: IFM, words: ["switchport", "port-security", "violation", "<word>"], help: "shutdown, restrict ou protect", run: ({ cli, args }) => cli.psecViolation(args[0]), only: SW },
    { modes: IFM, words: ["switchport", "port-security", "mac-address", "sticky"], help: "Mémoriser les adresses apprises", run: ({ cli }) => cli.psecSet((p) => (p.sticky = true)), only: SW },
    { modes: IFM, words: ["no", "switchport", "port-security", "mac-address", "sticky"], help: "Ne plus mémoriser", run: ({ cli }) => cli.psecSet((p) => ((p.sticky = undefined), (p.macs = p.macs?.filter((m) => !m.startsWith("sticky:"))))), only: SW },
    { modes: IFM, words: ["switchport", "port-security", "mac-address", "<word>"], help: "Adresse MAC autorisée (aaaa.bbbb.cccc)", run: ({ cli, args }) => cli.psecMac(args[0]), only: SW },
    { modes: IFM, words: ["ip", "dhcp", "snooping", "trust"], help: "Port fiable (vers le vrai serveur DHCP)", run: ({ cli }) => cli.eachPort((i) => void (i.dhcpTrust = true)), only: SW },
    { modes: IFM, words: ["no", "ip", "dhcp", "snooping", "trust"], help: "Port non fiable", run: ({ cli }) => cli.eachPort((i) => void (i.dhcpTrust = undefined)), only: SW },
    { modes: IFM, words: ["ip", "dhcp", "snooping", "limit", "rate", "<num>"], help: "Limite de messages DHCP par seconde", run: () => undefined, only: SW },
    { modes: IFM, words: ["ip", "arp", "inspection", "trust"], help: "Port fiable pour l'inspection ARP", run: ({ cli }) => cli.eachPort((i) => void (i.arpTrust = true)), only: SW },
    { modes: IFM, words: ["no", "ip", "arp", "inspection", "trust"], help: "Port non fiable", run: ({ cli }) => cli.eachPort((i) => void (i.arpTrust = undefined)), only: SW },
    { modes: CONF, words: ["ip", "dhcp", "snooping"], help: "Activer le DHCP snooping", run: ({ cli }) => void ((cli.dev.snooping ??= { enabled: true, vlans: [] }).enabled = true), only: SW },
    { modes: CONF, words: ["no", "ip", "dhcp", "snooping"], help: "Désactiver le DHCP snooping", run: ({ cli }) => void (cli.dev.snooping && (cli.dev.snooping.enabled = false)), only: SW },
    { modes: CONF, words: ["ip", "dhcp", "snooping", "vlan", "<rest>"], help: "VLAN surveillés", run: ({ cli, args }) => cli.snoopVlans(args[0], true), only: SW },
    { modes: CONF, words: ["no", "ip", "dhcp", "snooping", "vlan", "<rest>"], help: "Ne plus surveiller ces VLAN", run: ({ cli, args }) => cli.snoopVlans(args[0], false), only: SW },
    { modes: CONF, words: ["ip", "dhcp", "snooping", "information", "option"], help: "Option 82", run: () => undefined, only: SW },
    { modes: CONF, words: ["no", "ip", "dhcp", "snooping", "information", "option"], help: "Désactiver l'option 82", run: () => undefined, only: SW },
    { modes: CONF, words: ["ip", "arp", "inspection", "vlan", "<rest>"], help: "Inspection ARP dynamique (DAI) sur ces VLAN", run: ({ cli, args }) => cli.daiVlans(args[0], true), only: SW },
    { modes: CONF, words: ["no", "ip", "arp", "inspection", "vlan", "<rest>"], help: "Désactiver la DAI", run: ({ cli, args }) => cli.daiVlans(args[0], false), only: SW },
    { modes: CONF, words: ["errdisable", "recovery", "<rest>"], help: "Réactivation automatique des ports err-disabled", run: () => undefined, only: SW },
    { modes: EXEC, words: ["show", "port-security"], help: "Ports sécurisés", run: ({ cli }) => cli.showPsec(), only: SW },
    { modes: EXEC, words: ["show", "port-security", "interface", "<rest>"], help: "Sécurité d'un port", run: ({ cli, args }) => cli.showPsecIf(args[0]), only: SW },
    { modes: EXEC, words: ["show", "port-security", "address"], help: "Adresses MAC sécurisées", run: ({ cli }) => cli.showPsecAddr(), only: SW },
    { modes: EXEC, words: ["show", "ip", "dhcp", "snooping"], help: "État du DHCP snooping", run: ({ cli }) => cli.showSnooping(), only: SW },
    { modes: EXEC, words: ["show", "ip", "dhcp", "snooping", "binding"], help: "Table des baux observés", run: ({ cli }) => cli.showSnoopBinding(), only: SW },
    { modes: EXEC, words: ["show", "ip", "arp", "inspection"], help: "État de l'inspection ARP", run: ({ cli }) => cli.showDai(), only: SW },
    { modes: EXEC, words: ["show", "interfaces", "status", "err-disabled"], help: "Ports err-disabled", run: ({ cli }) => cli.showErrdis(), only: SW },

    // --- IPv6 ---
    { modes: CONF, words: ["ipv6", "unicast-routing"], help: "Activer le routage IPv6", run: ({ cli }) => void ((cli.dev.ipv6Routing = true), cli.net.clearDynamic()), only: L3 },
    { modes: CONF, words: ["no", "ipv6", "unicast-routing"], help: "Désactiver le routage IPv6", run: ({ cli }) => void ((cli.dev.ipv6Routing = undefined), cli.net.clearDynamic()), only: L3 },
    { modes: CONF, words: ["ipv6", "route", "<word>", "<rest>"], help: "Route statique IPv6 : préfixe/longueur, prochain saut et/ou interface [distance]", run: ({ cli, args }) => cli.route6(args[0], args[1], true), only: L3 },
    { modes: CONF, words: ["no", "ipv6", "route", "<word>", "<rest>"], help: "Supprimer une route IPv6", run: ({ cli, args }) => cli.route6(args[0], args[1], false), only: L3 },
    { modes: IFM, words: ["ipv6", "address", "<rest>"], help: "Adresse IPv6 : 2001:db8::1/64 [eui-64], link-local, ou autoconfig", run: ({ cli, args }) => cli.addr6(args[0], true) },
    { modes: IFM, words: ["no", "ipv6", "address"], help: "Supprimer les adresses IPv6", run: ({ cli }) => cli.each((i) => void ((i.ipv6 = undefined), (i.ll = undefined), (i.ipv6Autoconfig = undefined), cli.net.clearDynamic())) },
    { modes: IFM, words: ["no", "ipv6", "address", "<rest>"], help: "Supprimer une adresse IPv6", run: ({ cli, args }) => cli.addr6(args[0], false) },
    { modes: IFM, words: ["ipv6", "enable"], help: "Activer IPv6 (adresse link-local)", run: ({ cli }) => cli.each((i) => void ((i.ipv6Enabled = true), cli.net.clearDynamic())) },
    { modes: IFM, words: ["no", "ipv6", "enable"], help: "Désactiver IPv6", run: ({ cli }) => cli.each((i) => void (i.ipv6Enabled = undefined)) },
    { modes: EXEC, words: ["show", "ipv6", "interface", "brief"], help: "Adresses IPv6 des interfaces", run: ({ cli }) => cli.showIpv6Brief() },
    { modes: EXEC, words: ["show", "ipv6", "interface", "<rest>"], help: "Détail IPv6 d'une interface", run: ({ cli, args }) => cli.showIpv6If(args[0]) },
    { modes: EXEC, words: ["show", "ipv6", "route"], help: "Table de routage IPv6", run: ({ cli }) => cli.showIpv6Route(), only: L3 },
    { modes: EXEC, words: ["show", "ipv6", "route", "<word>"], help: "connected ou static", run: ({ cli, args }) => cli.showIpv6Route(args[0]), only: L3 },
    { modes: EXEC, words: ["show", "ipv6", "neighbors"], help: "Voisins IPv6 (NDP)", run: ({ cli }) => cli.showNd() },

    // --- HSRP ---
    { modes: IFM, words: ["standby", "<num>", "ip", "<ip>"], help: "Adresse IP virtuelle du groupe HSRP", run: ({ cli, args }) => cli.hsrp(Number(args[0]), (g) => (g.vip = args[1]), args[1]), only: L3 },
    { modes: IFM, words: ["standby", "<num>", "ip"], help: "Rejoindre le groupe (adresse apprise du routeur actif)", run: ({ cli, args }) => cli.hsrp(Number(args[0]), () => undefined), only: L3 },
    { modes: IFM, words: ["standby", "<num>", "priority", "<num>"], help: "Priorité (100 par défaut, la plus haute devient active)", run: ({ cli, args }) => cli.hsrp(Number(args[0]), (g) => (g.priority = Number(args[1]))), only: L3 },
    { modes: IFM, words: ["standby", "<num>", "preempt"], help: "Reprendre le rôle actif dès que possible", run: ({ cli, args }) => cli.hsrp(Number(args[0]), (g) => (g.preempt = true)), only: L3 },
    { modes: IFM, words: ["standby", "version", "<num>"], help: "Version HSRP (1 ou 2)", run: ({ cli, args }) => cli.hsrpVersion(Number(args[0])), only: L3 },
    { modes: IFM, words: ["no", "standby", "<rest>"], help: "Retirer HSRP", run: ({ cli, args }) => cli.noHsrp(args[0]), only: L3 },
    { modes: EXEC, words: ["show", "standby"], help: "État HSRP détaillé", run: ({ cli }) => cli.showStandby(false), only: L3 },
    { modes: EXEC, words: ["show", "standby", "brief"], help: "État HSRP résumé", run: ({ cli }) => cli.showStandby(true), only: L3 },

    // --- CDP / LLDP ---
    { modes: CONF, words: ["cdp", "run"], help: "Activer CDP", run: ({ cli }) => void (cli.dev.cdpOff = undefined), only: NET },
    { modes: CONF, words: ["no", "cdp", "run"], help: "Désactiver CDP", run: ({ cli }) => void (cli.dev.cdpOff = true), only: NET },
    { modes: IFM, words: ["cdp", "enable"], help: "CDP sur l'interface", run: ({ cli }) => cli.each((i) => void (i.cdpOff = undefined)), only: NET },
    { modes: IFM, words: ["no", "cdp", "enable"], help: "Pas de CDP sur l'interface", run: ({ cli }) => cli.each((i) => void (i.cdpOff = true)), only: NET },
    { modes: CONF, words: ["lldp", "run"], help: "Activer LLDP", run: ({ cli }) => void (cli.dev.lldpOn = true), only: NET },
    { modes: CONF, words: ["no", "lldp", "run"], help: "Désactiver LLDP", run: ({ cli }) => void (cli.dev.lldpOn = undefined), only: NET },
    { modes: IFM, words: ["lldp", "transmit"], help: "Envoyer LLDP", run: ({ cli }) => cli.each((i) => void (i.lldpTx = undefined)), only: NET },
    { modes: IFM, words: ["no", "lldp", "transmit"], help: "Ne pas envoyer LLDP", run: ({ cli }) => cli.each((i) => void (i.lldpTx = false)), only: NET },
    { modes: IFM, words: ["lldp", "receive"], help: "Recevoir LLDP", run: ({ cli }) => cli.each((i) => void (i.lldpRx = undefined)), only: NET },
    { modes: IFM, words: ["no", "lldp", "receive"], help: "Ne pas recevoir LLDP", run: ({ cli }) => cli.each((i) => void (i.lldpRx = false)), only: NET },
    { modes: EXEC, words: ["show", "lldp", "neighbors"], help: "Voisins LLDP", run: ({ cli }) => cli.showLldp(), only: NET },
    { modes: EXEC, words: ["show", "cdp"], help: "État de CDP", run: ({ cli }) => (cli.dev.cdpOff ? "% CDP is not enabled" : "Global CDP information:\n\tSending CDP packets every 60 seconds\n\tSending a holdtime value of 180 seconds\n\tSending CDPv2 advertisements is  enabled"), only: NET },

    // --- Horloge et NTP ---
    { modes: PRIV, words: ["clock", "set", "<rest>"], help: "Régler l'horloge (hh:mm:ss jour mois année)", run: ({ cli, args }) => cli.clockSet(args[0]), only: NET },
    { modes: EXEC, words: ["show", "clock"], help: "Heure de l'équipement", run: ({ cli }) => cli.showClock(), only: NET },
    { modes: CONF, words: ["clock", "timezone", "<word>", "<rest>"], help: "Fuseau horaire (ex. WAT 1)", run: ({ cli, args }) => void (cli.dev.timezone = { name: args[0], hours: Number(args[1].split(/\s+/)[0]) || 0 }), only: NET },
    { modes: CONF, words: ["ntp", "server", "<ip>"], help: "Serveur de temps", run: ({ cli, args }) => void (cli.dev.ntpServers = [...new Set([...(cli.dev.ntpServers ?? []), args[0]])]), only: NET },
    { modes: CONF, words: ["no", "ntp", "server", "<ip>"], help: "Retirer le serveur de temps", run: ({ cli, args }) => void (cli.dev.ntpServers = (cli.dev.ntpServers ?? []).filter((x) => x !== args[0])), only: NET },
    { modes: CONF, words: ["ntp", "master"], help: "Devenir source de temps (strate 8)", run: ({ cli }) => void (cli.dev.ntpMaster = 8), only: L3 },
    { modes: CONF, words: ["ntp", "master", "<num>"], help: "Devenir source de temps (strate)", run: ({ cli, args }) => void (cli.dev.ntpMaster = Number(args[0]) || 8), only: L3 },
    { modes: CONF, words: ["no", "ntp", "master"], help: "Ne plus être source de temps", run: ({ cli }) => void (cli.dev.ntpMaster = undefined), only: L3 },
    { modes: EXEC, words: ["show", "ntp", "status"], help: "Synchronisation NTP", run: ({ cli }) => cli.showNtp(false), only: NET },
    { modes: EXEC, words: ["show", "ntp", "associations"], help: "Serveurs NTP", run: ({ cli }) => cli.showNtp(true), only: NET },

    // --- Noms, journalisation, SNMP ---
    { modes: CONF, words: ["ip", "host", "<word>", "<ip>"], help: "Nom d'hôte local", run: ({ cli, args }) => void (cli.dev.hosts = [...(cli.dev.hosts ?? []).filter((h) => h.name !== args[0]), { name: args[0], ip: args[1] }]), only: NET },
    { modes: CONF, words: ["no", "ip", "host", "<word>"], help: "Supprimer le nom", run: ({ cli, args }) => void (cli.dev.hosts = (cli.dev.hosts ?? []).filter((h) => h.name !== args[0])), only: NET },
    { modes: EXEC, words: ["show", "hosts"], help: "Noms d'hôtes connus", run: ({ cli }) => cli.showHosts(), only: NET },
    { modes: EXEC, words: ["show", "logging"], help: "Journal des événements", run: ({ cli }) => cli.showLogging(), only: NET },
    { modes: PRIV, words: ["clear", "logging"], help: "Vider le journal", run: ({ cli }) => void cli.net.clearLog(cli.dev), only: NET },
    { modes: EXEC, words: ["show", "snmp"], help: "État de SNMP", run: ({ cli }) => cli.showSnmp(false), only: NET },
    { modes: EXEC, words: ["show", "snmp", "community"], help: "Communautés SNMP", run: ({ cli }) => cli.showSnmp(true), only: NET },

    // --- Système ---
    { modes: PRIV, words: ["reload"], help: "Redémarrer (la configuration sauvegardée est rechargée)", run: ({ cli }) => cli.reload() },
    { modes: PRIV, words: ["erase", "startup-config"], help: "Effacer la configuration sauvegardée", run: ({ cli }) => cli.erase() },
    { modes: PRIV, words: ["write", "erase"], help: "Effacer la configuration sauvegardée", run: ({ cli }) => cli.erase() },
    { modes: EXEC, words: ["show", "users"], help: "Sessions ouvertes", run: ({ cli }) => `    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00${cli.vty ? "\n   2 vty 0                idle                 00:00:00 (à distance)" : ""}` },
    { modes: EXEC, words: ["show", "history"], help: "Dernières commandes", run: ({ cli }) => cli.history.slice(-10).map((h) => `  ${h}`).join("\n") },
    { modes: EXEC, words: ["terminal", "<rest>"], help: "length 0, monitor…", run: () => undefined },
    { modes: EXEC, words: ["show", "flash"], help: "Contenu de la mémoire flash", run: ({ cli }) => cli.showFlash() },
    { modes: EXEC, words: ["dir"], help: "Contenu de la mémoire flash", run: ({ cli }) => cli.showFlash() },
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
    { modes: CONF, prefix: ["ip", "name-server"], help: "Serveur DNS" },
    { modes: CONF, prefix: ["ip", "domain-lookup"], help: "Résolution DNS" },
    { modes: CONF, prefix: ["logging", "host"], help: "Serveur Syslog" },
    { modes: CONF, prefix: ["logging", "trap"], help: "Niveau envoyé au serveur Syslog" },
    { modes: CONF, prefix: ["logging", "buffered"], help: "Journal en mémoire" },
    { modes: CONF, prefix: ["logging", "console"], help: "Messages sur la console" },
    { modes: CONF, prefix: ["no", "logging", "console"], help: "Pas de messages sur la console" },
    { modes: CONF, prefix: ["service", "timestamps"], help: "Horodatage des messages" },
    { modes: CONF, prefix: ["snmp-server", "community"], help: "Communauté SNMP (RO ou RW)" },
    { modes: CONF, prefix: ["snmp-server", "location"], help: "Emplacement" },
    { modes: CONF, prefix: ["snmp-server", "contact"], help: "Contact" },
    { modes: CONF, prefix: ["snmp-server", "host"], help: "Destination des alertes SNMP" },
    { modes: CONF, prefix: ["snmp-server", "enable", "traps"], help: "Envoyer des alertes SNMP" },
    { modes: CONF, prefix: ["banner", "login"], help: "Bannière avant l'authentification" },
    { modes: CONF, prefix: ["banner", "exec"], help: "Bannière après l'authentification" },
    { modes: ["line"], prefix: ["password"], help: "Mot de passe de la ligne" },
    { modes: ["line"], prefix: ["login"], help: "Demander une authentification" },
    { modes: ["line"], prefix: ["transport", "input"], help: "Protocoles autorisés (ssh, telnet)" },
    { modes: ["line"], prefix: ["exec-timeout"], help: "Déconnexion automatique" },
    { modes: ["line"], prefix: ["logging", "synchronous"], help: "Messages qui ne coupent pas la saisie" },
    { modes: ["line"], prefix: ["access-class"], help: "ACL qui filtre les connexions à distance" },
  ];

  // ---------- Exécution d'une ligne ----------

  exec(line: string): string {
    if (this.session.busy) return this.session.exec(line);
    if (this.auth) return this.checkAuth(line);
    if (!this.authed) {
      const con = lineAuth(lineBlock(this.dev, "con"));
      if (con.mode === "none") this.authed = true;
      else {
        this.auth = { kind: "console", stage: con.mode === "local" ? "user" : "pass", tries: 0 };
        return "\nUser Access Verification\n";
      }
    }
    const raw = line.replace(/\s+$/, "");
    if (!raw.trim()) return "";
    if (raw.trimEnd().endsWith("?")) return this.help(raw.slice(0, -1));
    if (raw.trim().startsWith("!")) return "";
    this.history.push(raw.trim());
    const res = this.logged(this.dispatch(raw, this.mode) ?? "");
    // Depuis un sous-mode, IOS accepte aussi les commandes de configuration globale
    if (SUB.includes(this.mode) && /% (Invalid input|Incomplete command)/.test(res)) {
      const sub = () => JSON.stringify([this.entered, this.mode, this.ifNames, this.lineName, this.vlanIds, this.aclName, this.poolName]);
      const before = sub();
      const alt = this.logged(this.dispatch(raw, "config") ?? "");
      if (!/% (Invalid input|Incomplete command)/.test(alt)) {
        if (sub() === before) {
          this.mode = "config";
          this.resetSub();
        }
        return alt;
      }
    }
    return res;
  }

  doEnable(): string | void {
    const pw = this.enablePassword();
    if (!pw) {
      if (this.vty) return "% No password set";
      this.mode = "priv";
      return;
    }
    this.auth = { kind: "enable", stage: "pass", tries: 0 };
  }

  private checkAuth(line: string): string {
    const a = this.auth!;
    if (a.stage === "user") {
      a.user = line.trim();
      a.stage = "pass";
      return "";
    }
    if (a.kind === "enable") {
      if (line === this.enablePassword()) {
        this.auth = null;
        this.mode = "priv";
        return "";
      }
      if (++a.tries >= 3) {
        this.auth = null;
        return "% Bad secrets\n";
      }
      return "";
    }
    const con = lineAuth(lineBlock(this.dev, "con"));
    const ok = con.mode === "local" ? !!a.user && localUser(this.dev, a.user) === line : line === con.password;
    if (ok) {
      this.auth = null;
      this.authed = true;
      this.mode = "user";
      return this.banner() ? `${this.banner()}\n` : "";
    }
    if (con.mode === "local") {
      a.stage = "user";
      return "% Login invalid\n";
    }
    if (++a.tries >= 3) {
      a.tries = 0;
      return "% Bad passwords\n";
    }
    return "";
  }

  logout(): string {
    if (this.vty) {
      this.closed = true;
      return "";
    }
    this.mode = "user";
    this.authed = false;
    return `\n\n${this.dev.hostname} con0 is now available\n\nPress RETURN to get started.`;
  }

  sshCmd(rest: string): string {
    const t = rest.trim().split(/\s+/);
    const li = t.indexOf("-l");
    const user = li >= 0 ? t[li + 1] : undefined;
    const ip = t.at(-1) ?? "";
    if (!isIp(ip)) return INVALID;
    return this.session.open(ip, "ssh", user);
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
    if (this.session.busy) return this.session.complete(line);
    if (this.auth) return line;
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
    if (SUB.includes(this.mode)) {
      this.mode = "config";
      this.resetSub();
    } else if (this.mode === "config") this.mode = "priv";
    else return this.logout();
  }

  private entered = 0;

  private resetSub() {
    this.ifNames = [];
    this.lineName = null;
    this.vlanIds = [];
    this.aclName = null;
    this.poolName = null;
  }

  end(): string {
    this.mode = "priv";
    this.resetSub();
    return `%SYS-5-CONFIG_I: Configured from console by console`;
  }

  enterInterface(raw: string): string | void {
    if (/^range\b/i.test(raw)) return this.enterRange(raw.replace(/^range\s*/i, ""));
    const name = resolveIfaceName(this.dev, raw);
    if (!name) return INVALID;
    const iface = this.net.ensureIface(this.dev, name);
    if (!iface) return INVALID;
    this.ifNames = isPortChannel(name) ? [name, ...this.dev.ifaces.filter((i) => i.channel && `Port-channel${i.channel.group}` === name).map((i) => i.name)] : [name];
    this.mode = "if";
    this.entered++;
    this.vlanIds = [];
  }

  enterRange(raw: string): string | void {
    const names = resolveIfaceRange(this.dev, raw);
    if (!names) return INVALID;
    this.ifNames = names;
    this.mode = "if";
    this.entered++;
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
    this.entered++;
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
    this.entered++;
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
    if (this.ifaces.some((i) => (!this.dev.ifaces.includes(i) && !isPortChannel(i.name)) || i.routed)) return INVALID;
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
    if (!up) i.errdis = undefined; // « shutdown » puis « no shutdown » réactive un port err-disabled
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

  /** « 10.0.0.2 », « g0/0/1 », « g0/0/1 10.0.0.2 », avec une distance administrative facultative à la fin. */
  private parseRouteTarget(rest: string): { nextHop?: string; iface?: string; ad?: number } | null {
    const t = rest.trim().split(/\s+/);
    let ad: number | undefined;
    if (t.length > 1 && /^\d+$/.test(t.at(-1)!)) ad = Number(t.pop());
    if (ad !== undefined && (ad < 1 || ad > 255)) return null;
    if (t.length === 1 && isIp(t[0])) return { nextHop: t[0], ad };
    // interface (éventuellement écrite en deux mots : « g 0/0/1 ») suivie ou non d'un prochain saut
    const nh = isIp(t.at(-1) ?? "") && t.length > 1 ? t.pop() : undefined;
    const iface = resolveIfaceName(this.dev, t.join(""));
    return iface ? { iface, nextHop: nh, ad } : null;
  }

  addRoute(args: string[]): string | void {
    const [network, mask, rest] = args;
    if (!isIp(network) || !isMask(mask)) return INVALID;
    const tgt = this.parseRouteTarget(rest);
    if (!tgt) return INVALID;
    const route = { network: networkOf(network, mask), mask, ...tgt };
    if (route.ad === undefined) delete route.ad;
    this.dev.routes = [...this.dev.routes.filter((r) => !(r.network === route.network && r.mask === mask && r.nextHop === route.nextHop && r.iface === route.iface)), route];
    this.net.clearDynamic();
  }

  delRoute(args: string[]): string | void {
    const [network, mask, rest] = args;
    const tgt = this.parseRouteTarget(rest);
    if (!tgt) return INVALID;
    this.dev.routes = this.dev.routes.filter((r) => !(r.network === networkOf(network, mask) && r.mask === mask && (tgt.nextHop ? r.nextHop === tgt.nextHop : true) && (tgt.iface ? r.iface === tgt.iface : true)));
    this.net.clearDynamic();
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
    this.dev.saved = Network.configOf(this.dev);
    return "Destination filename [startup-config]?\nBuilding configuration...\n[OK]";
  }

  // ---------- ACL ----------

  private aclList(): Acl[] {
    return (this.dev.acls ??= []);
  }

  private getAcl(name: string, extended: boolean): Acl | string {
    const acls = this.aclList();
    let acl = acls.find((a) => a.name === name);
    if (acl && acl.extended !== extended) return `% ${name} est une ACL ${acl.extended ? "étendue" : "standard"}`;
    if (!acl) acls.push((acl = { name, extended, rules: [] }));
    return acl;
  }

  numberedAcl(num: string, rest: string): string | void {
    const kind = aclKindFromNumber(Number(num));
    if (!kind) return INVALID;
    const acl = this.getAcl(num, kind === "extended");
    if (typeof acl === "string") return acl;
    const words = rest.trim().split(/\s+/);
    if (words[0]?.toLowerCase() === "remark") return void (acl.remarks = [...(acl.remarks ?? []), words.slice(1).join(" ")]);
    const seq = (acl.rules.at(-1)?.seq ?? 0) + 10;
    const rule = parseRule(words, acl.extended, seq);
    if (!rule) {
      if (!acl.rules.length && !acl.remarks?.length) this.dev.acls = this.aclList().filter((a) => a !== acl);
      return INVALID;
    }
    acl.rules.push(rule);
  }

  enterAcl(name: string, extended: boolean): string | void {
    const n = Number(name);
    if (/^\d+$/.test(name) && aclKindFromNumber(n) !== (extended ? "extended" : "standard")) return INVALID;
    const acl = this.getAcl(name, extended);
    if (typeof acl === "string") return acl;
    this.aclName = name;
    this.mode = "acl";
    this.entered++;
  }

  aclLine(seq: number | null, text: string): string | void {
    const acl = this.aclList().find((a) => a.name === this.aclName);
    if (!acl) return;
    const s = seq ?? (acl.rules.at(-1)?.seq ?? 0) + 10;
    if (acl.rules.some((r) => r.seq === s)) return "% Duplicate sequence number";
    const rule = parseRule(text.trim().split(/\s+/), acl.extended, s);
    if (!rule) return INVALID;
    acl.rules = [...acl.rules, rule].sort((a, b) => a.seq - b.seq);
  }

  aclRemark(text: string) {
    const acl = this.aclList().find((a) => a.name === this.aclName);
    if (acl) acl.remarks = [...(acl.remarks ?? []), text];
  }

  aclDelete(seq: number) {
    const acl = this.aclList().find((a) => a.name === this.aclName);
    if (acl) acl.rules = acl.rules.filter((r) => r.seq !== seq);
  }

  accessGroup(rest: string, on: boolean): string | void {
    const [name, dir] = rest.trim().split(/\s+/);
    if (!name || (dir !== "in" && dir !== "out")) return INVALID;
    return this.each((i) => {
      if (this.net.isSwitchport(this.dev, i)) return INVALID; // sur un switch : SVI ou port routé
      if (dir === "in") i.aclIn = on ? name : undefined;
      else i.aclOut = on ? name : undefined;
    });
  }

  // ---------- DHCP ----------

  enterPool(name: string) {
    const pools = (this.dev.dhcpPools ??= []);
    if (!pools.some((p) => p.name === name)) pools.push({ name });
    this.poolName = name;
    this.mode = "dhcp";
    this.entered++;
  }

  pool() {
    return this.dev.dhcpPools?.find((p) => p.name === this.poolName);
  }

  poolNetwork(rest: string): string | void {
    const [ip, m] = rest.trim().split(/\s+/);
    const mask = m?.startsWith("/") ? prefixToMask(Number(m.slice(1))) : m;
    if (!isIp(ip) || !mask || !isMask(mask)) return INVALID;
    const p = this.pool();
    if (!p) return;
    p.network = networkOf(ip, mask);
    p.mask = mask;
  }

  poolSet(key: "router" | "dns" | "domain" | "lease", value: string): string | void {
    if ((key === "router" || key === "dns") && !isIp(value)) return INVALID;
    const p = this.pool();
    if (p) p[key] = value;
  }

  option43(rest: string): string | void {
    const [kind, val] = rest.trim().split(/\s+/);
    let ip: string | undefined;
    if (kind === "ip" && val && isIp(val)) ip = val;
    const hex = (kind === "hex" ? val : "")?.replace(/\./g, "").toLowerCase();
    if (hex && /^f104[0-9a-f]{8}$/.test(hex)) ip = [0, 1, 2, 3].map((k) => parseInt(hex.slice(4 + 2 * k, 6 + 2 * k), 16)).join(".");
    if (!ip) return "% Format attendu : option 43 hex f104XXXXXXXX (adresse du contrôleur en hexadécimal) ou option 43 ip A.B.C.D";
    const p = this.pool();
    if (p) p.wlc = ip;
    this.net.clearDynamic();
  }

  excluded(rest: string, add: boolean): string | void {
    const [a, b = a] = rest.trim().split(/\s+/);
    if (!isIp(a) || !isIp(b)) return INVALID;
    const list = (this.dev.dhcpExcluded ??= []).filter(([x, y]) => !(x === a && y === b));
    this.dev.dhcpExcluded = add ? [...list, [a, b]] : list;
  }

  helper(ip: string, add: boolean): string | void {
    if (!isIp(ip)) return INVALID;
    return this.each((i) => {
      if (this.net.isSwitchport(this.dev, i)) return INVALID;
      i.helpers = add ? [...new Set([...(i.helpers ?? []), ip])] : undefined;
    });
  }

  ipDhcp(): string | void {
    const i = this.iface;
    if (!i || this.net.isSwitchport(this.dev, i)) return INVALID;
    i.dhcp = true;
    const ack = this.net.dhcpRequest(this.dev, i.name);
    if (ack?.op === "ack") return `%DHCP-6-ADDRESS_ASSIGN: Interface ${i.name} assigned DHCP address ${ack.yiaddr}, mask ${ack.mask}, hostname ${this.dev.hostname}`;
  }

  clearBinding(rest: string) {
    const ip = rest.trim();
    this.dev.dhcpLeases = ip === "*" ? [] : (this.dev.dhcpLeases ?? []).filter((l) => l.ip !== ip);
  }

  // ---------- NAT ----------

  natCfg() {
    return (this.dev.nat ??= { statics: [], pools: [], rules: [] });
  }

  natStatic(local: string, global: string, add: boolean): string | void {
    if (!isIp(local) || !isIp(global)) return INVALID;
    const n = this.natCfg();
    n.statics = n.statics.filter((x) => x.local !== local && x.global !== global);
    if (add) n.statics.push({ local, global });
    this.net.clearNat(this.dev);
  }

  natRule(acl: string, rest: string): string | void {
    const t = rest.trim().split(/\s+/);
    const overload = t.at(-1)?.toLowerCase() === "overload";
    let rule: { acl: string; pool?: string; iface?: string; overload: boolean } | null = null;
    if ("pool".startsWith(t[0]?.toLowerCase() ?? "~") && t[1]) rule = { acl, pool: t[1], overload };
    else if ("interface".startsWith(t[0]?.toLowerCase() ?? "~") && t[1]) {
      const name = resolveIfaceName(this.dev, t.slice(1, overload ? -1 : undefined).join(""));
      if (!name) return INVALID;
      rule = { acl, iface: name, overload: true };
    }
    if (!rule) return INVALID;
    const n = this.natCfg();
    n.rules = [...n.rules.filter((r) => r.acl !== acl), rule];
    this.net.clearNat(this.dev);
  }

  natRuleDelete(acl: string) {
    const n = this.natCfg();
    n.rules = n.rules.filter((r) => r.acl !== acl);
    this.net.clearNat(this.dev);
  }

  natPool(name: string, rest: string): string | void {
    const t = rest.trim().split(/\s+/);
    const [start, end] = t;
    let mask: string | undefined;
    if (t[2]?.toLowerCase().startsWith("net")) mask = t[3];
    else if (t[2]?.toLowerCase().startsWith("pre")) mask = prefixToMask(Number(t[3]));
    if (!isIp(start) || !isIp(end) || !mask || !isMask(mask)) return INVALID;
    const n = this.natCfg();
    n.pools = [...n.pools.filter((p) => p.name !== name), { name, start, end, mask }];
  }

  // ---------- OSPF ----------

  enterOspf(pid: number): string | void {
    if (!Number.isInteger(pid) || pid < 1 || pid > 65535) return INVALID;
    if (!this.net.routes(this.dev)) return "% IP routing not enabled";
    if (this.dev.ospf && this.dev.ospf.pid !== pid) return `% Un seul processus OSPF est simulé (ospf ${this.dev.ospf.pid} existe déjà)`;
    this.dev.ospf ??= { pid, networks: [], passive: [], noPassive: [] };
    this.mode = "router";
    this.entered++;
    this.net.clearDynamic();
  }

  ospfSet(fn: (o: NonNullable<Device["ospf"]>) => unknown, ip?: string): string | void {
    if (ip !== undefined && !isIp(ip)) return INVALID;
    if (!this.dev.ospf) return;
    fn(this.dev.ospf);
    this.net.clearDynamic();
  }

  ospfNetwork(args: string[], add: boolean): string | void {
    const [ip, wc, area] = args;
    if (!isIp(ip) || !isIp(wc) || !/^\d+$/.test(area)) return INVALID;
    return this.ospfSet((o) => {
      o.networks = o.networks.filter((n) => !(n.ip === ip && n.wildcard === wc));
      if (add) o.networks.push({ ip, wildcard: wc, area: Number(area) });
    });
  }

  ospfPassive(raw: string, on: boolean): string | void {
    const name = resolveIfaceName(this.dev, raw);
    if (!name || !this.net.findIface(this.dev, name)) return INVALID;
    return this.ospfSet((o) => {
      if (o.passiveDefault) o.noPassive = on ? o.noPassive.filter((x) => x !== name) : [...new Set([...o.noPassive, name])];
      else o.passive = on ? [...new Set([...o.passive, name])] : o.passive.filter((x) => x !== name);
    });
  }

  ifOspf(fn: (i: Iface) => unknown): string | void {
    const r = this.each((i) => void fn(i));
    this.net.clearDynamic();
    return r;
  }

  noIfOspf(rest: string): string | void {
    const w = rest.trim().toLowerCase().split(/\s+/);
    return this.ifOspf((i) => {
      if (/^\d+$/.test(w[0])) i.ospfArea = undefined;
      else if ("cost".startsWith(w[0])) i.ospfCost = undefined;
      else if ("priority".startsWith(w[0])) i.ospfPriority = undefined;
      else if (w[0].startsWith("hello")) i.ospfHello = undefined;
      else if (w[0].startsWith("dead")) i.ospfDead = undefined;
      else if ("network".startsWith(w[0])) i.ospfP2p = undefined;
    });
  }

  private ospfMe() {
    return this.net.ospfState().get(this.dev.id);
  }

  showOspfNeighbors(): string {
    const me = this.ospfMe();
    const rows = (me?.neighbors ?? []).map((n) => `${n.rid.padEnd(16)}${String(n.pri).padEnd(6)}${n.state.padEnd(16)}00:00:${String(n.dead - 4).padStart(2, "0")}    ${n.address.padEnd(16)}${n.iface}`);
    return ["", `Neighbor ID     Pri   State           Dead Time   Address         Interface`, ...rows].join("\n");
  }

  showOspfIfBrief(): string {
    const me = this.ospfMe();
    const rows = (me?.ifs ?? []).map((x) => {
      const st = isLoopback(x.iface.name) ? "LOOP" : x.iface.ospfP2p ? "P2P" : x.passive ? "DR" : (x.role ?? "DR");
      return `${shortIf(x.iface.name).padEnd(13)}${String(this.dev.ospf?.pid ?? "").padEnd(6)}${String(x.area).padEnd(16)}${`${x.iface.ip}/${maskToPrefix(x.iface.mask!)}`.padEnd(19)}${String(x.cost).padEnd(6)}${st.padEnd(6)}${x.nbrs ?? 0}/${x.nbrs ?? 0}`;
    });
    return [`Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C`, ...rows].join("\n");
  }

  showOspfIf(raw: string | null): string {
    const me = this.ospfMe();
    const name = raw ? resolveIfaceName(this.dev, raw) : null;
    const list = (me?.ifs ?? []).filter((x) => !name || x.iface.name === name);
    if (raw && !list.length) return `%OSPF: OSPF not enabled on ${name ?? raw}`;
    return list
      .map((x) =>
        [
          `${x.iface.name} is up, line protocol is up`,
          `  Internet Address ${x.iface.ip}/${maskToPrefix(x.iface.mask!)}, Area ${x.area}`,
          `  Process ID ${this.dev.ospf?.pid}, Router ID ${me?.rid}, Network Type ${isLoopback(x.iface.name) ? "LOOPBACK" : x.iface.ospfP2p ? "POINT_TO_POINT" : "BROADCAST"}, Cost: ${x.cost}`,
          ...(isLoopback(x.iface.name) ? ["  Loopback interface is treated as a stub Host"] : [
            `  Transmit Delay is 1 sec, State ${x.iface.ospfP2p ? "POINT_TO_POINT" : x.role ?? "DR"}, Priority ${x.iface.ospfPriority ?? 1}`,
            ...(x.dr ? [`  Designated Router (ID) ${x.dr}`] : []),
            ...(x.bdr ? [`  Backup Designated Router (ID) ${x.bdr}`] : []),
            `  Timer intervals configured, Hello ${x.iface.ospfHello ?? 10}, Dead ${x.iface.ospfDead ?? 40}, Wait ${x.iface.ospfDead ?? 40}, Retransmit 5`,
            x.passive ? "    No Hellos (Passive interface)" : `    Hello due in 00:00:0${Math.min(9, (x.iface.ospfHello ?? 10) - 3)}`,
            `  Neighbor Count is ${x.nbrs ?? 0}, Adjacent neighbor count is ${x.nbrs ?? 0}`,
          ]),
        ].join("\n")
      )
      .join("\n");
  }

  showOspf(): string {
    const me = this.ospfMe();
    if (!this.dev.ospf) return "";
    const areas = [...new Set((me?.ifs ?? []).map((x) => x.area))];
    return [
      ` Routing Process "ospf ${this.dev.ospf.pid}" with ID ${me?.rid ?? "0.0.0.0"}`,
      ` Supports only single TOS(TOS0) routes`,
      ` Reference bandwidth unit is ${this.dev.ospf.refBw ?? 100} mbps`,
      ...(this.dev.ospf.defaultOriginate ? [" It is an autonomous system boundary router"] : []),
      ` Number of areas in this router is ${areas.length}. ${areas.length} normal 0 stub 0 nssa`,
      ...areas.map((a) => `    Area ${a === 0 ? "BACKBONE(0)" : a}\n        Number of interfaces in this area is ${(me?.ifs ?? []).filter((x) => x.area === a).length}`),
    ].join("\n");
  }

  showOspfDb(): string {
    const st = this.net.ospfState();
    const me = this.ospfMe();
    if (!me) return "";
    const routers = [...st.values()].filter((x) => x.rid && x.ifs.some((i) => me.ifs.some((m) => m.area === i.area)));
    const rows = routers.map((r) => `${r.rid!.padEnd(16)}${r.rid!.padEnd(16)}${"25".padEnd(9)}0x80000002 0x00A1B2 ${r.ifs.length}`);
    return [`            OSPF Router with ID (${me.rid}) (Process ID ${this.dev.ospf?.pid})`, "", `                Router Link States (Area ${me.ifs[0]?.area ?? 0})`, "", `Link ID         ADV Router      Age      Seq#       Checksum Link count`, ...rows].join("\n");
  }

  showProtocols(): string {
    const o = this.dev.ospf;
    if (!o) return "*** IP Routing is NSF aware ***\n";
    const me = this.ospfMe();
    return [
      `*** IP Routing is NSF aware ***`,
      ``,
      `Routing Protocol is "ospf ${o.pid}"`,
      `  Outgoing update filter list for all interfaces is not set`,
      `  Incoming update filter list for all interfaces is not set`,
      `  Router ID ${me?.rid ?? "0.0.0.0"}`,
      `  Number of areas in this router is ${new Set((me?.ifs ?? []).map((x) => x.area)).size}. 1 normal 0 stub 0 nssa`,
      `  Maximum path: 4`,
      `  Routing for Networks:`,
      ...o.networks.map((n) => `    ${n.ip} ${n.wildcard} area ${n.area}`),
      ...((o.passiveDefault ? (me?.ifs ?? []).filter((x) => x.passive).map((x) => x.iface.name) : o.passive).length ? [`  Passive Interface(s):`, ...(o.passiveDefault ? (me?.ifs ?? []).filter((x) => x.passive).map((x) => x.iface.name) : o.passive).map((x) => `    ${x}`)] : []),
      `  Routing Information Sources:`,
      `    Gateway         Distance      Last Update`,
      ...(me?.neighbors ?? []).map((n) => `    ${n.rid.padEnd(16)}110           00:00:12`),
      `  Distance: (default is 110)`,
    ].join("\n");
  }

  // ---------- Spanning Tree / EtherChannel ----------

  private stpCfg() {
    return (this.dev.stp ??= {});
  }

  stpMode(m: string): string | void {
    const v = m.toLowerCase();
    if ("rapid-pvst".startsWith(v) && v.length > 1) this.stpCfg().mode = "rapid-pvst";
    else if ("pvst".startsWith(v)) this.stpCfg().mode = undefined;
    else if (v === "mst") return "% MST n'est pas simulé : utilisez pvst ou rapid-pvst";
    else return INVALID;
    this.net.clearDynamic();
  }

  stpVlan(rest: string, on: boolean): string | void {
    const m = rest.trim().toLowerCase().match(/^([\d,\-\s]+?)\s+(priority\s+(\d+)|root\s+(primary|secondary))$/) ?? (on ? null : rest.trim().match(/^([\d,\-\s]+)/));
    if (!m) return INVALID;
    const ids = parseVlanList(m[1].replace(/\s+/g, ""));
    if (!ids?.size) return INVALID;
    let prio: number | undefined;
    if (on) {
      if (m[3]) {
        prio = Number(m[3]);
        if (prio % 4096 || prio > 61440) return "% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  0     4096  8192  12288 16384 20480 24576 28672\n  32768 36864 40960 45056 49152 53248 57344 61440";
      } else prio = m[4] === "primary" ? 24576 : 28672;
    }
    const pr = (this.stpCfg().priorities ??= {});
    for (const v of ids) if (prio === undefined) delete pr[String(v)];
    else pr[String(v)] = prio;
    this.net.clearDynamic();
  }

  stpGlobal(rest: string, on: boolean): string | void {
    const w = rest.toLowerCase().replace(/\bedge\b/, "").trim().replace(/\s+/g, " ");
    if (w === "default") this.stpCfg().portfastDefault = on || undefined;
    else if (w === "bpduguard default") this.stpCfg().bpduguardDefault = on || undefined;
    else return INVALID;
    this.net.clearDynamic();
    if (on && w === "default") return "%Warning: this command enables portfast by default on all interfaces. You\n should now disable portfast explicitly on switched ports leading to hubs,\n switches and bridges as they may create temporary bridging loops.";
  }

  channelGroup(group: number, rawMode: string): string | void {
    const modes = ["active", "passive", "on", "desirable", "auto"] as const;
    const mode = modes.find((x) => x.startsWith(rawMode.toLowerCase()));
    if (!mode || group < 1 || group > 48) return INVALID;
    const lacp = (x?: string) => x === "active" || x === "passive";
    const existing = this.dev.ifaces.find((i) => i.channel?.group === group && !this.ifNames.includes(i.name));
    if (existing && lacp(existing.channel!.mode) !== lacp(mode) && existing.channel!.mode !== "on" && mode !== "on")
      return `% Channel ${group} is already in ${lacp(existing.channel!.mode) ? "LACP" : "PAgP"} mode`;
    const name = `Port-channel${group}`;
    const created = !this.dev.portChannels?.some((p) => p.name === name);
    const po = this.net.ensureIface(this.dev, name)!;
    const template = created ? this.ifaces[0] : po;
    const copy = (to: Iface, from: Iface) => {
      to.mode = from.mode;
      to.accessVlan = from.accessVlan;
      to.nativeVlan = from.nativeVlan;
      to.allowed = from.allowed;
      to.nonegotiate = from.nonegotiate;
      to.trunkEncap = from.trunkEncap;
    };
    const r = this.eachPort((i) => {
      if (isPortChannel(i.name)) return INVALID;
      i.channel = { group, mode };
      if (template && template !== i) copy(i, template);
    });
    if (created && this.ifaces[0]) copy(po, this.ifaces[0]);
    return [created ? `Creating a port-channel interface Port-channel ${group}` : "", r].filter(Boolean).join("\n");
  }

  showStp(only: number | null): string {
    const st = this.net.stpState().get(this.dev.id);
    if (!st) return "No spanning tree instance exists.";
    const proto = this.dev.stp?.mode === "rapid-pvst" ? "rstp" : "ieee";
    const blocks = [...st.entries()]
      .filter(([v]) => only === null || v === only)
      .sort((a, b) => a[0] - b[0])
      .filter(([, x]) => x.ports.size > 0)
      .map(([v, x]) => {
        const isRoot = x.rootBid.mac === x.bid.mac && x.rootBid.prio === x.bid.prio;
        const timers = "             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec";
        const rows = [...x.ports.entries()]
          .sort((a, b) => a[1].nbr - b[1].nbr)
          .map(([port, p]) => {
            const phys = this.net.physOf(this.dev, port);
            const edge = phys?.portfast ?? (!!this.dev.stp?.portfastDefault && p.edge);
            return `${shortIf(port).padEnd(20)}${p.role} ${p.state} ${String(p.cost).padEnd(10)}${`${p.prio}.${p.nbr}`.padEnd(9)}P2p${edge ? " Edge" : ""}`;
          });
        return [
          `VLAN${String(v).padStart(4, "0")}`,
          `  Spanning tree enabled protocol ${proto}`,
          `  Root ID    Priority    ${x.rootBid.prio}`,
          `             Address     ${x.rootBid.mac}`,
          ...(isRoot ? [`             This bridge is the root`] : [`             Cost        ${x.rootCost}`, `             Port        ${this.net.physOf(this.dev, x.rootPort!) ? `${this.portNumber(x.rootPort!)} (${x.rootPort})` : x.rootPort}`]),
          timers,
          "",
          `  Bridge ID  Priority    ${x.bid.prio}  (priority ${x.bid.prio - v} sys-id-ext ${v})`,
          `             Address     ${x.bid.mac}`,
          timers,
          `             Aging Time  300 sec`,
          "",
          `Interface           Role Sts Cost      Prio.Nbr Type`,
          `------------------- ---- --- --------- -------- --------------------------------`,
          ...rows,
        ].join("\n");
      });
    return blocks.length ? blocks.join("\n\n") : `Spanning tree instance(s) for vlan ${only} does not exist.`;
  }

  private portNumber(port: string) {
    return isPortChannel(port) ? 64 + Number(port.slice(12)) : this.dev.ifaces.findIndex((i) => i.name === port) + 1;
  }

  showStpSummary(): string {
    const st = this.net.stpState().get(this.dev.id);
    const rows = [...(st?.entries() ?? [])]
      .filter(([, x]) => x.ports.size)
      .sort((a, b) => a[0] - b[0])
      .map(([v, x]) => {
        const c = (role: string, state: string) => [...x.ports.values()].filter((p) => (role === "*" || p.role === role) && p.state === state).length;
        return `VLAN${String(v).padStart(4, "0")}                     ${c("*", "BLK")}         0        0        ${c("*", "FWD")}          ${x.ports.size}`;
      });
    const roots = [...(st?.entries() ?? [])].filter(([, x]) => x.rootBid.mac === x.bid.mac && x.ports.size).map(([v]) => `VLAN${String(v).padStart(4, "0")}`);
    return [
      `Switch is in ${this.dev.stp?.mode === "rapid-pvst" ? "rapid-pvst" : "pvst"} mode`,
      `Root bridge for: ${roots.join(", ") || "none"}`,
      `PortFast Default            is ${this.dev.stp?.portfastDefault ? "enabled" : "disabled"}`,
      `PortFast BPDU Guard Default is ${this.dev.stp?.bpduguardDefault ? "enabled" : "disabled"}`,
      "",
      `Name                   Blocking Listening Learning Forwarding STP Active`,
      `---------------------- -------- --------- -------- ---------- ----------`,
      ...rows,
    ].join("\n");
  }

  showEtherchannel(): string {
    const groups = [...new Set(this.dev.ifaces.filter((i) => i.channel).map((i) => i.channel!.group))].sort((a, b) => a - b);
    const rows = groups.map((g) => {
      const b = this.net.bundle(this.dev, g);
      const po = this.dev.portChannels?.find((p) => p.name === `Port-channel${g}`);
      const poFlag = po && po.adminUp && b.members.length ? "SU" : "SD";
      const ports = b.all.map((m) => `${shortIf(m.name)}(${!m.adminUp || !this.net.isUp(this.dev, m) ? "D" : b.members.includes(m) ? "P" : "s"})`).join("    ");
      return `${String(g).padEnd(7)}${`Po${g}(${poFlag})`.padEnd(16)}${b.protocol.padEnd(10)}${ports}`;
    });
    return [
      "Flags:  D - down        P - bundled in port-channel",
      "        I - stand-alone s - suspended",
      "        H - Hot-standby (LACP only)",
      "        R - Layer3      S - Layer2",
      "        U - in use      f - failed to allocate aggregator",
      "",
      `Number of channel-groups in use: ${groups.length}`,
      `Number of aggregators:           ${groups.length}`,
      "",
      "Group  Port-channel  Protocol    Ports",
      "------+-------------+-----------+-----------------------------------------------",
      ...rows,
    ].join("\n");
  }

  // ---------- Sécurité des ports ----------

  psecEnable(on: boolean): string | void {
    if (on && this.ifaces.some((i) => (i.mode ?? "dynamic-auto").startsWith("dynamic"))) return `Command rejected: ${this.ifName} is a dynamic port.`;
    return this.eachPort((i) => {
      i.psec = on ? (i.psec ?? {}) : undefined;
      this.net.clearPsec(this.dev, i);
    });
  }

  psecSet(fn: (p: NonNullable<Iface["psec"]>) => unknown): string | void {
    return this.eachPort((i) => void fn((i.psec ??= {})));
  }

  psecViolation(raw: string): string | void {
    const v = (["shutdown", "restrict", "protect"] as const).find((x) => x.startsWith(raw.toLowerCase()));
    if (!v) return INVALID;
    return this.psecSet((p) => (p.violation = v === "shutdown" ? undefined : v));
  }

  psecMac(raw: string): string | void {
    const mac = raw.toLowerCase();
    if (!/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/.test(mac)) return INVALID;
    return this.psecSet((p) => (p.macs = [...new Set([...(p.macs ?? []), mac])]));
  }

  snoopVlans(rest: string, on: boolean): string | void {
    const ids = parseVlanList(rest.replace(/\s+/g, ""));
    if (!ids?.size) return INVALID;
    const sn = (this.dev.snooping ??= { enabled: false, vlans: [] });
    sn.vlans = on ? [...new Set([...sn.vlans, ...ids])].sort((a, b) => a - b) : sn.vlans.filter((v) => !ids.has(v));
  }

  daiVlans(rest: string, on: boolean): string | void {
    const ids = parseVlanList(rest.replace(/\s+/g, ""));
    if (!ids?.size) return INVALID;
    const d = (this.dev.dai ??= { vlans: [] });
    d.vlans = on ? [...new Set([...d.vlans, ...ids])].sort((a, b) => a - b) : d.vlans.filter((v) => !ids.has(v));
  }

  showPsec(): string {
    const rows = this.dev.ifaces
      .filter((i) => i.psec)
      .map((i) => `${shortIf(i.name).padStart(15)}${String(i.psec!.max ?? 1).padStart(15)}${String(this.net.secureMacs(this.dev, i).length).padStart(15)}${String(this.net.psecViolationCount(this.dev, i)).padStart(15)}         ${(i.psec!.violation ?? "shutdown").replace(/^./, (c) => c.toUpperCase())}`);
    return ["Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action", "                (Count)       (Count)          (Count)", "---------------------------------------------------------------------------", ...rows, "---------------------------------------------------------------------------"].join("\n");
  }

  showPsecIf(raw: string): string {
    const name = resolveIfaceName(this.dev, raw.trim());
    const i = name ? this.dev.ifaces.find((x) => x.name === name) : undefined;
    if (!i) return INVALID;
    const macs = this.net.secureMacs(this.dev, i);
    const status = !i.psec ? "Disabled" : i.errdis ? "Secure-shutdown" : this.net.isUp(this.dev, i) ? "Secure-up" : "Secure-down";
    return [
      `Port Security              : ${i.psec ? "Enabled" : "Disabled"}`,
      `Port Status                : ${status}`,
      `Violation Mode             : ${(i.psec?.violation ?? "shutdown").replace(/^./, (c) => c.toUpperCase())}`,
      `Aging Time                 : 0 mins`,
      `Aging Type                 : Absolute`,
      `SecureStatic Address Aging : Disabled`,
      `Maximum MAC Addresses      : ${i.psec?.max ?? 1}`,
      `Total MAC Addresses        : ${macs.length}`,
      `Configured MAC Addresses   : ${macs.filter((m) => m.type === "SecureConfigured").length}`,
      `Sticky MAC Addresses       : ${macs.filter((m) => m.type === "SecureSticky").length}`,
      `Last Source Address:Vlan   : ${macs.at(-1) ? `${macs.at(-1)!.mac}:${i.accessVlan ?? 1}` : "0000.0000.0000:0"}`,
      `Security Violation Count   : ${this.net.psecViolationCount(this.dev, i)}`,
    ].join("\n");
  }

  showPsecAddr(): string {
    const rows = this.dev.ifaces.flatMap((i) => (i.psec ? this.net.secureMacs(this.dev, i).map((m) => `${String(i.accessVlan ?? 1).padStart(4)}    ${m.mac.padEnd(18)}${m.type.padEnd(21)}${shortIf(i.name).padEnd(8)}-`) : []));
    return ["               Secure Mac Address Table", "-----------------------------------------------------------------------------", "Vlan    Mac Address       Type                     Ports   Remaining Age", "                                                              (mins)", "----    -----------       ----                     -----   -------------", ...rows].join("\n");
  }

  showSnooping(): string {
    const sn = this.dev.snooping;
    const trusted = this.dev.ifaces.filter((i) => i.dhcpTrust);
    return [
      `Switch DHCP snooping is ${sn?.enabled ? "enabled" : "disabled"}`,
      `DHCP snooping is configured on following VLANs:`,
      sn?.vlans.length ? formatVlanList(sn.vlans) : "none",
      `DHCP snooping is operational on following VLANs:`,
      sn?.enabled && sn.vlans.length ? formatVlanList(sn.vlans) : "none",
      `Insertion of option 82 is enabled`,
      `Interface                  Trusted    Allow option    Rate limit (pps)`,
      `-----------------------    -------    ------------    ----------------`,
      ...trusted.map((i) => `${i.name.padEnd(27)}yes        yes             unlimited`),
    ].join("\n");
  }

  showSnoopBinding(): string {
    const rows = this.net.snoopingBindings(this.dev).map((b) => `${b.mac.replace(/(..)(..)\.?/g, "$1:$2:").replace(/:$/, "").toUpperCase().padEnd(20)}${b.ip.padEnd(17)}86400       dhcp-snooping   ${String(b.vlan).padEnd(6)}${b.port}`);
    return ["MacAddress          IpAddress        Lease(sec)  Type           VLAN  Interface", "------------------  ---------------  ----------  -------------  ----  --------------------", ...rows, `Total number of bindings: ${rows.length}`].join("\n");
  }

  showDai(): string {
    const v = this.dev.dai?.vlans ?? [];
    return [`Source Mac Validation      : Disabled`, `Destination Mac Validation : Disabled`, `IP Address Validation      : Disabled`, "", ` Vlan     Configuration    Operation   ACL Match          Static ACL`, ` ----     -------------    ---------   ---------          ----------`, ...v.map((x) => ` ${String(x).padEnd(9)}Enabled          Active`), "", `Dropped ARP packets : ${this.net.daiDropCount(this.dev)}`].join("\n");
  }

  showErrdis(): string {
    const rows = this.dev.ifaces.filter((i) => this.net.errDisabled(this.dev, i)).map((i) => `${shortIf(i.name).padEnd(10)}${i.description.slice(0, 18).padEnd(19)}err-disabled ${i.errdis ?? "bpduguard"}`);
    return ["Port      Name               Status       Reason", ...rows].join("\n");
  }

  // ---------- IPv6 ----------

  addr6(rest: string, add: boolean): string | void {
    const t = rest.trim().split(/\s+/);
    const i = this.iface;
    if (!i || this.ifNames.length !== 1 || this.net.isSwitchport(this.dev, i)) return INVALID;
    if (t[0].toLowerCase() === "autoconfig") {
      if (!add) return void (i.ipv6Autoconfig = undefined);
      const r = this.net.slaac(this.dev, i.name);
      this.net.clearDynamic();
      return r ? "" : "";
    }
    if (t[1]?.toLowerCase() === "link-local") {
      const a = expand6(t[0]);
      if (!a || !isLinkLocal6(a)) return "% Invalid link-local address";
      i.ll = add ? a : undefined;
      this.net.clearDynamic();
      return;
    }
    const c = parseCidr6(t[0]);
    if (!c) return INVALID;
    const eui = t[1]?.toLowerCase() === "eui-64";
    if (eui && c.len !== 64) return "% EUI-64 nécessite un préfixe /64";
    const addr = eui ? withEui64(c.addr, i.mac) : c.addr;
    const list = (i.ipv6 ?? []).filter((a) => a.addr !== addr);
    if (add) {
      const clash = this.net.l3Ifaces(this.dev).find((x) => x !== i && (x.ipv6 ?? []).some((a) => network6(a.addr, a.len) === network6(addr, c.len)));
      if (clash) return `% ${show6(network6(addr, c.len))}/${c.len} overlaps with ${clash.name}`;
      list.push({ addr, len: c.len, eui: eui || undefined });
    }
    i.ipv6 = list.length ? list : undefined;
    this.net.clearDynamic();
  }

  route6(pfx: string, rest: string, add: boolean): string | void {
    const c = parseCidr6(pfx);
    if (!c) return INVALID;
    const t = rest.trim().split(/\s+/);
    let ad: number | undefined;
    if (t.length > 1 && /^\d+$/.test(t.at(-1)!)) ad = Number(t.pop());
    const nh = isIp6(t.at(-1) ?? "") ? expand6(t.pop()!)! : undefined;
    const iface = t.length ? resolveIfaceName(this.dev, t.join("")) ?? undefined : undefined;
    if (t.length && !iface) return INVALID;
    if (!nh && !iface) return INVALID;
    if (nh && isLinkLocal6(nh) && !iface) return "% Interface has to be specified for a link-local nexthop";
    const route = { prefix: network6(c.addr, c.len), len: c.len, nextHop: nh, iface, ad };
    const same = (r: typeof route) => r.prefix === route.prefix && r.len === route.len && r.nextHop === route.nextHop && r.iface === route.iface;
    this.dev.routes6 = [...(this.dev.routes6 ?? []).filter((r) => !same(r as typeof route)), ...(add ? [route] : [])];
    this.net.clearDynamic();
  }

  showIpv6Brief(): string {
    return allIfaces(this.dev)
      .map((i) => {
        const status = !i.adminUp ? "administratively down/down" : this.net.isUp(this.dev, i) ? "up/up" : "down/down";
        const addrs = this.net.v6Addrs(i);
        return [`${i.name.padEnd(23)}[${status}]`, ...(addrs.length ? addrs.map((a) => `    ${show6(a.addr)}`) : ["    unassigned"])].join("\n");
      })
      .join("\n");
  }

  showIpv6If(raw: string): string {
    const name = resolveIfaceName(this.dev, raw.trim());
    const i = name ? this.net.findIface(this.dev, name) : undefined;
    if (!i) return INVALID;
    const addrs = this.net.v6Addrs(i);
    const up = this.net.isUp(this.dev, i);
    if (!addrs.length) return `${i.name} is ${up ? "up" : "down"}, line protocol is ${up ? "up" : "down"}\n  IPv6 is disabled`;
    return [
      `${i.name} is ${!i.adminUp ? "administratively down" : up ? "up" : "down"}, line protocol is ${up ? "up" : "down"}`,
      `  IPv6 is enabled, link-local address is ${show6(addrs[0].addr)}`,
      `  No Virtual link-local address(es):`,
      `  Global unicast address(es):`,
      ...addrs.filter((a) => !a.ll).map((a) => `    ${show6(a.addr)}, subnet is ${show6(network6(a.addr, a.len))}/${a.len}${(i.ipv6 ?? []).find((x) => x.addr === a.addr)?.eui ? " [EUI]" : ""}`),
      `  Joined group address(es):`,
      `    FF02::1`,
      ...(this.net.routes6Enabled(this.dev) ? ["    FF02::2"] : []),
      `    FF02::1:FF${show6(addrs[0].addr).slice(-7).replace(/^.*:/, "")}`,
      `  MTU is 1500 bytes`,
      `  ND reachable time is 30000 milliseconds`,
    ].join("\n");
  }

  showIpv6Route(filter?: string): string {
    const f = filter?.toLowerCase();
    const best = new Map<string, ReturnType<Network["candidates6"]>[number]>();
    for (const c of this.net.candidates6(this.dev)) {
      const key = `${c.prefix}/${c.len}`;
      const cur = best.get(key);
      if (!cur || c.ad < cur.ad) best.set(key, c);
    }
    let list = [...best.values()];
    if (f) list = list.filter((c) => ("connected".startsWith(f) ? c.code === "C" || c.code === "L" : "static".startsWith(f) ? c.code === "S" : true));
    list.sort((a, b) => a.prefix.localeCompare(b.prefix) || a.len - b.len);
    const rows = list.flatMap((c) => [
      `${c.code.padEnd(4)}${show6(c.prefix)}/${c.len} [${c.ad}/0]`,
      c.code === "C" ? `     via ${c.out!.name}, directly connected` : c.code === "L" ? `     via ${c.out!.name}, receive` : `     via ${[c.nextHop ? show6(c.nextHop) : "", c.out && (!c.nextHop || isLinkLocal6(c.nextHop)) ? c.out.name : ""].filter(Boolean).join(", ")}`,
    ]);
    return [
      `IPv6 Routing Table - default - ${list.length + 1} entries`,
      `Codes: C - Connected, L - Local, S - Static, U - Per-user Static route`,
      `       B - BGP, R - RIP, H - NHRP, I1 - ISIS L1`,
      `       O - OSPF Intra, OI - OSPF Inter, OE1 - OSPF ext 1, OE2 - OSPF ext 2`,
      ...rows,
      `L   FF00::/8 [0/0]`,
      `     via Null0, receive`,
    ].join("\n");
  }

  showNd(): string {
    const rows = this.net.ndTable(this.dev).map((e) => `${show6(e.addr).padEnd(42)}0 ${e.mac.padEnd(15)}REACH ${shortIf(e.port)}`);
    return [`IPv6 Address                              Age Link-layer Addr State Interface`, ...rows].join("\n");
  }

  // ---------- Exploitation : HSRP, horloge, NTP, journal, SNMP ----------

  /** Les messages « %… » sont aussi gardés dans le journal (show logging), horodatés si demandé. */
  private logged(out: string): string {
    const msgs = out.split("\n").filter((l) => /^%[A-Z0-9_]+-\d-/.test(l));
    if (msgs.length) this.net.log(this.dev, msgs);
    if (msgs.length && this.dev.extra.some((l) => l.startsWith("service timestamps log"))) {
      const ts = this.clockText(false);
      return out.replace(/^(%[A-Z0-9_]+-\d-)/gm, `*${ts}: $1`);
    }
    return out;
  }

  hsrp(group: number, fn: (g: NonNullable<Iface["hsrp"]>[number]) => unknown, vip?: string): string | void {
    if (group < 0 || group > 4095) return INVALID;
    const i = this.iface;
    if (!i || this.ifNames.length !== 1 || this.net.isSwitchport(this.dev, i)) return INVALID;
    if (vip && i.ip && i.mask && networkOf(vip, i.mask) !== networkOf(i.ip, i.mask)) return `% Address ${vip} in group ${group} is not in the subnet of ${i.name}`;
    const list = (i.hsrp ??= []);
    let g = list.find((x) => x.group === group);
    if (!g) list.push((g = { group, version: list[0]?.version }));
    fn(g);
    this.net.clearDynamic();
    const st = (this.net.hsrpState().get(this.dev.id) ?? []).find((x) => x.iface === i.name && x.group === group);
    if (st && vip) return `%HSRP-5-STATECHANGE: ${i.name} Grp ${group} state Standby -> ${st.state}`;
  }

  hsrpVersion(v: number): string | void {
    if (v !== 1 && v !== 2) return INVALID;
    return this.each((i) => {
      for (const g of i.hsrp ?? []) g.version = v;
      if (!i.hsrp?.length) i.hsrp = [];
      this.net.clearDynamic();
    });
  }

  noHsrp(rest: string): string | void {
    const t = rest.trim().split(/\s+/);
    return this.each((i) => {
      if (/^\d+$/.test(t[0]) && t.length === 1) i.hsrp = i.hsrp?.filter((g) => g.group !== Number(t[0]));
      else if (/^\d+$/.test(t[0])) {
        const g = i.hsrp?.find((x) => x.group === Number(t[0]));
        if (g && t[1] === "preempt") g.preempt = undefined;
        if (g && t[1] === "priority") g.priority = undefined;
        if (g && t[1] === "ip") g.vip = undefined;
      } else i.hsrp = undefined;
      this.net.clearDynamic();
    });
  }

  showStandby(brief: boolean): string {
    const st = this.net.hsrpState().get(this.dev.id) ?? [];
    if (brief) {
      return [
        "                     P indicates configured to preempt.",
        "                     |",
        "Interface   Grp  Pri P State   Active          Standby         Virtual IP",
        ...st.map((x) => `${shortIf(x.iface).padEnd(12)}${String(x.group).padEnd(5)}${String(x.priority).padEnd(4)}${x.preempt ? "P" : " "} ${x.state.padEnd(8)}${(x.state === "Active" ? "local" : x.active ?? "unknown").padEnd(16)}${(x.state === "Standby" ? "local" : x.standby ?? "unknown").padEnd(16)}${x.vip ?? "unknown"}`),
      ].join("\n");
    }
    return st
      .map((x) =>
        [
          `${x.iface} - Group ${x.group}`,
          `  State is ${x.state}`,
          `  Virtual IP address is ${x.vip ?? "unknown"}`,
          `  Active virtual MAC address is ${x.mac} (MAC ${x.state === "Active" ? "In Use" : "Not In Use"})`,
          `  Hello time 3 sec, hold time 10 sec`,
          `  Preemption ${x.preempt ? "enabled" : "disabled"}`,
          `  Active router is ${x.state === "Active" ? "local" : x.active ?? "unknown"}`,
          `  Standby router is ${x.state === "Standby" ? "local" : x.standby ?? "unknown"}`,
          `  Priority ${x.priority} (${x.priority === 100 ? "default 100" : "configured " + x.priority})`,
        ].join("\n")
      )
      .join("\n");
  }

  showLldp(): string {
    if (!this.dev.lldpOn) return "% LLDP is not enabled";
    const rows = this.dev.ifaces
      .filter((i) => this.net.isUp(this.dev, i) && i.lldpTx !== false && i.lldpRx !== false)
      .map((i) => ({ i, p: this.net.peerOf(this.dev.id, i.name) }))
      .filter((n): n is { i: Iface; p: { dev: Device; iface: Iface } } => !!n.p && n.p.dev.kind !== "pc" && !!n.p.dev.lldpOn && n.p.iface.lldpTx !== false)
      .map(({ i, p }) => `${p.dev.hostname.padEnd(21)}${shortIf(i.name).padEnd(16)}120        ${(p.dev.kind === "router" ? "R" : p.dev.kind === "l3switch" ? "B,R" : "B").padEnd(16)}${shortIf(p.iface.name)}`);
    return ["Capability codes:", "    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device", "    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other", "", "Device ID           Local Intf     Hold-time  Capability      Port ID", ...rows, "", `Total entries displayed: ${rows.length}`].join("\n");
  }

  private clockText(withZone = true): string {
    const off = (this.dev.timezone?.hours ?? 0) * 3600000;
    const d = new Date(Date.now() + (this.dev.clockOffset ?? 0) + off);
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}${withZone ? ` ${this.dev.timezone?.name ?? "UTC"}` : ""} ${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
  }

  clockSet(rest: string): string | void {
    const m = rest.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/) ?? rest.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\s+([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s+(\d{4})$/);
    if (!m) return INVALID;
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const dayFirst = /^\d/.test(m[4]);
    const day = Number(dayFirst ? m[4] : m[5]);
    const mon = months.indexOf((dayFirst ? m[5] : m[4]).toLowerCase());
    if (mon < 0) return INVALID;
    const t = Date.UTC(Number(m[6]), mon, day, Number(m[1]), Number(m[2]), Number(m[3])) - (this.dev.timezone?.hours ?? 0) * 3600000;
    this.dev.clockOffset = t - Date.now();
  }

  /** Synchronise l'horloge sur le premier serveur NTP joignable (lui-même maître ou synchronisé). */
  private ntpSync(depth = 0): { server: string; stratum: number } | null {
    if (this.dev.ntpMaster) return null;
    for (const ip of this.dev.ntpServers ?? []) {
      const srv = this.net.devices.find((d) => d.kind !== "pc" && this.net.l3Ifaces(d).some((i) => i.ip === ip && this.net.isUp(d, i)));
      if (!srv || !this.net.ping(this.dev, ip, 2).some((r) => r.ok)) continue;
      let stratum: number | null = srv.ntpMaster ?? null;
      if (stratum === null && depth < 3) {
        const up = new IosCli(this.net, srv).ntpSync(depth + 1);
        stratum = up ? up.stratum : null;
      }
      if (stratum === null) continue;
      this.dev.clockOffset = srv.clockOffset ?? 0;
      return { server: ip, stratum: stratum + 1 };
    }
    return null;
  }

  showClock(): string {
    const sync = this.ntpSync();
    return `${sync || this.dev.ntpMaster ? "" : "*"}${this.clockText()}`;
  }

  showNtp(assoc: boolean): string {
    const sync = this.ntpSync();
    if (assoc) {
      const rows = (this.dev.ntpServers ?? []).map((ip) => `${sync?.server === ip ? "*~" : " ~"}${ip.padEnd(17)}${(sync?.server === ip ? "127.127.1.1" : ".INIT.").padEnd(16)}${String(sync?.server === ip ? sync.stratum - 1 : 16).padEnd(6)}12    64  377 0.000   0.000   0.001`);
      return ["  address         ref clock       st   when   poll reach  delay  offset   disp", ...rows, " * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured"].join("\n");
    }
    if (this.dev.ntpMaster) return `Clock is synchronized, stratum ${this.dev.ntpMaster}, reference is 127.127.1.1`;
    if (!sync) return "Clock is unsynchronized, stratum 16, no reference clock";
    return `Clock is synchronized, stratum ${sync.stratum}, reference is ${sync.server}\nnominal freq is 250.0000 Hz, actual freq is 250.0000 Hz, precision is 2**18\nreference time is ${this.clockText()}`;
  }

  showHosts(): string {
    const rows = (this.dev.hosts ?? []).map((h) => `${h.name.padEnd(24)}None  (perm, OK)  0   IP      ${h.ip}`);
    const dns = this.dev.extra.find((l) => l.startsWith("ip name-server "))?.split(/\s+/).slice(2).join(" ");
    return [`Default domain is ${this.dev.extra.find((l) => l.startsWith("ip domain-name "))?.split(" ")[2] ?? "not set"}`, `Name/address lookup uses ${this.dev.extra.includes("no ip domain-lookup") ? "static mappings" : "domain service"}`, `Name servers are ${dns ?? "255.255.255.255"}`, "", "Codes: UN - unknown, EX - expired, OK - OK, ?? - revalidate", "       temp - temporary, perm - permanent", "", "Host                      Port  Flags      Age Type   Address(es)", ...rows].join("\n");
  }

  showLogging(): string {
    const hosts = this.dev.extra.filter((l) => l.startsWith("logging host ")).map((l) => l.split(/\s+/).at(-1)!);
    const trap = this.dev.extra.find((l) => l.startsWith("logging trap "))?.split(/\s+/)[2] ?? "informational";
    const buf = this.net.logOf(this.dev);
    return [
      `Syslog logging: enabled (0 messages dropped, 0 flushes, 0 overruns)`,
      `    Console logging: ${this.dev.extra.includes("no logging console") ? "disabled" : "level debugging"}, ${buf.length} messages logged`,
      `    Monitor logging: level debugging, 0 messages logged`,
      `    Buffer logging:  level debugging, ${buf.length} messages logged`,
      `    Trap logging: level ${trap}, ${buf.length} message lines logged`,
      ...hosts.map((h) => `        Logging to ${h}  (udp port 514, audit disabled, link up), ${buf.length} message lines logged`),
      "",
      `Log Buffer (4096 bytes):`,
      ...buf,
    ].join("\n");
  }

  showSnmp(community: boolean): string {
    const comms = this.dev.extra.filter((l) => l.startsWith("snmp-server community ")).map((l) => l.split(/\s+/));
    if (community) return comms.map((c) => `Community name: ${c[2]}\nCommunity Index: ${c[2]}\nCommunity SecurityName: ${c[2]}\nstorage-type: nonvolatile        active${c[3] ? `\naccess: ${c[3].toUpperCase() === "RW" ? "read-write" : "read-only"}` : ""}`).join("\n\n");
    if (!comms.length) return "%SNMP agent not enabled";
    const loc = this.dev.extra.find((l) => l.startsWith("snmp-server location "))?.slice(21);
    const contact = this.dev.extra.find((l) => l.startsWith("snmp-server contact "))?.slice(20);
    return [`Chassis: ${this.dev.hostname}`, ...(contact ? [`Contact: ${contact}`] : []), ...(loc ? [`Location: ${loc}`] : []), "0 SNMP packets input", "0 SNMP packets output", `SNMP logging: ${this.dev.extra.some((l) => l.startsWith("snmp-server host")) ? "enabled" : "disabled"}`].join("\n");
  }

  reload(): string {
    const msg = `Proceed with reload? [confirm]\n\n%SYS-5-RELOAD: Reload requested by console. Reload Reason: Reload Command.`;
    this.net.reloadDevice(this.dev);
    this.mode = "user";
    this.resetSub();
    this.authed = false;
    return `${msg}\n\n\n${this.dev.saved ? "" : "         --- System Configuration Dialog ---\n\nWould you like to enter the initial configuration dialog? [yes/no]: no\n\n"}Press RETURN to get started!`;
  }

  erase(): string {
    this.dev.saved = undefined;
    this.dev.startup = undefined;
    return "Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]\n[OK]\nErase of nvram: complete\n%SYS-7-NV_BLOCK_INIT: Initialized the geometry of nvram";
  }

  showFlash(): string {
    return `Directory of flash:/\n\n    1  -rw-   486899872          <no date>  koralab-universalk9.SPA.bin\n    2  -rw-        ${String((this.dev.startup ?? "").length).padStart(4)}          <no date>  startup-config\n\n3249049600 bytes total (2761149728 bytes free)`;
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

  showIpRoute(filter?: string): string {
    if (!this.net.routes(this.dev)) {
      return `Default gateway is ${this.dev.gateway ?? "not set"}\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty`;
    }
    const codes =
      "Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area\n       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2\n       E1 - OSPF external type 1, E2 - OSPF external type 2\n       * - candidate default, U - per-user static route\n";
    let routes = this.net.routingTable(this.dev);
    const f = filter?.toLowerCase();
    if (f && isIp(f)) {
      const hit = routes.filter((r) => r.code !== "L" && networkOf(f, prefixToMask(r.prefix)) === r.network).sort((a, b) => b.prefix - a.prefix)[0];
      if (!hit) return "% Network not in table";
      return `Routing entry for ${hit.network}/${hit.prefix}\n  Known via "${hit.code.startsWith("O") ? `ospf ${this.dev.ospf?.pid}` : hit.code === "S" ? "static" : "connected"}", distance ${hit.ad}, metric ${hit.metric}\n  Routing Descriptor Blocks:\n  * ${hit.via ?? "directly connected"}${hit.iface ? `, via ${hit.iface}` : ""}`;
    }
    if (f) {
      const want = "connected".startsWith(f) ? ["C", "L"] : "static".startsWith(f) ? ["S"] : "ospf".startsWith(f) ? ["O", "O IA", "O*E2"] : null;
      if (!want) return INVALID;
      routes = routes.filter((r) => want.includes(r.code));
    }
    const def = this.net.routingTable(this.dev).find((r) => r.prefix === 0);
    const gw = def ? `Gateway of last resort is ${def.via ?? def.iface} to network 0.0.0.0` : "Gateway of last resort is not set";
    const lines = routes.flatMap((r) => {
      const code = r.code === "S" && r.prefix === 0 ? "S*" : r.code;
      const dest = `${r.network}/${r.prefix}`;
      if (r.code === "C" || r.code === "L") return [`${code.padEnd(9)}${dest} is directly connected, ${r.iface}`];
      if (r.code === "S" && !r.via) return [`${code.padEnd(9)}${dest} is directly connected, ${r.iface}`];
      const age = r.code.startsWith("O") ? ", 00:00:12" : "";
      const ifs = r.code.startsWith("O") ? `, ${r.iface}` : "";
      return [`${code.padEnd(9)}${dest} [${r.ad}/${r.metric}] via ${r.via}${age}${ifs}`, ...(r.alt ?? []).map((a) => `${" ".repeat(9 + dest.length)} [${r.ad}/${r.metric}] via ${a.nextHop}${age}, ${a.out.name}`)];
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
    const logical = this.net.logicalPorts(this.dev).filter((l) => this.net.isUp(this.dev, l.phys) && this.net.opMode(this.dev, l.phys) === "trunk");
    const trunks = logical.map((l) => ({ ...l.phys, name: l.name }));
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
      const st = !p.adminUp ? "disabled" : this.net.errDisabled(this.dev, p) ? "err-disabled" : this.net.isUp(this.dev, p) ? "connected" : "notconnect";
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
    if (this.dev.cdpOff) return "% CDP is not enabled";
    const neighbors = this.dev.ifaces
      .filter((i) => this.net.isUp(this.dev, i) && !i.cdpOff)
      .map((i) => ({ local: i, peer: this.net.peerOf(this.dev.id, i.name) }))
      .filter((n): n is { local: Iface; peer: { dev: Device; iface: Iface } } => !!n.peer && n.peer.dev.kind !== "pc" && !n.peer.dev.cdpOff && !n.peer.iface.cdpOff);
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

  showAcls(only?: string): string {
    const acls = (this.dev.acls ?? []).filter((a) => !only || a.name === only);
    return acls
      .map((a) => {
        const head = `${a.extended ? "Extended" : "Standard"} IP access list ${a.name}`;
        const rules = a.rules.map((r) => {
          const hits = this.net.aclMatches(this.dev, a.name, r.seq);
          return `    ${r.seq} ${r.text}${hits ? ` (${hits} match${hits > 1 ? "es" : ""})` : ""}`;
        });
        return [head, ...rules].join("\n");
      })
      .join("\n");
  }

  showIpInterface(raw: string): string {
    const name = resolveIfaceName(this.dev, raw.trim());
    const i = name ? this.net.findIface(this.dev, name) : undefined;
    if (!i) return INVALID;
    const up = this.net.isUp(this.dev, i);
    return [
      `${i.name} is ${!i.adminUp ? "administratively down" : up ? "up" : "down"}, line protocol is ${up ? "up" : "down"}`,
      i.ip && i.mask ? `  Internet address is ${i.ip}/${maskToPrefix(i.mask)}` : "  Internet protocol processing disabled",
      ...(i.ip && i.mask ? [`  Broadcast address is 255.255.255.255`, `  Address determined by ${i.dhcp ? "DHCP" : "setup command"}`] : []),
      `  MTU is 1500 bytes`,
      `  Helper address is ${i.helpers?.length ? i.helpers.join(", ") : "not set"}`,
      `  Outgoing access list is ${i.aclOut ?? "not set"}`,
      `  Inbound  access list is ${i.aclIn ?? "not set"}`,
      `  Proxy ARP is enabled`,
      `  Network address translation is ${i.nat ? `enabled, interface in domain ${i.nat}` : "disabled"}`,
    ].join("\n");
  }

  showDhcpBinding(): string {
    const rows = (this.dev.dhcpLeases ?? []).map((l) => `${l.ip.padEnd(18)}${("01" + l.mac.replace(/\./g, "")).replace(/(....)(?=.)/g, "$1.").padEnd(24)}${"--".padEnd(22)}Automatic`);
    return [`IP address        Client-ID/              Lease expiration      Type`, `                  Hardware address`, ...rows].join("\n");
  }

  showDhcpPool(): string {
    return (this.dev.dhcpPools ?? [])
      .map((p) => {
        const leased = (this.dev.dhcpLeases ?? []).filter((l) => l.pool === p.name).length;
        const total = p.mask ? Math.max(0, 2 ** (32 - maskToPrefix(p.mask)) - 2) : 0;
        return [
          `Pool ${p.name} :`,
          ` Utilization mark (high/low)    : 100 / 0`,
          ` Subnet size (first/next)       : 0 / 0`,
          ` Total addresses                : ${total}`,
          ` Leased addresses               : ${leased}`,
          ` Excluded addresses             : ${(this.dev.dhcpExcluded ?? []).length}`,
          ` Pending event                  : none`,
          ` 1 subnet is currently in the pool :`,
          ` Current index        IP address range                    Leased/Excluded/Total`,
          ` ${p.network ?? "-"}          ${p.network ?? "-"} - ${p.network ?? "-"}/${p.mask ? maskToPrefix(p.mask) : "-"}       ${leased} / ${(this.dev.dhcpExcluded ?? []).length} / ${total}`,
          ...(p.router ? [` Default router                 : ${p.router}`] : []),
          ...(p.dns ? [` DNS server                     : ${p.dns}`] : []),
        ].join("\n");
      })
      .join("\n\n");
  }

  showNat(): string {
    const fmt = (ip: string, port?: number) => (port === undefined ? ip : `${ip}:${port}`);
    const rows = this.net.natTable(this.dev).map((e) => {
      const outside = e.outside ? fmt(e.outside, e.globalPort === undefined ? undefined : e.localPort) : "---";
      return `${e.proto.padEnd(6)}${fmt(e.insideGlobal, e.globalPort).padEnd(22)}${fmt(e.insideLocal, e.localPort).padEnd(22)}${outside.padEnd(22)}${outside}`;
    });
    return [`Pro   Inside global         Inside local          Outside local         Outside global`, ...rows].join("\n");
  }

  showNatStats(): string {
    const all = allIfaces(this.dev);
    const table = this.net.natTable(this.dev);
    return [
      `Total active translations: ${table.length} (${table.filter((e) => e.static).length} static, ${table.filter((e) => !e.static).length} dynamic; ${table.filter((e) => e.globalPort !== undefined).length} extended)`,
      `Outside interfaces:`,
      `  ${all.filter((i) => i.nat === "outside").map((i) => i.name).join(", ")}`,
      `Inside interfaces:`,
      `  ${all.filter((i) => i.nat === "inside").map((i) => i.name).join(", ")}`,
      `Dynamic mappings:`,
      ...(this.dev.nat?.rules ?? []).map((r) => `-- Inside Source\n[Id: 1] access-list ${r.acl} ${r.pool ? `pool ${r.pool}` : `interface ${r.iface}`}${r.overload ? " overload" : ""} refcount ${table.filter((e) => !e.static).length}`),
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
    if (d.ipv6Routing) out.push("ipv6 unicast-routing", "!");
    if (d.timezone) out.push(`clock timezone ${d.timezone.name} ${d.timezone.hours}`);
    for (const h of d.hosts ?? []) out.push(`ip host ${h.name} ${h.ip}`);
    if (d.cdpOff) out.push("no cdp run");
    if (d.lldpOn) out.push("lldp run");
    if (d.timezone || d.hosts?.length || d.cdpOff || d.lldpOn) out.push("!");
    if (isSwitchLike(d)) {
      out.push(`spanning-tree mode ${d.stp?.mode ?? "pvst"}`);
      if (d.stp?.portfastDefault) out.push("spanning-tree portfast default");
      if (d.stp?.bpduguardDefault) out.push("spanning-tree portfast bpduguard default");
      for (const [v, pr] of Object.entries(d.stp?.priorities ?? {})) out.push(`spanning-tree vlan ${v} priority ${pr}`);
      if (d.snooping?.enabled) out.push("ip dhcp snooping");
      if (d.snooping?.vlans.length) out.push(`ip dhcp snooping vlan ${formatVlanList(d.snooping.vlans)}`);
      if (d.dai?.vlans.length) out.push(`ip arp inspection vlan ${formatVlanList(d.dai.vlans)}`);
      out.push("!");
    }
    for (const [a, b] of d.dhcpExcluded ?? []) out.push(`ip dhcp excluded-address ${a}${b !== a ? ` ${b}` : ""}`);
    if (d.dhcpExcluded?.length) out.push("!");
    for (const p of d.dhcpPools ?? []) {
      out.push(`ip dhcp pool ${p.name}`);
      if (p.network) out.push(` network ${p.network} ${p.mask}`);
      if (p.router) out.push(` default-router ${p.router}`);
      if (p.dns) out.push(` dns-server ${p.dns}`);
      if (p.domain) out.push(` domain-name ${p.domain}`);
      if (p.lease) out.push(` lease ${p.lease}`);
      if (p.wlc) out.push(` option 43 hex f104${p.wlc.split(".").map((o) => Number(o).toString(16).padStart(2, "0")).join("")}`);
      out.push("!");
    }
    for (const v of d.vlans ?? []) {
      out.push(`vlan ${v.id}`);
      if (v.name !== `VLAN${String(v.id).padStart(4, "0")}`) out.push(` name ${v.name}`);
      out.push("!");
    }
    const ifaceBlock = (i: Iface) => {
      out.push(`interface ${i.name}`);
      if (i.description) out.push(` description ${i.description}`);
      if (isSubif(i.name) && i.encap) out.push(` encapsulation dot1Q ${i.encap}${i.native ? " native" : ""}`);
      if (this.net.isSwitchport(d, i) || isPortChannel(i.name)) {
        if (i.trunkEncap) out.push(" switchport trunk encapsulation dot1q");
        if (i.accessVlan) out.push(` switchport access vlan ${i.accessVlan}`);
        if (i.nativeVlan) out.push(` switchport trunk native vlan ${i.nativeVlan}`);
        if (i.allowed) out.push(` switchport trunk allowed vlan ${i.allowed}`);
        if (i.mode === "access" || i.mode === "trunk") out.push(` switchport mode ${i.mode}`);
        if (i.mode === "dynamic-desirable") out.push(" switchport mode dynamic desirable");
        if (i.nonegotiate) out.push(" switchport nonegotiate");
        if (i.channel) out.push(` channel-group ${i.channel.group} mode ${i.channel.mode}`);
        if (i.psec) {
          out.push(" switchport port-security");
          if (i.psec.max) out.push(` switchport port-security maximum ${i.psec.max}`);
          if (i.psec.violation) out.push(` switchport port-security violation ${i.psec.violation}`);
          if (i.psec.sticky) out.push(" switchport port-security mac-address sticky");
          for (const m of i.psec.macs ?? []) out.push(` switchport port-security mac-address ${m.startsWith("sticky:") ? `sticky ${m.slice(7)}` : m}`);
        }
        if (i.dhcpTrust) out.push(" ip dhcp snooping trust");
        if (i.arpTrust) out.push(" ip arp inspection trust");
        if (i.portfast) out.push(" spanning-tree portfast");
        if (i.bpduguard !== undefined) out.push(` spanning-tree bpduguard ${i.bpduguard ? "enable" : "disable"}`);
        if (i.stpCost) out.push(` spanning-tree cost ${i.stpCost}`);
        if (i.stpPrio) out.push(` spanning-tree port-priority ${i.stpPrio}`);
      } else {
        if (i.routed) out.push(" no switchport");
        out.push(i.dhcp ? " ip address dhcp" : i.ip ? ` ip address ${i.ip} ${i.mask}` : " no ip address");
        for (const h of i.helpers ?? []) out.push(` ip helper-address ${h}`);
        if (i.aclIn) out.push(` ip access-group ${i.aclIn} in`);
        if (i.aclOut) out.push(` ip access-group ${i.aclOut} out`);
        if (i.nat) out.push(` ip nat ${i.nat}`);
        for (const g of i.hsrp ?? []) {
          if (g.version === 2) out.push(" standby version 2");
          out.push(` standby ${g.group} ip${g.vip ? ` ${g.vip}` : ""}`);
          if (g.priority !== undefined) out.push(` standby ${g.group} priority ${g.priority}`);
          if (g.preempt) out.push(` standby ${g.group} preempt`);
        }
        if (i.cdpOff) out.push(" no cdp enable");
        if (i.lldpTx === false) out.push(" no lldp transmit");
        if (i.lldpRx === false) out.push(" no lldp receive");
        if (i.ll) out.push(` ipv6 address ${show6(i.ll)} link-local`);
        for (const a of (i.ipv6 ?? []).filter((x) => !x.auto)) out.push(a.eui ? ` ipv6 address ${show6(network6(a.addr, 64))}/64 eui-64` : ` ipv6 address ${show6(a.addr)}/${a.len}`);
        if (i.ipv6Autoconfig) out.push(" ipv6 address autoconfig");
        if (i.ipv6Enabled) out.push(" ipv6 enable");
        if (i.ospfArea) out.push(` ip ospf ${i.ospfArea.pid} area ${i.ospfArea.area}`);
        if (i.ospfCost) out.push(` ip ospf cost ${i.ospfCost}`);
        if (i.ospfPriority !== undefined) out.push(` ip ospf priority ${i.ospfPriority}`);
        if (i.ospfHello) out.push(` ip ospf hello-interval ${i.ospfHello}`);
        if (i.ospfDead) out.push(` ip ospf dead-interval ${i.ospfDead}`);
        if (i.ospfP2p) out.push(" ip ospf network point-to-point");
      }
      if (!i.adminUp) out.push(" shutdown");
      out.push("!");
    };
    for (const i of d.loopbacks ?? []) ifaceBlock(i);
    for (const i of d.portChannels ?? []) ifaceBlock(i);
    for (const i of d.ifaces) {
      ifaceBlock(i);
      for (const s of (d.subifs ?? []).filter((x) => parentOf(x.name) === i.name)) ifaceBlock(s);
    }
    for (const s of d.svis ?? []) ifaceBlock(s);
    if (d.gateway && isSwitchLike(d)) out.push(`ip default-gateway ${d.gateway}`, "!");
    for (const p of d.nat?.pools ?? []) out.push(`ip nat pool ${p.name} ${p.start} ${p.end} netmask ${p.mask}`);
    for (const r of d.nat?.rules ?? []) out.push(`ip nat inside source list ${r.acl} ${r.pool ? `pool ${r.pool}` : `interface ${r.iface}`}${r.overload ? " overload" : ""}`);
    for (const st of d.nat?.statics ?? []) out.push(`ip nat inside source static ${st.local} ${st.global}`);
    if (d.nat && (d.nat.pools.length || d.nat.rules.length || d.nat.statics.length)) out.push("!");
    if (d.ospf) {
      const o = d.ospf;
      out.push(`router ospf ${o.pid}`);
      if (o.routerId) out.push(` router-id ${o.routerId}`);
      if (o.refBw) out.push(` auto-cost reference-bandwidth ${o.refBw}`);
      if (o.passiveDefault) out.push(" passive-interface default");
      for (const x of o.passiveDefault ? o.noPassive : o.passive) out.push(` ${o.passiveDefault ? "no " : ""}passive-interface ${x}`);
      for (const n of o.networks) out.push(` network ${n.ip} ${n.wildcard} area ${n.area}`);
      if (o.defaultOriginate) out.push(" default-information originate");
      out.push("!");
    }
    for (const r of d.routes) out.push(`ip route ${r.network} ${r.mask} ${[r.iface, r.nextHop].filter(Boolean).join(" ")}${r.ad !== undefined ? ` ${r.ad}` : ""}`);
    if (d.routes.length) out.push("!");
    for (const r of d.routes6 ?? []) out.push(`ipv6 route ${show6(r.prefix)}/${r.len}${r.iface ? ` ${r.iface}` : ""}${r.nextHop ? ` ${show6(r.nextHop)}` : ""}${r.ad !== undefined ? ` ${r.ad}` : ""}`);
    if (d.routes6?.length) out.push("!");
    for (const a of d.acls ?? []) {
      if (/^\d+$/.test(a.name)) {
        for (const r of a.remarks ?? []) out.push(`access-list ${a.name} remark ${r}`);
        for (const r of a.rules) out.push(`access-list ${a.name} ${r.cfg}`);
      } else {
        out.push(`ip access-list ${a.extended ? "extended" : "standard"} ${a.name}`);
        for (const r of a.remarks ?? []) out.push(` remark ${r}`);
        for (const r of a.rules) out.push(` ${r.cfg}`);
      }
      out.push("!");
    }
    for (const [name, block] of Object.entries(d.lines ?? {})) {
      out.push(name, ...block.map((l) => (pw ? l.replace(/^ password (?!7 )(\S+)$/, " password 7 0822455D0A16") : l)), "!");
    }
    if (d.ntpMaster) out.push(`ntp master ${d.ntpMaster}`);
    for (const n of d.ntpServers ?? []) out.push(`ntp server ${n}`);
    out.push("end");
    const body = out.join("\n");
    return `Building configuration...\n\nCurrent configuration : ${body.length} bytes\n${body}`;
  }

  ping(dst: string): string {
    dst = this.dev.hosts?.find((h) => h.name.toLowerCase() === dst.toLowerCase())?.ip ?? dst;
    const v6 = dst.includes(":");
    if (v6 ? !isIp6(dst) : !isIp(dst)) return "% Unrecognized host or address, or protocol not running.";
    const res = v6 ? this.net.ping6(this.dev, dst, 5) : this.net.ping(this.dev, dst, 5);
    if (v6) dst = show6(dst);
    const ok = res.filter((r) => r.ok).length;
    const marks = res.map((r) => (r.ok ? "!" : r.kind === "unreachable" ? "U" : ".")).join("");
    return `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${dst}, timeout is 2 seconds:\n${marks}\nSuccess rate is ${Math.round((ok / 5) * 100)} percent (${ok}/5)${ok ? ", round-trip min/avg/max = 0/1/2 ms" : ""}`;
  }

  trace(dst: string): string {
    dst = this.dev.hosts?.find((h) => h.name.toLowerCase() === dst.toLowerCase())?.ip ?? dst;
    const v6 = dst.includes(":");
    if (v6 ? !isIp6(dst) : !isIp(dst)) return "% Unrecognized host or address, or protocol not running.";
    const hops = v6 ? this.net.traceroute6(this.dev, dst) : this.net.traceroute(this.dev, dst);
    if (v6) dst = show6(dst);
    const lines = hops.map((h, k) => `  ${String(k + 1).padStart(2)} ${h ? `${v6 ? show6(h) : h} 0 msec 0 msec 1 msec` : "*  *  *"}`);
    return `Type escape sequence to abort.\nTracing the route to ${dst}\n\n${lines.join("\n")}`;
  }
}

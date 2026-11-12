// TP de dépannage : le réseau est livré configuré, avec des pannes cachées à trouver et à réparer.

import { F, G, M24, M30, add, cable, ck, conf, host, type CatalogSpec } from "./base";

const cmd = (c: string, desc: string) => ({ cmd: c, desc });

const METHODE = [
  "Procédez couche par couche : câbles et interfaces, puis adressage, puis VLAN, puis routage et services.",
  "Ne modifiez que ce qui est faux : une configuration correcte doit rester en place.",
  "Après chaque correction, cliquez sur « Vérifier » : la panne réparée passe au vert.",
];

export const DEPANNAGE: CatalogSpec[] = [
  // ---------------------------------------------------------------- D1
  {
    slug: "depannage-01-connectivite",
    title: "Dépannage : le service comptable est coupé du reste",
    level: "CCNA 1",
    category: "Dépannage",
    difficulty: "Débutant",
    minutes: 30,
    summary: "Trois pannes d'interface et d'adressage empêchent deux réseaux de communiquer. Trouvez-les.",
    context:
      "Lundi matin chez Ahouandjinou & Fils (fictif, Cotonou) : la comptabilité ne joint plus le serveur de fichiers de la direction, et un poste de la direction ne sort plus de son réseau. Le week-end, un technicien a « fait du rangement » dans les configurations.",
    objectives: ["Constater les symptômes avec ping et les commandes show", "Trouver et corriger les trois pannes", "Rétablir la communication entre les deux réseaux"],
    addressing: [
      { device: "R1", iface: "G0/0/0", ip: "192.168.10.1", mask: M24, gw: "Direction" },
      { device: "R1", iface: "G0/0/1", ip: "192.168.20.1", mask: M24, gw: "Comptabilité" },
      { device: "PC-DIR1", iface: "NIC", ip: "192.168.10.11", mask: M24, gw: "192.168.10.1" },
      { device: "PC-DIR2", iface: "NIC", ip: "192.168.10.12", mask: M24, gw: "192.168.10.1" },
      { device: "PC-COMPTA", iface: "NIC", ip: "192.168.20.10", mask: M24, gw: "192.168.20.1" },
    ],
    tips: [...METHODE, "« show ip interface brief » révèle une interface éteinte (administratively down).", "Sur un PC, « ipconfig » affiche l'adresse, le masque et la passerelle."],
    commands: [cmd("show ip interface brief", "État et adresses des interfaces"), cmd("ipconfig", "Configuration IP d'un PC"), cmd("ping / tracert", "Tester et localiser la coupure"), cmd("no shutdown", "Réactiver une interface")],
    build(net) {
      const r1 = add(net, "router", 330, 30, "R1");
      const s1 = add(net, "switch", 130, 200, "S-DIRECTION");
      const s2 = add(net, "switch", 530, 200, "S-COMPTA");
      const d1 = add(net, "pc", 40, 380, "PC-DIR1");
      const d2 = add(net, "pc", 220, 380, "PC-DIR2");
      const c = add(net, "pc", 530, 380, "PC-COMPTA");
      cable(net, r1, G("0/0/0"), s1, G("0/1"));
      cable(net, r1, G("0/0/1"), s2, G("0/1"));
      cable(net, s1, F("0/1"), d1, F("0"));
      cable(net, s1, F("0/2"), d2, F("0"));
      cable(net, s2, F("0/1"), c, F("0"));
      conf(net, r1, `interface g0/0/0
ip address 192.168.10.1 255.255.255.0
no shutdown
interface g0/0/1
ip address 192.168.20.1 255.255.255.0
shutdown`); // panne 1 : interface éteinte
      host(d1, "192.168.10.11", M24, "192.168.10.1");
      host(d2, "192.168.10.12", M24, "192.168.10.254"); // panne 2 : mauvaise passerelle
      host(c, "192.168.21.10", M24, "192.168.20.1"); // panne 3 : adresse hors du réseau
      return { r1, d1, d2, c };
    },
    steps: [
      {
        title: "Panne côté routeur",
        body: "Depuis PC-COMPTA, la passerelle ne répond pas. Regardez l'état des interfaces de R1 avec `show ip interface brief`.",
        checks: (d) => [ck.up(d.r1, G("0/0/1"))],
      },
      {
        title: "Panne sur un poste de la direction",
        body: "PC-DIR1 joint le réseau comptable, mais pas PC-DIR2. Comparez leur configuration avec `ipconfig` et la table d'adressage.",
        checks: (d) => [ck.gw(d.d2, "192.168.10.1")],
      },
      {
        title: "Panne sur le poste comptable",
        body: "Vérifiez l'adresse de PC-COMPTA : appartient-elle bien au réseau de sa passerelle ?",
        checks: (d) => [ck.ip(d.c, F("0"), "192.168.20.10", M24)],
      },
      {
        title: "Vérifier la réparation",
        body: "Depuis PC-DIR1 et PC-DIR2 : `ping 192.168.20.10`.",
        checks: (d) => [ck.ping(d.d1, "192.168.20.10"), ck.ping(d.d2, "192.168.20.10")],
      },
    ],
  },

  // ---------------------------------------------------------------- D2
  {
    slug: "depannage-02-vlan-trunk",
    title: "Dépannage : les VLAN ne traversent plus le trunk",
    level: "CCNA 2",
    category: "Dépannage",
    difficulty: "Intermédiaire",
    minutes: 40,
    summary: "VLAN manquant, trunk cassé, port dans le mauvais VLAN : remettez les deux étages en service.",
    context:
      "Au cabinet fictif Kpodo Avocats, après le remplacement du switch du 2ᵉ étage, plus personne ne joint ses collègues de l'autre étage, même dans le même service. Le nouveau switch a été « configuré de mémoire ».",
    objectives: ["Analyser les VLAN et le trunk des deux switchs", "Corriger les trois pannes de commutation", "Rétablir la communication dans chaque VLAN"],
    addressing: [
      { device: "PC-JURI1", iface: "S1 Fa0/1 · VLAN 10", ip: "192.168.10.11", mask: M24, gw: "" },
      { device: "PC-SECR1", iface: "S1 Fa0/2 · VLAN 20", ip: "192.168.20.11", mask: M24, gw: "" },
      { device: "PC-JURI2", iface: "S2 Fa0/1 · VLAN 10", ip: "192.168.10.12", mask: M24, gw: "" },
      { device: "PC-SECR2", iface: "S2 Fa0/2 · VLAN 20", ip: "192.168.20.12", mask: M24, gw: "" },
    ],
    tips: [...METHODE, "« show vlan brief » : quels VLAN existent, et quels ports y sont ?", "« show interfaces trunk » : si rien ne s'affiche, le lien n'est pas un trunk."],
    commands: [cmd("show vlan brief", "VLAN et ports"), cmd("show interfaces trunk", "État des trunks"), cmd("show interfaces f0/2 switchport", "Mode et VLAN d'un port"), cmd("switchport mode trunk", "Remettre un trunk")],
    build(net) {
      const s1 = add(net, "switch", 160, 80, "S1");
      const s2 = add(net, "switch", 520, 80, "S2");
      const j1 = add(net, "pc", 60, 280, "PC-JURI1");
      const e1 = add(net, "pc", 260, 280, "PC-SECR1");
      const j2 = add(net, "pc", 420, 280, "PC-JURI2");
      const e2 = add(net, "pc", 620, 280, "PC-SECR2");
      cable(net, s1, G("0/1"), s2, G("0/1"));
      cable(net, s1, F("0/1"), j1, F("0"));
      cable(net, s1, F("0/2"), e1, F("0"));
      cable(net, s2, F("0/1"), j2, F("0"));
      cable(net, s2, F("0/2"), e2, F("0"));
      host(j1, "192.168.10.11", M24);
      host(e1, "192.168.20.11", M24);
      host(j2, "192.168.10.12", M24);
      host(e2, "192.168.20.12", M24);
      conf(net, s1, `vlan 10
name JURIDIQUE
vlan 20
name SECRETARIAT
exit
interface f0/1
switchport mode access
switchport access vlan 10
interface f0/2
switchport mode access
switchport access vlan 20
interface g0/1
switchport mode access`); // panne 1 : le lien inter-switch n'est pas un trunk
      conf(net, s2, `vlan 10
name JURIDIQUE
exit
interface f0/1
switchport mode access
switchport access vlan 10
interface f0/2
switchport mode access
switchport access vlan 10
interface g0/1
switchport mode trunk`); // pannes 2 et 3 : VLAN 20 absent, Fa0/2 dans le VLAN 10
      return { s1, s2, j1, e1 };
    },
    steps: [
      { title: "Le lien entre les switchs", body: "Sur les deux switchs, `show interfaces trunk`. Le lien G0/1 doit transporter tous les VLAN.", checks: (d) => [ck.trunk(d.s1, G("0/1"))] },
      { title: "Les VLAN du switch S2", body: "Comparez `show vlan brief` sur S1 et sur S2 : un VLAN manque-t-il ? (pensez aussi à son nom)", checks: (d) => [ck.vlan(d.s2, 20, "SECRETARIAT")] },
      { title: "Le port du secrétariat sur S2", body: "PC-SECR2 est branché sur S2 Fa0/2. Dans quel VLAN se trouve ce port ? Comparez avec la table.", checks: (d) => [ck.access(d.s2, F("0/2"), 20)] },
      { title: "Vérifier la réparation", body: "PC-JURI1 → `ping 192.168.10.12` ; PC-SECR1 → `ping 192.168.20.12`.", checks: (d) => [ck.ping(d.j1, "192.168.10.12"), ck.ping(d.e1, "192.168.20.12")] },
    ],
  },

  // ---------------------------------------------------------------- D3
  {
    slug: "depannage-03-inter-vlan",
    title: "Dépannage : le routage inter-VLAN ne fonctionne plus",
    level: "CCNA 2",
    category: "Dépannage",
    difficulty: "Intermédiaire",
    minutes: 45,
    summary: "Sous-interface mal étiquetée, trunk absent et mauvaise passerelle : réparez un router-on-a-stick.",
    context:
      "Le centre de formation fictif FormaTech Abomey a deux VLAN (Pédagogie 10, Étudiants 20) routés par R1. Depuis une intervention, les étudiants n'atteignent plus la pédagogie.",
    objectives: ["Vérifier les sous-interfaces du routeur", "Vérifier le lien switch-routeur", "Vérifier les postes", "Rétablir le routage entre VLAN"],
    addressing: [
      { device: "R1", iface: "G0/0/1.10", ip: "192.168.10.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/1.20", ip: "192.168.20.1", mask: M24, gw: "" },
      { device: "PC-PEDA", iface: "S1 Fa0/1 · VLAN 10", ip: "192.168.10.10", mask: M24, gw: "192.168.10.1" },
      { device: "PC-ETUD", iface: "S1 Fa0/2 · VLAN 20", ip: "192.168.20.10", mask: M24, gw: "192.168.20.1" },
    ],
    tips: [...METHODE, "« show running-config » sur R1 : chaque sous-interface doit être étiquetée avec SON VLAN.", "Le port du switch vers le routeur doit être un trunk."],
    commands: [cmd("show ip interface brief", "Sous-interfaces et état"), cmd("show running-config", "Configuration complète"), cmd("encapsulation dot1Q <vlan>", "VLAN d'une sous-interface"), cmd("show interfaces trunk", "Trunks du switch")],
    build(net) {
      const r1 = add(net, "router", 300, 30, "R1");
      const s1 = add(net, "switch", 300, 210, "S1");
      const p = add(net, "pc", 140, 390, "PC-PEDA");
      const e = add(net, "pc", 460, 390, "PC-ETUD");
      cable(net, r1, G("0/0/1"), s1, G("0/1"));
      cable(net, s1, F("0/1"), p, F("0"));
      cable(net, s1, F("0/2"), e, F("0"));
      conf(net, s1, `vlan 10
name PEDAGOGIE
vlan 20
name ETUDIANTS
exit
interface f0/1
switchport mode access
switchport access vlan 10
interface f0/2
switchport mode access
switchport access vlan 20`); // panne 1 : G0/1 reste un port d'accès (VLAN 1)
      conf(net, r1, `interface g0/0/1
no shutdown
interface g0/0/1.10
encapsulation dot1Q 10
ip address 192.168.10.1 255.255.255.0
interface g0/0/1.20
encapsulation dot1Q 30
ip address 192.168.20.1 255.255.255.0`); // panne 2 : mauvaise étiquette
      host(p, "192.168.10.10", M24, "192.168.10.1");
      host(e, "192.168.20.10", M24, "192.168.10.1"); // panne 3 : passerelle d'un autre VLAN
      return { r1, s1, p, e };
    },
    steps: [
      { title: "Le lien vers le routeur", body: "Sur S1, le port G0/1 relié à R1 transporte-t-il les VLAN 10 et 20 ?", checks: (d) => [ck.trunk(d.s1, G("0/1"))] },
      {
        title: "Les sous-interfaces de R1",
        body: "Lisez la configuration de `G0/0/1.10` et `G0/0/1.20` dans `show running-config`.",
        checks: (d) => [ck.show(d.r1, "show running-config", "^interface GigabitEthernet0/0/1\\.20\\n(?: .*\\n)*? encapsulation dot1Q 20\\b", "G0/0/1.20 est étiquetée VLAN 20")],
      },
      { title: "Le poste étudiant", body: "`ipconfig` sur PC-ETUD : sa passerelle est-elle dans son réseau ?", checks: (d) => [ck.gw(d.e, "192.168.20.1")] },
      { title: "Vérifier la réparation", body: "PC-ETUD → `ping 192.168.10.10`.", checks: (d) => [ck.ping(d.e, "192.168.10.10"), ck.ping(d.p, "192.168.20.10")] },
    ],
  },

  // ---------------------------------------------------------------- D4
  {
    slug: "depannage-04-dhcp",
    title: "Dépannage : les postes n'obtiennent plus d'adresse",
    level: "CCNA 2",
    category: "Dépannage",
    difficulty: "Avancé",
    minutes: 50,
    summary: "Relais oublié, route manquante, passerelle fausse dans le pool : remettez le DHCP en service.",
    context:
      "Au collège fictif Saint-Michel de Ouidah, le serveur DHCP est R1 (bâtiment A). Les postes du bâtiment B, derrière R2, restent sans adresse depuis le changement de routeur.",
    objectives: ["Comprendre le chemin d'une demande DHCP relayée", "Corriger les trois pannes", "Faire obtenir une adresse correcte au poste du bâtiment B"],
    addressing: [
      { device: "R1", iface: "G0/0/0", ip: "192.168.11.1", mask: M24, gw: "Bâtiment A · serveur DHCP" },
      { device: "R1", iface: "G0/0/2", ip: "10.1.1.1", mask: M30, gw: "" },
      { device: "R2", iface: "G0/0/2", ip: "10.1.1.2", mask: M30, gw: "" },
      { device: "R2", iface: "G0/0/0", ip: "192.168.22.1", mask: M24, gw: "Bâtiment B · relais" },
      { device: "PC-B", iface: "NIC", ip: "DHCP (192.168.22.0/24)", mask: "", gw: "192.168.22.1" },
    ],
    tips: [...METHODE, "Une demande DHCP est une diffusion : sans relais (ip helper-address), elle ne traverse pas R2.", "Le serveur répond à l'adresse du relais : il doit savoir y aller.", "« show running-config | section dhcp » sur R1 : relisez chaque pool."],
    commands: [cmd("show ip dhcp binding", "Baux attribués"), cmd("show ip route", "Le serveur sait-il revenir ?"), cmd("ip helper-address 10.1.1.1", "Relais sur R2"), cmd("default-router <adresse>", "Passerelle donnée par un pool")],
    build(net) {
      const r1 = add(net, "router", 160, 40, "R1");
      const r2 = add(net, "router", 500, 40, "R2");
      const s1 = add(net, "switch", 160, 220, "S-BAT-A");
      const s2 = add(net, "switch", 500, 220, "S-BAT-B");
      const a = add(net, "pc", 160, 400, "PC-A");
      const b = add(net, "pc", 500, 400, "PC-B");
      cable(net, r1, G("0/0/0"), s1, G("0/1"));
      cable(net, r1, G("0/0/2"), r2, G("0/0/2"));
      cable(net, r2, G("0/0/0"), s2, G("0/1"));
      cable(net, s1, F("0/1"), a, F("0"));
      cable(net, s2, F("0/1"), b, F("0"));
      conf(net, r1, `interface g0/0/0
ip address 192.168.11.1 255.255.255.0
no shutdown
interface g0/0/2
ip address 10.1.1.1 255.255.255.252
no shutdown
exit
ip dhcp excluded-address 192.168.11.1 192.168.11.9
ip dhcp excluded-address 192.168.22.1 192.168.22.9
ip dhcp pool BAT-A
network 192.168.11.0 255.255.255.0
default-router 192.168.11.1
ip dhcp pool BAT-B
network 192.168.22.0 255.255.255.0
default-router 192.168.22.254`); // pannes : pas de route vers 192.168.22.0, passerelle fausse
      conf(net, r2, `interface g0/0/2
ip address 10.1.1.2 255.255.255.252
no shutdown
interface g0/0/0
ip address 192.168.22.1 255.255.255.0
no shutdown
exit
ip route 192.168.11.0 255.255.255.0 10.1.1.1`); // panne : pas de relais
      return { r1, r2, a, b };
    },
    steps: [
      { title: "La demande traverse-t-elle R2 ?", body: "Sur R2, l'interface du bâtiment B relaie-t-elle les demandes vers le serveur ?", checks: (d) => [ck.show(d.r2, "show running-config", "^interface GigabitEthernet0/0/0\\n(?: .*\\n)*? ip helper-address 10\\.1\\.1\\.1", "R2 relaie le DHCP vers 10.1.1.1")] },
      { title: "La réponse peut-elle revenir ?", body: "Sur R1, `show ip route` : le serveur connaît-il le réseau 192.168.22.0 ?", checks: (d) => [ck.route(d.r1, "192.168.22.0", M24)] },
      { title: "Le contenu du pool", body: "Relisez le pool BAT-B : la passerelle donnée aux postes est-elle la bonne ?", checks: (d) => [ck.show(d.r1, "show running-config", "^ip dhcp pool BAT-B\\n(?: .*\\n)*? default-router 192\\.168\\.22\\.1$", "Le pool BAT-B donne la passerelle 192.168.22.1")] },
      { title: "Vérifier la réparation", body: "Sur PC-B : « Obtenir par DHCP », puis `ping 192.168.11.1`.", checks: (d) => [ck.dhcp(d.b, "192.168.22.0", M24), ck.gw(d.b, "192.168.22.1"), ck.ping(d.b, "192.168.11.1")] },
    ],
  },

  // ---------------------------------------------------------------- D5
  {
    slug: "depannage-05-ospf",
    title: "Dépannage : OSPF ne voit pas tous ses voisins",
    level: "CCNA 3",
    category: "Dépannage",
    difficulty: "Avancé",
    minutes: 55,
    summary: "Interface passive au mauvais endroit, réseau mal annoncé, LAN oublié : rétablissez la convergence OSPF.",
    context:
      "Chez l'opérateur fictif SahelNet, trois routeurs en triangle font tourner OSPF. Depuis une mise à jour des configurations, certaines routes ont disparu et le site de Kandi (R3) est injoignable.",
    objectives: ["Lister les voisins de chaque routeur", "Corriger les trois pannes OSPF", "Retrouver toutes les routes et la connectivité"],
    addressing: [
      { device: "R1", iface: "G0/0/0 · G0/0/1 · G0/0/2", ip: "172.16.1.1 · 10.0.12.1 · 10.0.13.1", mask: "/24 · /30 · /30", gw: "RID 1.1.1.1" },
      { device: "R2", iface: "G0/0/0 · G0/0/1 · G0/0/2", ip: "172.16.2.1 · 10.0.12.2 · 10.0.23.1", mask: "/24 · /30 · /30", gw: "RID 2.2.2.2" },
      { device: "R3", iface: "G0/0/0 · G0/0/1 · G0/0/2", ip: "172.16.3.1 · 10.0.13.2 · 10.0.23.2", mask: "/24 · /30 · /30", gw: "RID 3.3.3.3" },
    ],
    tips: [...METHODE, "Une interface passive n'établit aucun voisinage : seulement sur les LAN.", "network 10.0.23.0 0.0.0.0 ne correspond qu'à l'adresse 10.0.23.0 elle-même…", "« show ip protocols » liste les réseaux annoncés et les interfaces passives."],
    commands: [cmd("show ip ospf neighbor", "Voisins OSPF"), cmd("show ip protocols", "Réseaux et interfaces passives"), cmd("show ip route ospf", "Routes OSPF"), cmd("no passive-interface <if>", "Réactiver une interface OSPF")],
    build(net) {
      const r1 = add(net, "router", 330, 30, "R1");
      const r2 = add(net, "router", 120, 280, "R2");
      const r3 = add(net, "router", 540, 280, "R3");
      const p2 = add(net, "pc", 120, 460, "PC-PARAKOU");
      const p3 = add(net, "pc", 540, 460, "PC-KANDI");
      const p1 = add(net, "pc", 560, 30, "PC-COTONOU");
      cable(net, r1, G("0/0/1"), r2, G("0/0/1"));
      cable(net, r1, G("0/0/2"), r3, G("0/0/1"));
      cable(net, r2, G("0/0/2"), r3, G("0/0/2"));
      cable(net, r1, G("0/0/0"), p1, F("0"));
      cable(net, r2, G("0/0/0"), p2, F("0"));
      cable(net, r3, G("0/0/0"), p3, F("0"));
      host(p1, "172.16.1.10", M24, "172.16.1.1");
      host(p2, "172.16.2.10", M24, "172.16.2.1");
      host(p3, "172.16.3.10", M24, "172.16.3.1");
      const ifs = (lan: string, a: string, b: string) => `interface g0/0/0
ip address ${lan} 255.255.255.0
no shutdown
interface g0/0/1
ip address ${a} 255.255.255.252
no shutdown
interface g0/0/2
ip address ${b} 255.255.255.252
no shutdown
exit`;
      conf(net, r1, `${ifs("172.16.1.1", "10.0.12.1", "10.0.13.1")}
router ospf 1
router-id 1.1.1.1
network 172.16.1.0 0.0.0.255 area 0
network 10.0.12.0 0.0.0.3 area 0
network 10.0.13.0 0.0.0.3 area 0
passive-interface g0/0/0`);
      conf(net, r2, `${ifs("172.16.2.1", "10.0.12.2", "10.0.23.1")}
router ospf 1
router-id 2.2.2.2
network 172.16.2.0 0.0.0.255 area 0
network 10.0.12.0 0.0.0.3 area 0
network 10.0.23.0 0.0.0.3 area 0
passive-interface g0/0/0
passive-interface g0/0/1`); // panne 1 : lien vers R1 passif
      conf(net, r3, `${ifs("172.16.3.1", "10.0.13.2", "10.0.23.2")}
router ospf 1
router-id 3.3.3.3
network 10.0.13.0 0.0.0.3 area 0
network 10.0.23.0 0.0.0.0 area 0
passive-interface g0/0/0`); // pannes 2 et 3 : masque générique faux, LAN non annoncé
      return { r1, r2, r3, p2, p3, p1 };
    },
    steps: [
      { title: "Le voisinage R1 – R2", body: "Sur R1 et R2 : `show ip ospf neighbor`. Puis cherchez sur R2 pourquoi le lien G0/0/1 ne forme aucun voisinage (`show ip protocols`).", checks: (d) => [ck.show(d.r1, "show ip ospf neighbor", "2\\.2\\.2\\.2", "R1 et R2 sont voisins OSPF")] },
      { title: "Le voisinage R2 – R3", body: "Relisez les commandes `network` de R3 : couvrent-elles vraiment l'adresse 10.0.23.2 ?", checks: (d) => [ck.show(d.r2, "show ip ospf neighbor", "3\\.3\\.3\\.3", "R2 et R3 sont voisins OSPF")] },
      { title: "Le LAN de Kandi", body: "Les autres routeurs apprennent-ils 172.16.3.0/24 ? Sinon, qu'a-t-on oublié sur R3 ?", checks: (d) => [ck.route(d.r1, "172.16.3.0", M24), ck.route(d.r2, "172.16.3.0", M24)] },
      { title: "Vérifier la réparation", body: "PC-PARAKOU → `ping 172.16.3.10` et `ping 172.16.1.10`.", checks: (d) => [ck.ping(d.p2, "172.16.3.10"), ck.ping(d.p2, "172.16.1.10")] },
    ],
  },

  // ---------------------------------------------------------------- D6
  {
    slug: "depannage-06-nat-acl",
    title: "Dépannage : plus d'accès à Internet",
    level: "CCNA 3",
    category: "Dépannage",
    difficulty: "Avancé",
    minutes: 45,
    summary: "NAT inversé, ACL de traduction fausse et filtrage trop strict : rendez Internet aux employés.",
    context:
      "La startup fictive Zémidjan Tech n'a plus Internet depuis qu'un stagiaire a « sécurisé » le routeur R1. Le fournisseur (R-FAI, loopback 8.8.8.8) confirme que la liaison fonctionne.",
    objectives: ["Vérifier les rôles inside / outside", "Vérifier la liste des adresses traduites", "Vérifier le filtrage", "Rétablir l'accès à Internet"],
    addressing: [
      { device: "R1", iface: "G0/0/0 (LAN, inside)", ip: "192.168.1.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/2 (FAI, outside)", ip: "203.0.113.2", mask: M30, gw: "" },
      { device: "R-FAI", iface: "G0/0/2", ip: "203.0.113.1", mask: M30, gw: "Loopback 8.8.8.8" },
      { device: "PC-DEV", iface: "NIC", ip: "192.168.1.10", mask: M24, gw: "192.168.1.1" },
    ],
    tips: [...METHODE, "« show ip nat translations » vide après un ping : la traduction n'a pas lieu.", "« show access-lists » montre les compteurs : une ligne qui « matche » tout peut bloquer le trafic.", "Pour retirer une ACL d'une interface : no ip access-group <nom> in"],
    commands: [cmd("show ip nat translations", "Traductions en cours"), cmd("show access-lists", "ACL et compteurs"), cmd("show running-config", "Rôles NAT et ACL appliquées"), cmd("no ip access-group <nom> in", "Retirer une ACL d'une interface")],
    build(net) {
      const fai = add(net, "router", 560, 40, "R-FAI");
      const r1 = add(net, "router", 300, 40, "R1");
      const s1 = add(net, "switch", 300, 220, "S1");
      const pc = add(net, "pc", 300, 400, "PC-DEV");
      cable(net, r1, G("0/0/2"), fai, G("0/0/2"));
      cable(net, r1, G("0/0/0"), s1, G("0/1"));
      cable(net, s1, F("0/1"), pc, F("0"));
      host(pc, "192.168.1.10", M24, "192.168.1.1");
      conf(net, fai, `interface g0/0/2
ip address 203.0.113.1 255.255.255.252
no shutdown
interface loopback 0
ip address 8.8.8.8 255.255.255.255`);
      conf(net, r1, `interface g0/0/0
ip address 192.168.1.1 255.255.255.0
ip nat outside
no shutdown
interface g0/0/2
ip address 203.0.113.2 255.255.255.252
ip nat inside
no shutdown
exit
ip route 0.0.0.0 0.0.0.0 203.0.113.1
access-list 1 permit 192.168.10.0 0.0.0.255
ip nat inside source list 1 interface g0/0/2 overload
ip access-list extended SECURITE
deny icmp any any
permit tcp any any eq 80
exit
interface g0/0/0
ip access-group SECURITE in`); // pannes : rôles NAT inversés, ACL 1 sur le mauvais réseau, ACL trop stricte
      return { r1, pc };
    },
    steps: [
      { title: "Les rôles NAT", body: "Dans `show running-config`, quelle interface est « inside », laquelle est « outside » ? Comparez avec la table.", checks: (d) => [ck.show(d.r1, "show running-config", "^interface GigabitEthernet0/0/0\\n(?: .*\\n)*? ip nat inside", "G0/0/0 (LAN) est inside"), ck.show(d.r1, "show running-config", "^interface GigabitEthernet0/0/2\\n(?: .*\\n)*? ip nat outside", "G0/0/2 (FAI) est outside")] },
      { title: "Les adresses à traduire", body: "L'ACL 1 désigne les adresses traduites par le PAT. Correspond-elle au réseau du LAN ?", checks: (d) => [ck.show(d.r1, "show access-lists", "Standard IP access list 1\\n(?:\\s+.*\\n)*?\\s+\\d+ permit 192\\.168\\.1\\.0, wildcard bits 0\\.0\\.0\\.255", "L'ACL 1 autorise 192.168.1.0/24")] },
      { title: "Le filtrage", body: "L'ACL SECURITE est appliquée en entrée du LAN. Que laisse-t-elle passer ? Retirez-la ou corrigez-la pour que les employés retrouvent Internet.", checks: (d) => [ck.ping(d.pc, "203.0.113.1")] },
      { title: "Vérifier la réparation", body: "PC-DEV → `ping 8.8.8.8`, puis `show ip nat translations` sur R1.", checks: (d) => [ck.ping(d.pc, "8.8.8.8"), ck.tcp(d.pc, "8.8.8.8", 22, true)] },
    ],
  },
];

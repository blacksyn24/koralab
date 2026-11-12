import { F, G, M24, M30, add, cable, ck, host, type CatalogSpec } from "./base";

const cmd = (c: string, desc: string) => ({ cmd: c, desc });

export const CCNA2: CatalogSpec[] = [
  // ---------------------------------------------------------------- 6
  {
    slug: "ccna2-01-vlan-trunk",
    title: "VLAN et trunks 802.1Q entre deux switchs",
    level: "CCNA 2",
    category: "Commutation",
    difficulty: "Débutant",
    minutes: 45,
    summary: "Créer des VLAN nommés, affecter les ports et transporter les VLAN sur un trunk avec VLAN natif dédié.",
    context:
      "Le cabinet Adjovi Conseil (fictif, Cotonou) occupe deux étages. Les commerciaux et la comptabilité sont répartis sur les deux étages mais doivent rester isolés. Un switch par étage, reliés par un trunk.",
    objectives: ["Créer les VLAN 10, 20 et 99 avec leur nom", "Affecter les ports d'accès", "Configurer le trunk et le VLAN natif 99", "Vérifier l'isolement et la communication dans chaque VLAN"],
    addressing: [
      { device: "PC-VENTE1", iface: "S1 Fa0/1 · VLAN 10", ip: "192.168.10.11", mask: M24, gw: "" },
      { device: "PC-COMPTA1", iface: "S1 Fa0/2 · VLAN 20", ip: "192.168.20.11", mask: M24, gw: "" },
      { device: "PC-VENTE2", iface: "S2 Fa0/1 · VLAN 10", ip: "192.168.10.12", mask: M24, gw: "" },
      { device: "PC-COMPTA2", iface: "S2 Fa0/2 · VLAN 20", ip: "192.168.20.12", mask: M24, gw: "" },
    ],
    tips: ["Les VLAN doivent exister sur les deux switchs, sinon le trunk ne les transporte pas.", "Le VLAN natif doit être le même aux deux bouts du trunk.", "« show vlan brief » et « show interfaces trunk » sont vos meilleurs amis."],
    commands: [
      cmd("vlan 10 → name VENTES", "Créer et nommer un VLAN"),
      cmd("interface f0/1 → switchport mode access", "Port d'accès"),
      cmd("switchport access vlan 10", "Affecter le port au VLAN"),
      cmd("interface g0/1 → switchport mode trunk", "Port trunk"),
      cmd("switchport trunk native vlan 99", "VLAN natif du trunk"),
      cmd("show vlan brief", "VLAN et ports"),
      cmd("show interfaces trunk", "État des trunks"),
    ],
    build(net) {
      const s1 = add(net, "switch", 160, 80, "S1-ETAGE1");
      const s2 = add(net, "switch", 520, 80, "S2-ETAGE2");
      const v1 = add(net, "pc", 60, 280, "PC-VENTE1");
      const c1 = add(net, "pc", 260, 280, "PC-COMPTA1");
      const v2 = add(net, "pc", 420, 280, "PC-VENTE2");
      const c2 = add(net, "pc", 620, 280, "PC-COMPTA2");
      cable(net, s1, G("0/1"), s2, G("0/1"));
      cable(net, s1, F("0/1"), v1, F("0"));
      cable(net, s1, F("0/2"), c1, F("0"));
      cable(net, s2, F("0/1"), v2, F("0"));
      cable(net, s2, F("0/2"), c2, F("0"));
      host(v1, "192.168.10.11", M24);
      host(c1, "192.168.20.11", M24);
      host(v2, "192.168.10.12", M24);
      host(c2, "192.168.20.12", M24);
      return { s1, s2, v1, c1, v2, c2 };
    },
    steps: [
      {
        title: "Créer les VLAN",
        body: "Sur S1-ETAGE1 et S2-ETAGE2 :\n• `vlan 10` → `name VENTES`\n• `vlan 20` → `name COMPTA`\n• `vlan 99` → `name GESTION`",
        checks: (d) => [ck.vlan(d.s1, 10, "VENTES"), ck.vlan(d.s1, 20, "COMPTA"), ck.vlan(d.s1, 99, "GESTION"), ck.vlan(d.s2, 10, "VENTES"), ck.vlan(d.s2, 20, "COMPTA"), ck.vlan(d.s2, 99, "GESTION")],
      },
      {
        title: "Affecter les ports d'accès",
        body: "Sur chaque switch :\n• `Fa0/1` : `switchport mode access`, `switchport access vlan 10`\n• `Fa0/2` : `switchport mode access`, `switchport access vlan 20`",
        checks: (d) => [ck.access(d.s1, F("0/1"), 10), ck.access(d.s1, F("0/2"), 20), ck.access(d.s2, F("0/1"), 10), ck.access(d.s2, F("0/2"), 20)],
      },
      {
        title: "Configurer le trunk",
        body: "Sur `G0/1` des deux switchs : `switchport mode trunk`, puis `switchport trunk native vlan 99`. Vérifiez avec `show interfaces trunk`.",
        checks: (d) => [
          ck.trunk(d.s1, G("0/1")),
          ck.trunk(d.s2, G("0/1")),
          ck.show(d.s1, "show interfaces trunk", "Gi0/1\\s+\\S+\\s+802\\.1q\\s+trunking\\s+99", "Le trunk de S1 utilise le VLAN natif 99"),
          ck.show(d.s2, "show interfaces trunk", "Gi0/1\\s+\\S+\\s+802\\.1q\\s+trunking\\s+99", "Le trunk de S2 utilise le VLAN natif 99"),
        ],
      },
      {
        title: "Vérifier",
        body: "1. PC-VENTE1 doit joindre PC-VENTE2 (`ping 192.168.10.12`).\n2. PC-COMPTA1 doit joindre PC-COMPTA2 (`ping 192.168.20.12`).\n3. Sans routeur, les deux VLAN restent isolés.",
        checks: (d) => [ck.ping(d.v1, "192.168.10.12"), ck.ping(d.c1, "192.168.20.12")],
      },
    ],
  },

  // ---------------------------------------------------------------- 7
  {
    slug: "ccna2-02-router-on-a-stick",
    title: "Routage inter-VLAN : router-on-a-stick",
    level: "CCNA 2",
    category: "Commutation",
    difficulty: "Intermédiaire",
    minutes: 55,
    summary: "Sous-interfaces 802.1Q sur un routeur pour faire communiquer trois VLAN, avec un VLAN de gestion.",
    context:
      "Le lycée technique fictif LT-Parakou a séparé Administration (VLAN 10), Enseignants (VLAN 20) et Gestion des équipements (VLAN 99). Les VLAN existent, mais rien ne communique entre eux : il faut un routeur « sur un bâton ».",
    objectives: ["Créer les VLAN et les ports d'accès", "Configurer le trunk vers le routeur", "Créer les sous-interfaces 802.1Q", "Vérifier le routage entre VLAN"],
    addressing: [
      { device: "R1", iface: "G0/0/1.10", ip: "192.168.10.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/1.20", ip: "192.168.20.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/1.99", ip: "192.168.99.1", mask: M24, gw: "" },
      { device: "S1", iface: "VLAN 99", ip: "192.168.99.2", mask: M24, gw: "192.168.99.1" },
      { device: "PC-ADM", iface: "Fa0/1 · VLAN 10", ip: "192.168.10.10", mask: M24, gw: "192.168.10.1" },
      { device: "PC-PROF", iface: "Fa0/2 · VLAN 20", ip: "192.168.20.10", mask: M24, gw: "192.168.20.1" },
    ],
    tips: ["L'interface physique G0/0/1 n'a pas d'adresse, mais elle doit être activée (no shutdown).", "Chaque sous-interface doit avoir « encapsulation dot1Q <vlan> » avant son adresse IP.", "Le port du switch vers le routeur est un trunk."],
    commands: [
      cmd("interface g0/0/1 → no shutdown", "Activer l'interface physique"),
      cmd("interface g0/0/1.10", "Créer une sous-interface"),
      cmd("encapsulation dot1Q 10", "VLAN de la sous-interface"),
      cmd("ip address 192.168.10.1 255.255.255.0", "Passerelle du VLAN"),
      cmd("show ip interface brief", "Vérifier les sous-interfaces"),
    ],
    build(net) {
      const r1 = add(net, "router", 300, 30, "R1");
      const s1 = add(net, "switch", 300, 210, "S1");
      const a = add(net, "pc", 140, 390, "PC-ADM");
      const p = add(net, "pc", 460, 390, "PC-PROF");
      cable(net, r1, G("0/0/1"), s1, G("0/1"));
      cable(net, s1, F("0/1"), a, F("0"));
      cable(net, s1, F("0/2"), p, F("0"));
      return { r1, s1, a, p };
    },
    steps: [
      {
        title: "VLAN et ports d'accès sur S1",
        body: "1. Créez `vlan 10` (ADMIN), `vlan 20` (ENSEIGNANTS) et `vlan 99` (GESTION).\n2. `Fa0/1` en accès VLAN 10, `Fa0/2` en accès VLAN 20.",
        checks: (d) => [ck.vlan(d.s1, 10), ck.vlan(d.s1, 20), ck.vlan(d.s1, 99), ck.access(d.s1, F("0/1"), 10), ck.access(d.s1, F("0/2"), 20)],
      },
      {
        title: "Trunk et gestion du switch",
        body: "1. `G0/1` (vers R1) : `switchport mode trunk`.\n2. `interface vlan 99` : `192.168.99.2 255.255.255.0`, `no shutdown`.\n3. `ip default-gateway 192.168.99.1`.",
        checks: (d) => [ck.trunk(d.s1, G("0/1")), ck.ip(d.s1, "Vlan99", "192.168.99.2", M24), ck.show(d.s1, "show running-config", "^ip default-gateway 192\\.168\\.99\\.1", "S1 a pour passerelle 192.168.99.1")],
      },
      {
        title: "Sous-interfaces sur R1",
        body: "1. `interface g0/0/1` → `no shutdown`.\n2. `interface g0/0/1.10` → `encapsulation dot1Q 10` → `ip address 192.168.10.1 255.255.255.0`.\n3. Même chose pour `.20` (`192.168.20.1`) et `.99` (`192.168.99.1`).",
        checks: (d) => [ck.ip(d.r1, G("0/0/1.10"), "192.168.10.1", M24), ck.ip(d.r1, G("0/0/1.20"), "192.168.20.1", M24), ck.ip(d.r1, G("0/0/1.99"), "192.168.99.1", M24), ck.up(d.r1, G("0/0/1"))],
      },
      {
        title: "Configurer les postes",
        body: "PC-ADM : `192.168.10.10/24`, passerelle `192.168.10.1`.\nPC-PROF : `192.168.20.10/24`, passerelle `192.168.20.1`.",
        checks: (d) => [ck.ip(d.a, F("0"), "192.168.10.10", M24), ck.gw(d.a, "192.168.10.1"), ck.ip(d.p, F("0"), "192.168.20.10", M24), ck.gw(d.p, "192.168.20.1")],
      },
      {
        title: "Vérifier le routage inter-VLAN",
        body: "Depuis PC-ADM : `ping 192.168.20.10`, puis `ping 192.168.99.2` (le switch).",
        checks: (d) => [ck.ping(d.a, "192.168.20.10"), ck.ping(d.a, "192.168.99.2"), ck.ping(d.p, "192.168.10.10")],
      },
    ],
  },

  // ---------------------------------------------------------------- 8
  {
    slug: "ccna2-03-switch-couche3",
    title: "Routage inter-VLAN avec un switch de couche 3",
    level: "CCNA 2",
    category: "Routage",
    difficulty: "Intermédiaire",
    minutes: 60,
    summary: "SVI, ip routing, port routé vers le routeur d'accès et route par défaut.",
    context:
      "La banque fictive CrediSahel remplace son router-on-a-stick par un switch de couche 3 au cœur du réseau, plus rapide. Le routeur R1 reste en bordure vers « Internet » (sa loopback 8.8.8.8 simule un serveur public).",
    objectives: ["Créer les VLAN et les SVI sur le switch de couche 3", "Activer le routage IP", "Relier le cœur au routeur par un port routé", "Router vers l'extérieur dans les deux sens"],
    addressing: [
      { device: "MS1", iface: "VLAN 10", ip: "10.10.10.1", mask: M24, gw: "" },
      { device: "MS1", iface: "VLAN 20", ip: "10.10.20.1", mask: M24, gw: "" },
      { device: "MS1", iface: "G1/1/1 (routé)", ip: "10.0.0.2", mask: M30, gw: "" },
      { device: "R1", iface: "G0/0/0", ip: "10.0.0.1", mask: M30, gw: "" },
      { device: "R1", iface: "Loopback0", ip: "8.8.8.8", mask: "255.255.255.255", gw: "" },
      { device: "PC-AGENCE", iface: "S1 Fa0/1 · VLAN 10", ip: "10.10.10.10", mask: M24, gw: "10.10.10.1" },
      { device: "PC-CREDIT", iface: "S1 Fa0/2 · VLAN 20", ip: "10.10.20.10", mask: M24, gw: "10.10.20.1" },
    ],
    tips: ["Sans « ip routing », un switch de couche 3 ne route pas.", "« no switchport » transforme un port de switch en port routé.", "R1 doit savoir revenir vers 10.10.0.0/16 : ajoutez-lui une route statique."],
    commands: [
      cmd("ip routing", "Activer le routage sur le switch"),
      cmd("interface vlan 10 → ip address …", "SVI : passerelle d'un VLAN"),
      cmd("interface g1/1/1 → no switchport", "Port routé"),
      cmd("ip route 0.0.0.0 0.0.0.0 10.0.0.1", "Route par défaut du cœur"),
      cmd("ip route 10.10.0.0 255.255.0.0 10.0.0.2", "Route de retour sur R1"),
      cmd("show ip route", "Table de routage"),
    ],
    build(net) {
      const r1 = add(net, "router", 300, 20, "R1");
      const ms = add(net, "l3switch", 300, 180, "MS1");
      const s1 = add(net, "switch", 300, 330, "S1");
      const a = add(net, "pc", 160, 480, "PC-AGENCE");
      const c = add(net, "pc", 440, 480, "PC-CREDIT");
      cable(net, r1, G("0/0/0"), ms, G("1/1/1"));
      cable(net, ms, G("1/0/1"), s1, G("0/1"));
      cable(net, s1, F("0/1"), a, F("0"));
      cable(net, s1, F("0/2"), c, F("0"));
      host(a, "10.10.10.10", M24, "10.10.10.1");
      host(c, "10.10.20.10", M24, "10.10.20.1");
      return { r1, ms, s1, a, c };
    },
    steps: [
      {
        title: "VLAN sur S1 et MS1",
        body: "1. Sur S1 et MS1 : créez `vlan 10` (AGENCE) et `vlan 20` (CREDIT).\n2. S1 : `Fa0/1` en accès VLAN 10, `Fa0/2` en accès VLAN 20, `G0/1` en trunk.\n3. MS1 : `G1/0/1` en trunk (`switchport mode trunk`).",
        checks: (d) => [ck.vlan(d.ms, 10), ck.vlan(d.ms, 20), ck.access(d.s1, F("0/1"), 10), ck.access(d.s1, F("0/2"), 20), ck.trunk(d.s1, G("0/1")), ck.trunk(d.ms, G("1/0/1"))],
      },
      {
        title: "SVI et routage sur MS1",
        body: "1. `ip routing`.\n2. `interface vlan 10` → `ip address 10.10.10.1 255.255.255.0` → `no shutdown`.\n3. `interface vlan 20` → `ip address 10.10.20.1 255.255.255.0` → `no shutdown`.",
        checks: (d) => [ck.show(d.ms, "show running-config", "^ip routing", "MS1 route les paquets (ip routing)"), ck.ip(d.ms, "Vlan10", "10.10.10.1", M24), ck.ip(d.ms, "Vlan20", "10.10.20.1", M24), ck.ping(d.a, "10.10.20.10")],
      },
      {
        title: "Liaison routée vers R1",
        body: "1. MS1 `G1/1/1` : `no switchport`, `ip address 10.0.0.2 255.255.255.252`.\n2. R1 `G0/0/0` : `ip address 10.0.0.1 255.255.255.252`, `no shutdown`.\n3. R1 : `interface loopback 0` → `ip address 8.8.8.8 255.255.255.255`.",
        checks: (d) => [ck.ip(d.ms, G("1/1/1"), "10.0.0.2", M30), ck.ip(d.r1, G("0/0/0"), "10.0.0.1", M30), ck.ip(d.r1, "Loopback0", "8.8.8.8", "255.255.255.255")],
      },
      {
        title: "Routes et vérification",
        body: "1. MS1 : `ip route 0.0.0.0 0.0.0.0 10.0.0.1`.\n2. R1 : `ip route 10.10.0.0 255.255.0.0 10.0.0.2`.\n3. Depuis PC-AGENCE : `ping 8.8.8.8`.",
        checks: (d) => [ck.route(d.ms, "0.0.0.0", "0.0.0.0"), ck.route(d.r1, "10.10.0.0", "255.255.0.0"), ck.ping(d.a, "8.8.8.8"), ck.ping(d.c, "8.8.8.8")],
      },
    ],
  },

  // ---------------------------------------------------------------- 9
  {
    slug: "ccna2-04-spanning-tree",
    title: "Spanning Tree : pont racine, Rapid PVST+, PortFast et BPDU Guard",
    level: "CCNA 2",
    category: "Commutation",
    difficulty: "Intermédiaire",
    minutes: 50,
    summary: "Maîtriser l'élection du pont racine dans une boucle de trois switchs et protéger les ports d'accès.",
    context:
      "Chez Ouidah Textiles (fictive), trois switchs forment une boucle pour la redondance. Aujourd'hui, c'est le switch le plus ancien qui est élu racine… Vous devez choisir la racine, accélérer la convergence et protéger les ports des postes.",
    objectives: ["Passer en Rapid PVST+", "Forcer S1 comme racine principale et S2 comme secondaire", "Activer PortFast et BPDU Guard sur les ports d'accès", "Vérifier que le réseau fonctionne malgré la boucle"],
    addressing: [
      { device: "PC1", iface: "S2 Fa0/1", ip: "192.168.1.11", mask: M24, gw: "" },
      { device: "PC2", iface: "S3 Fa0/1", ip: "192.168.1.12", mask: M24, gw: "" },
    ],
    tips: ["« spanning-tree vlan 1 root primary » fixe une priorité plus basse que celle des autres switchs.", "PortFast seulement sur les ports reliés à des postes, jamais entre switchs.", "« show spanning-tree » indique « This bridge is the root » sur la racine."],
    commands: [
      cmd("spanning-tree mode rapid-pvst", "Rapid PVST+"),
      cmd("spanning-tree vlan 1 root primary", "Devenir la racine"),
      cmd("spanning-tree vlan 1 root secondary", "Racine de secours"),
      cmd("spanning-tree portfast", "Port d'accès immédiatement actif"),
      cmd("spanning-tree bpduguard enable", "Couper le port s'il reçoit des BPDU"),
      cmd("show spanning-tree", "État du Spanning Tree"),
    ],
    build(net) {
      const s1 = add(net, "switch", 300, 40, "S1");
      const s2 = add(net, "switch", 120, 240, "S2");
      const s3 = add(net, "switch", 480, 240, "S3");
      const p1 = add(net, "pc", 120, 420, "PC1");
      const p2 = add(net, "pc", 480, 420, "PC2");
      cable(net, s1, G("0/1"), s2, G("0/1"));
      cable(net, s1, G("0/2"), s3, G("0/1"));
      cable(net, s2, G("0/2"), s3, G("0/2"));
      cable(net, s2, F("0/1"), p1, F("0"));
      cable(net, s3, F("0/1"), p2, F("0"));
      host(p1, "192.168.1.11", M24);
      host(p2, "192.168.1.12", M24);
      return { s1, s2, s3, p1, p2 };
    },
    steps: [
      {
        title: "Passer en Rapid PVST+",
        body: "Sur les trois switchs : `spanning-tree mode rapid-pvst`.",
        checks: (d) => [d.s1, d.s2, d.s3].map((s) => ck.show(s, "show running-config", "^spanning-tree mode rapid-pvst", `${s.hostname} utilise Rapid PVST+`)),
      },
      {
        title: "Choisir la racine",
        body: "1. Sur S1 : `spanning-tree vlan 1 root primary`.\n2. Sur S2 : `spanning-tree vlan 1 root secondary`.\n3. Vérifiez sur S1 avec `show spanning-tree vlan 1`.",
        checks: (d) => [
          ck.show(d.s1, "show spanning-tree vlan 1", "This bridge is the root", "S1 est le pont racine du VLAN 1"),
          ck.show(d.s2, "show running-config", "^spanning-tree vlan 1 priority 28672", "S2 est la racine secondaire (priorité 28672)"),
        ],
      },
      {
        title: "Protéger les ports d'accès",
        body: "Sur `Fa0/1` de S2 et de S3 : `spanning-tree portfast` et `spanning-tree bpduguard enable`.",
        checks: (d) => [
          ck.show(d.s2, "show running-config", "^interface FastEthernet0/1\\n(?: .*\\n)*? spanning-tree portfast", "PortFast sur S2 Fa0/1"),
          ck.show(d.s2, "show running-config", "^interface FastEthernet0/1\\n(?: .*\\n)*? spanning-tree bpduguard enable", "BPDU Guard sur S2 Fa0/1"),
          ck.show(d.s3, "show running-config", "^interface FastEthernet0/1\\n(?: .*\\n)*? spanning-tree portfast", "PortFast sur S3 Fa0/1"),
          ck.show(d.s3, "show running-config", "^interface FastEthernet0/1\\n(?: .*\\n)*? spanning-tree bpduguard enable", "BPDU Guard sur S3 Fa0/1"),
        ],
      },
      {
        title: "Vérifier",
        body: "1. `show spanning-tree` sur S3 : un des ports vers S2 ou S1 est bloqué (rôle « Altn »).\n2. PC1 doit toujours joindre PC2 : `ping 192.168.1.12`.",
        checks: (d) => [ck.ping(d.p1, "192.168.1.12"), ck.show(d.s3, "show spanning-tree vlan 1", "Altn\\s+BLK", "Un port est bloqué pour casser la boucle")],
      },
    ],
  },

  // ---------------------------------------------------------------- 10
  {
    slug: "ccna2-05-etherchannel",
    title: "Agrégation de liens EtherChannel (LACP et PAgP)",
    level: "CCNA 2",
    category: "Commutation",
    difficulty: "Intermédiaire",
    minutes: 50,
    summary: "Regrouper plusieurs liens physiques en un seul lien logique trunk, avec LACP puis PAgP.",
    context:
      "Le data center fictif de BéninCloud manque de bande passante entre ses switchs. Les liens doublés sont bloqués par le Spanning Tree : il faut les agréger.",
    objectives: ["Créer un EtherChannel LACP entre S1 et S2", "Créer un EtherChannel PAgP entre S2 et S3", "Passer les Port-channel en trunk", "Vérifier l'agrégation et la connectivité"],
    addressing: [
      { device: "PC1", iface: "S1 Fa0/1", ip: "192.168.5.11", mask: M24, gw: "" },
      { device: "PC2", iface: "S3 Fa0/1", ip: "192.168.5.12", mask: M24, gw: "" },
    ],
    tips: ["Configurez les ports membres avec « interface range » pour aller plus vite.", "LACP : modes active/passive. PAgP : modes desirable/auto.", "Le trunk se configure sur l'interface Port-channel, pas sur les ports membres."],
    commands: [
      cmd("interface range g0/1 - 2", "Sélectionner les ports membres"),
      cmd("channel-group 1 mode active", "EtherChannel LACP"),
      cmd("channel-group 2 mode desirable", "EtherChannel PAgP"),
      cmd("interface port-channel 1 → switchport mode trunk", "Trunk sur l'agrégat"),
      cmd("show etherchannel summary", "État des agrégats"),
    ],
    build(net) {
      const s1 = add(net, "switch", 100, 60, "S1");
      const s2 = add(net, "switch", 340, 60, "S2");
      const s3 = add(net, "switch", 580, 60, "S3");
      const p1 = add(net, "pc", 100, 260, "PC1");
      const p2 = add(net, "pc", 580, 260, "PC2");
      cable(net, s1, G("0/1"), s2, G("0/1"));
      cable(net, s1, G("0/2"), s2, G("0/2"));
      cable(net, s2, F("0/23"), s3, F("0/23"));
      cable(net, s2, F("0/24"), s3, F("0/24"));
      cable(net, s1, F("0/1"), p1, F("0"));
      cable(net, s3, F("0/1"), p2, F("0"));
      host(p1, "192.168.5.11", M24);
      host(p2, "192.168.5.12", M24);
      return { s1, s2, s3, p1, p2 };
    },
    steps: [
      {
        title: "EtherChannel LACP entre S1 et S2",
        body: "Sur S1 et S2 : `interface range g0/1 - 2` → `channel-group 1 mode active`.",
        checks: (d) => [
          ck.show(d.s1, "show etherchannel summary", "Po1\\(SU\\)\\s+LACP", "S1 : Port-channel 1 actif en LACP"),
          ck.show(d.s2, "show etherchannel summary", "Po1\\(SU\\)\\s+LACP", "S2 : Port-channel 1 actif en LACP"),
        ],
      },
      {
        title: "EtherChannel PAgP entre S2 et S3",
        body: "Sur S2 et S3 : `interface range f0/23 - 24` → `channel-group 2 mode desirable`.",
        checks: (d) => [
          ck.show(d.s2, "show etherchannel summary", "Po2\\(SU\\)\\s+PAgP", "S2 : Port-channel 2 actif en PAgP"),
          ck.show(d.s3, "show etherchannel summary", "Po2\\(SU\\)\\s+PAgP", "S3 : Port-channel 2 actif en PAgP"),
        ],
      },
      {
        title: "Trunks sur les Port-channel",
        body: "1. S1 et S2 : `interface port-channel 1` → `switchport mode trunk`.\n2. S2 et S3 : `interface port-channel 2` → `switchport mode trunk`.\n3. Vérifiez avec `show interfaces trunk`.",
        checks: (d) => [
          ck.show(d.s1, "show interfaces trunk", "^Po1\\s+\\S+\\s+802\\.1q\\s+trunking", "S1 : Po1 est un trunk"),
          ck.show(d.s2, "show interfaces trunk", "^Po1\\s+\\S+\\s+802\\.1q\\s+trunking", "S2 : Po1 est un trunk"),
          ck.show(d.s2, "show interfaces trunk", "^Po2\\s+\\S+\\s+802\\.1q\\s+trunking", "S2 : Po2 est un trunk"),
        ],
      },
      {
        title: "Vérifier",
        body: "PC1 doit joindre PC2 à travers les deux agrégats : `ping 192.168.5.12`.",
        checks: (d) => [ck.ping(d.p1, "192.168.5.12")],
      },
    ],
  },

  // ---------------------------------------------------------------- 11
  {
    slug: "ccna2-06-dhcp-relais",
    title: "DHCPv4 : serveur sur routeur et relais",
    level: "CCNA 2",
    category: "Services IP",
    difficulty: "Intermédiaire",
    minutes: 55,
    summary: "Un routeur serveur DHCP pour deux réseaux, dont un distant joint par un relais (ip helper-address).",
    context:
      "Le groupe scolaire fictif Les Palmiers ne veut plus adresser ses postes à la main. R1 (bâtiment A) devient serveur DHCP, y compris pour le bâtiment B derrière R2.",
    objectives: ["Relier R1 et R2 et ajouter les routes", "Créer deux pools DHCP avec des adresses exclues", "Configurer le relais sur R2", "Faire obtenir une adresse aux postes"],
    addressing: [
      { device: "R1", iface: "G0/0/0", ip: "192.168.11.1", mask: M24, gw: "Bâtiment A" },
      { device: "R1", iface: "G0/0/2", ip: "10.1.1.1", mask: M30, gw: "" },
      { device: "R2", iface: "G0/0/2", ip: "10.1.1.2", mask: M30, gw: "" },
      { device: "R2", iface: "G0/0/0", ip: "192.168.22.1", mask: M24, gw: "Bâtiment B" },
      { device: "PC-A / PC-B", iface: "NIC", ip: "DHCP", mask: "", gw: "" },
    ],
    tips: ["Excluez les adresses des équipements (.1 à .9) avant de créer le pool.", "Le relais se configure sur l'interface qui reçoit les demandes des postes (côté LAN de R2).", "Le serveur doit savoir répondre vers 192.168.22.0 : R1 a besoin d'une route."],
    commands: [
      cmd("ip dhcp excluded-address 192.168.11.1 192.168.11.9", "Adresses réservées"),
      cmd("ip dhcp pool BAT-A", "Créer un pool"),
      cmd("network 192.168.11.0 255.255.255.0", "Réseau distribué"),
      cmd("default-router 192.168.11.1", "Passerelle donnée aux postes"),
      cmd("dns-server 8.8.8.8", "Serveur DNS donné aux postes"),
      cmd("ip helper-address 10.1.1.1", "Relais DHCP (sur R2)"),
      cmd("show ip dhcp binding", "Baux attribués"),
    ],
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
      return { r1, r2, a, b };
    },
    steps: [
      {
        title: "Adresser et router",
        body: "1. R1 : `G0/0/0` `192.168.11.1/24`, `G0/0/2` `10.1.1.1/30`.\n2. R2 : `G0/0/2` `10.1.1.2/30`, `G0/0/0` `192.168.22.1/24`.\n3. Activez les interfaces.\n4. R1 : `ip route 192.168.22.0 255.255.255.0 10.1.1.2` ; R2 : `ip route 192.168.11.0 255.255.255.0 10.1.1.1`.",
        checks: (d) => [ck.ip(d.r1, G("0/0/0"), "192.168.11.1", M24), ck.ip(d.r2, G("0/0/0"), "192.168.22.1", M24), ck.route(d.r1, "192.168.22.0", M24), ck.route(d.r2, "192.168.11.0", M24)],
      },
      {
        title: "Pools DHCP sur R1",
        body: "1. `ip dhcp excluded-address 192.168.11.1 192.168.11.9` et `ip dhcp excluded-address 192.168.22.1 192.168.22.9`.\n2. Pool `BAT-A` : `network 192.168.11.0 255.255.255.0`, `default-router 192.168.11.1`, `dns-server 8.8.8.8`.\n3. Pool `BAT-B` : `network 192.168.22.0 255.255.255.0`, `default-router 192.168.22.1`, `dns-server 8.8.8.8`.",
        checks: (d) => [
          ck.show(d.r1, "show running-config", "^ip dhcp excluded-address 192\\.168\\.11\\.1 192\\.168\\.11\\.9", "Adresses .1 à .9 exclues du bâtiment A"),
          ck.show(d.r1, "show running-config", "^ip dhcp pool BAT-A\\n network 192\\.168\\.11\\.0 255\\.255\\.255\\.0\\n default-router 192\\.168\\.11\\.1", "Pool BAT-A complet"),
          ck.show(d.r1, "show running-config", "^ip dhcp pool BAT-B\\n network 192\\.168\\.22\\.0 255\\.255\\.255\\.0\\n default-router 192\\.168\\.22\\.1", "Pool BAT-B complet"),
        ],
      },
      {
        title: "Relais DHCP sur R2",
        body: "Sur R2, `interface g0/0/0` → `ip helper-address 10.1.1.1`.",
        checks: (d) => [ck.show(d.r2, "show running-config", "^interface GigabitEthernet0/0/0\\n(?: .*\\n)*? ip helper-address 10\\.1\\.1\\.1", "R2 relaie le DHCP vers R1")],
      },
      {
        title: "Obtenir les adresses",
        body: "1. Sur PC-A puis PC-B, cliquez sur « Obtenir par DHCP » (ou `ipconfig /renew`).\n2. Vérifiez sur R1 avec `show ip dhcp binding`.\n3. Depuis PC-A, pinguez PC-B.",
        checks: (d) => [ck.dhcp(d.a, "192.168.11.0", M24), ck.dhcp(d.b, "192.168.22.0", M24), ck.ping(d.a, "192.168.22.1")],
      },
    ],
  },

  // ---------------------------------------------------------------- 12
  {
    slug: "ccna2-07-securite-ports",
    title: "Sécurité des ports et DHCP snooping",
    level: "CCNA 2",
    category: "Sécurité réseau",
    difficulty: "Intermédiaire",
    minutes: 50,
    summary: "Limiter les adresses MAC par port, couper les ports inutilisés et bloquer les faux serveurs DHCP.",
    context:
      "Dans une agence fictive de MoovPay, un stagiaire a branché un petit routeur Wi-Fi qui distribuait de fausses adresses. Vous durcissez le switch d'accès S1.",
    objectives: ["Activer la sécurité des ports sur les ports des postes", "Désactiver les ports inutilisés", "Activer le DHCP snooping avec le port vers le routeur en confiance", "Vérifier que les postes obtiennent toujours leur adresse"],
    addressing: [
      { device: "R1", iface: "G0/0/1", ip: "192.168.40.1", mask: M24, gw: "serveur DHCP (déjà configuré)" },
      { device: "PC1 / PC2", iface: "Fa0/1 – Fa0/2", ip: "DHCP", mask: "", gw: "" },
    ],
    tips: ["La sécurité des ports exige un port en mode access.", "« sticky » mémorise les adresses MAC apprises dans la configuration.", "Avec le DHCP snooping, seuls les ports « trust » peuvent envoyer des réponses DHCP."],
    commands: [
      cmd("switchport port-security", "Activer la sécurité du port"),
      cmd("switchport port-security maximum 2", "Nombre maximal d'adresses MAC"),
      cmd("switchport port-security mac-address sticky", "Mémoriser les adresses apprises"),
      cmd("switchport port-security violation restrict", "Bloquer les intrus sans couper le port"),
      cmd("interface range f0/3 - 24 → shutdown", "Couper les ports inutilisés"),
      cmd("ip dhcp snooping / ip dhcp snooping vlan 1", "Activer le DHCP snooping"),
      cmd("ip dhcp snooping trust", "Port de confiance (vers le serveur)"),
    ],
    build(net) {
      const r1 = add(net, "router", 300, 30, "R1");
      const s1 = add(net, "switch", 300, 200, "S1");
      const p1 = add(net, "pc", 160, 380, "PC1");
      const p2 = add(net, "pc", 440, 380, "PC2");
      cable(net, r1, G("0/0/1"), s1, G("0/1"));
      cable(net, s1, F("0/1"), p1, F("0"));
      cable(net, s1, F("0/2"), p2, F("0"));
      const i = r1.ifaces.find((x) => x.name === G("0/0/1"))!;
      i.ip = "192.168.40.1";
      i.mask = M24;
      i.adminUp = true;
      r1.dhcpExcluded = [["192.168.40.1", "192.168.40.9"]];
      r1.dhcpPools = [{ name: "AGENCE", network: "192.168.40.0", mask: M24, router: "192.168.40.1" }];
      return { r1, s1, p1, p2 };
    },
    steps: [
      {
        title: "Sécurité des ports des postes",
        body: "Sur `Fa0/1` et `Fa0/2` de S1 :\n1. `switchport mode access`\n2. `switchport port-security`\n3. `switchport port-security maximum 2`\n4. `switchport port-security mac-address sticky`\n5. `switchport port-security violation restrict`",
        checks: (d) =>
          ["0/1", "0/2"].flatMap((p) => [
            ck.show(d.s1, "show running-config", `^interface FastEthernet${p}\\n(?: .*\\n)*? switchport port-security maximum 2`, `Fa${p} : 2 adresses MAC au maximum`),
            ck.show(d.s1, "show running-config", `^interface FastEthernet${p}\\n(?: .*\\n)*? switchport port-security violation restrict`, `Fa${p} : violation en mode restrict`),
            ck.show(d.s1, "show running-config", `^interface FastEthernet${p}\\n(?: .*\\n)*? switchport port-security mac-address sticky`, `Fa${p} : adresses MAC mémorisées (sticky)`),
          ]),
      },
      {
        title: "Couper les ports inutilisés",
        body: "`interface range f0/3 - 24` → `shutdown`.",
        checks: (d) => [ck.show(d.s1, "show running-config", "^interface FastEthernet0/24\\n(?: .*\\n)*? shutdown", "Fa0/24 (inutilisé) est éteint"), ck.show(d.s1, "show running-config", "^interface FastEthernet0/3\\n(?: .*\\n)*? shutdown", "Fa0/3 (inutilisé) est éteint")],
      },
      {
        title: "DHCP snooping",
        body: "1. `ip dhcp snooping` puis `ip dhcp snooping vlan 1`.\n2. Sur `G0/1` (vers R1) : `ip dhcp snooping trust`.",
        checks: (d) => [
          ck.show(d.s1, "show running-config", "^ip dhcp snooping vlan 1", "DHCP snooping actif sur le VLAN 1"),
          ck.show(d.s1, "show running-config", "^interface GigabitEthernet0/1\\n(?: .*\\n)*? ip dhcp snooping trust", "G0/1 est un port de confiance"),
        ],
      },
      {
        title: "Vérifier",
        body: "Faites « Obtenir par DHCP » sur PC1 et PC2 : ils doivent toujours recevoir une adresse. `show ip dhcp snooping binding` liste les baux vus par le switch.",
        checks: (d) => [ck.dhcp(d.p1, "192.168.40.0", M24), ck.dhcp(d.p2, "192.168.40.0", M24), ck.ping(d.p1, "192.168.40.1")],
      },
    ],
  },

  // ---------------------------------------------------------------- 13
  {
    slug: "ccna2-08-routes-flottantes",
    title: "Routes statiques et route flottante de secours",
    level: "CCNA 2",
    category: "Routage",
    difficulty: "Intermédiaire",
    minutes: 55,
    summary: "Router entre trois sites, puis prévoir un chemin de secours qui ne s'active qu'en cas de panne.",
    context:
      "Les sites fictifs de SBEE-Formation à Cotonou (R1), Bohicon (R2) et Natitingou (R3) sont reliés en triangle. Le lien direct R1–R3 est le principal ; le passage par R2 ne doit servir qu'en secours.",
    objectives: ["Adresser les trois liaisons", "Créer les routes statiques principales", "Ajouter une route flottante (distance administrative plus élevée)", "Vérifier le chemin utilisé"],
    addressing: [
      { device: "R1", iface: "G0/0/0 (LAN)", ip: "192.168.1.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/1 → R3", ip: "10.13.0.1", mask: M30, gw: "" },
      { device: "R1", iface: "G0/0/2 → R2", ip: "10.12.0.1", mask: M30, gw: "" },
      { device: "R2", iface: "G0/0/2 → R1", ip: "10.12.0.2", mask: M30, gw: "" },
      { device: "R2", iface: "G0/0/1 → R3", ip: "10.23.0.2", mask: M30, gw: "" },
      { device: "R3", iface: "G0/0/1 → R1", ip: "10.13.0.2", mask: M30, gw: "" },
      { device: "R3", iface: "G0/0/2 → R2", ip: "10.23.0.1", mask: M30, gw: "" },
      { device: "R3", iface: "G0/0/0 (LAN)", ip: "192.168.3.1", mask: M24, gw: "" },
    ],
    tips: ["Une route statique a une distance administrative de 1 : la route flottante doit avoir un nombre plus grand (ici 10).", "Tant que le lien principal fonctionne, la route flottante n'apparaît pas dans « show ip route ».", "Testez la panne : « shutdown » sur R1 G0/0/1, puis « show ip route »."],
    commands: [
      cmd("ip route 192.168.3.0 255.255.255.0 10.13.0.2", "Route principale"),
      cmd("ip route 192.168.3.0 255.255.255.0 10.12.0.2 10", "Route flottante (AD 10)"),
      cmd("show ip route static", "Routes statiques en service"),
      cmd("traceroute 192.168.3.10", "Chemin suivi"),
    ],
    build(net) {
      const r1 = add(net, "router", 120, 60, "R1");
      const r2 = add(net, "router", 340, 260, "R2");
      const r3 = add(net, "router", 560, 60, "R3");
      const p1 = add(net, "pc", 120, 300, "PC-COTONOU");
      const p3 = add(net, "pc", 560, 300, "PC-NATI");
      cable(net, r1, G("0/0/1"), r3, G("0/0/1"));
      cable(net, r1, G("0/0/2"), r2, G("0/0/2"));
      cable(net, r2, G("0/0/1"), r3, G("0/0/2"));
      cable(net, r1, G("0/0/0"), p1, F("0"));
      cable(net, r3, G("0/0/0"), p3, F("0"));
      host(p1, "192.168.1.10", M24, "192.168.1.1");
      host(p3, "192.168.3.10", M24, "192.168.3.1");
      return { r1, r2, r3, p1, p3 };
    },
    steps: [
      {
        title: "Adresser les liaisons et les LAN",
        body: "Suivez la table d'adressage sur R1, R2 et R3, et activez toutes les interfaces utilisées.",
        checks: (d) => [ck.ip(d.r1, G("0/0/1"), "10.13.0.1", M30), ck.ip(d.r1, G("0/0/2"), "10.12.0.1", M30), ck.ip(d.r2, G("0/0/1"), "10.23.0.2", M30), ck.ip(d.r3, G("0/0/2"), "10.23.0.1", M30), ck.up(d.r3, G("0/0/0")), ck.up(d.r1, G("0/0/0"))],
      },
      {
        title: "Routes principales",
        body: "1. R1 : `ip route 192.168.3.0 255.255.255.0 10.13.0.2`.\n2. R3 : `ip route 192.168.1.0 255.255.255.0 10.13.0.1`.\n3. R2 doit connaître les deux LAN : `ip route 192.168.1.0 255.255.255.0 10.12.0.1` et `ip route 192.168.3.0 255.255.255.0 10.23.0.1`.",
        checks: (d) => [ck.show(d.r1, "show ip route", "S\\s+192\\.168\\.3\\.0/24 \\[1/0\\] via 10\\.13\\.0\\.2", "R1 passe par le lien direct vers R3"), ck.route(d.r3, "192.168.1.0", M24), ck.route(d.r2, "192.168.1.0", M24), ck.route(d.r2, "192.168.3.0", M24)],
      },
      {
        title: "Routes flottantes de secours",
        body: "1. R1 : `ip route 192.168.3.0 255.255.255.0 10.12.0.2 10`.\n2. R3 : `ip route 192.168.1.0 255.255.255.0 10.23.0.2 10`.",
        checks: (d) => [
          ck.show(d.r1, "show running-config", "^ip route 192\\.168\\.3\\.0 255\\.255\\.255\\.0 10\\.12\\.0\\.2 10$", "R1 a une route flottante via R2 (AD 10)"),
          ck.show(d.r3, "show running-config", "^ip route 192\\.168\\.1\\.0 255\\.255\\.255\\.0 10\\.23\\.0\\.2 10$", "R3 a une route flottante via R2 (AD 10)"),
        ],
      },
      {
        title: "Vérifier",
        body: "1. Depuis PC-COTONOU : `ping 192.168.3.10`, puis `tracert 192.168.3.10` (2 sauts).\n2. Bonus : coupez R1 G0/0/1 et refaites le traceroute : le trafic passe par R2.",
        checks: (d) => [ck.ping(d.p1, "192.168.3.10")],
      },
    ],
  },

  // ---------------------------------------------------------------- 14
  {
    slug: "ccna2-09-hsrp",
    title: "Redondance de passerelle avec HSRP",
    level: "CCNA 2",
    category: "Haute disponibilité",
    difficulty: "Avancé",
    minutes: 60,
    summary: "Deux routeurs partagent une passerelle virtuelle : si le routeur actif tombe, l'autre prend le relais.",
    context:
      "L'hôpital fictif CHU-Lokossa ne peut pas perdre sa passerelle. R1 et R2 sont tous deux reliés au LAN et au fournisseur (R-FAI, loopback 8.8.8.8). Les postes utiliseront une passerelle virtuelle HSRP.",
    objectives: ["Adresser R1, R2 et la liaison vers le fournisseur", "Configurer HSRP avec l'adresse virtuelle 192.168.100.254", "Donner la priorité à R1 avec préemption", "Vérifier que les postes sortent par la passerelle virtuelle"],
    addressing: [
      { device: "R1", iface: "G0/0/1 (LAN)", ip: "192.168.100.1", mask: M24, gw: "HSRP 192.168.100.254" },
      { device: "R2", iface: "G0/0/1 (LAN)", ip: "192.168.100.2", mask: M24, gw: "HSRP 192.168.100.254" },
      { device: "R1", iface: "G0/0/0 → FAI", ip: "203.0.113.1", mask: "255.255.255.248", gw: "" },
      { device: "R2", iface: "G0/0/0 → FAI", ip: "203.0.113.2", mask: "255.255.255.248", gw: "" },
      { device: "R-FAI", iface: "G0/0/0", ip: "203.0.113.6", mask: "255.255.255.248", gw: "" },
      { device: "PC-URGENCES", iface: "NIC", ip: "192.168.100.10", mask: M24, gw: "192.168.100.254" },
    ],
    tips: ["La passerelle des postes est l'adresse virtuelle, pas celle de R1 ou de R2.", "« standby 1 preempt » permet à R1 de redevenir actif après une panne.", "« show standby brief » affiche Active / Standby."],
    commands: [
      cmd("standby 1 ip 192.168.100.254", "Adresse virtuelle du groupe 1"),
      cmd("standby 1 priority 150", "Priorité (la plus haute devient active)"),
      cmd("standby 1 preempt", "Reprendre le rôle actif"),
      cmd("show standby brief", "État HSRP"),
      cmd("ip route 0.0.0.0 0.0.0.0 203.0.113.6", "Route par défaut vers le FAI"),
    ],
    build(net) {
      const fai = add(net, "router", 330, 20, "R-FAI");
      const sw0 = add(net, "switch", 330, 150, "S-WAN");
      const r1 = add(net, "router", 160, 280, "R1");
      const r2 = add(net, "router", 500, 280, "R2");
      const s1 = add(net, "switch", 330, 420, "S-LAN");
      const pc = add(net, "pc", 330, 580, "PC-URGENCES");
      cable(net, fai, G("0/0/0"), sw0, G("0/1"));
      cable(net, r1, G("0/0/0"), sw0, F("0/1"));
      cable(net, r2, G("0/0/0"), sw0, F("0/2"));
      cable(net, r1, G("0/0/1"), s1, F("0/1"));
      cable(net, r2, G("0/0/1"), s1, F("0/2"));
      cable(net, s1, G("0/1"), pc, F("0"));
      const f = fai.ifaces.find((x) => x.name === G("0/0/0"))!;
      f.ip = "203.0.113.6";
      f.mask = "255.255.255.248";
      f.adminUp = true;
      fai.loopbacks = [{ name: "Loopback0", mac: f.mac, ip: "8.8.8.8", mask: "255.255.255.255", adminUp: true, description: "" }];
      fai.routes = [{ network: "192.168.100.0", mask: M24, nextHop: "203.0.113.1" }, { network: "192.168.100.0", mask: M24, nextHop: "203.0.113.2", ad: 5 }];
      return { r1, r2, pc };
    },
    steps: [
      {
        title: "Adresser R1 et R2",
        body: "Suivez la table d'adressage pour `G0/0/0` (vers le fournisseur) et `G0/0/1` (LAN) de R1 et R2, et activez les interfaces. Ajoutez sur chacun `ip route 0.0.0.0 0.0.0.0 203.0.113.6`.",
        checks: (d) => [ck.ip(d.r1, G("0/0/1"), "192.168.100.1", M24), ck.ip(d.r2, G("0/0/1"), "192.168.100.2", M24), ck.ip(d.r1, G("0/0/0"), "203.0.113.1", "255.255.255.248"), ck.ip(d.r2, G("0/0/0"), "203.0.113.2", "255.255.255.248"), ck.route(d.r1, "0.0.0.0", "0.0.0.0"), ck.route(d.r2, "0.0.0.0", "0.0.0.0")],
      },
      {
        title: "Configurer HSRP",
        body: "Sur `G0/0/1` de R1 :\n• `standby 1 ip 192.168.100.254`\n• `standby 1 priority 150`\n• `standby 1 preempt`\n\nSur `G0/0/1` de R2 : `standby 1 ip 192.168.100.254`.",
        checks: (d) => [
          ck.show(d.r1, "show standby brief", "Gi0/0/1\\s+1\\s+150\\s+P\\s+Active", "R1 est actif (priorité 150, préemption)"),
          ck.show(d.r2, "show standby brief", "Gi0/0/1\\s+1\\s+100\\s+\\S*\\s*Standby", "R2 est en attente (standby)"),
        ],
      },
      {
        title: "Configurer le poste",
        body: "PC-URGENCES : `192.168.100.10/24`, passerelle **virtuelle** `192.168.100.254`.",
        checks: (d) => [ck.ip(d.pc, F("0"), "192.168.100.10", M24), ck.gw(d.pc, "192.168.100.254")],
      },
      {
        title: "Vérifier",
        body: "1. Depuis PC-URGENCES : `ping 8.8.8.8`.\n2. Bonus : coupez R1 G0/0/1 (`shutdown`), vérifiez que R2 devient actif et que le ping fonctionne toujours.",
        checks: (d) => [ck.ping(d.pc, "192.168.100.254"), ck.ping(d.pc, "8.8.8.8")],
      },
    ],
  },

  // ---------------------------------------------------------------- 15
  {
    slug: "ccna2-10-wifi-controleur",
    title: "Réseau Wi-Fi d'entreprise avec contrôleur et point d'accès",
    level: "CCNA 2",
    category: "Wi-Fi",
    difficulty: "Avancé",
    minutes: 70,
    summary: "Router-on-a-stick, DHCP avec option 43, contrôleur configuré par interface web et réseau WPA2.",
    context:
      "L'hôtel fictif Bel Azur de Grand-Popo veut un Wi-Fi pour son personnel. Le contrôleur WLC1 gère le point d'accès AP1 ; les clients Wi-Fi doivent arriver dans le VLAN 20.",
    objectives: ["Préparer le routage et les VLAN", "Distribuer les adresses par DHCP (dont l'option 43 pour le point d'accès)", "Configurer le contrôleur et créer le réseau Wi-Fi WPA2", "Connecter le portable et vérifier"],
    addressing: [
      { device: "R1", iface: "G0/0/1 (natif, gestion)", ip: "192.168.1.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/1.20 (Wi-Fi)", ip: "192.168.20.1", mask: M24, gw: "" },
      { device: "WLC1", iface: "management (non étiqueté)", ip: "192.168.1.5", mask: M24, gw: "192.168.1.1" },
      { device: "WLC1", iface: "employes (VLAN 20)", ip: "192.168.20.5", mask: M24, gw: "192.168.20.1" },
      { device: "AP1", iface: "G0", ip: "DHCP (pool GESTION)", mask: "", gw: "" },
      { device: "Laptop1", iface: "Wi-Fi", ip: "DHCP (pool WIFI)", mask: "", gw: "" },
    ],
    tips: [
      "Option 43 : f104 suivi de l'adresse du contrôleur en hexadécimal (192.168.1.5 = c0a80105).",
      "Le contrôleur se configure d'abord dans son panneau (clic sur WLC1), puis par son interface web depuis le navigateur du PC-ADMIN.",
      "Le port du switch vers le contrôleur doit être un trunk (VLAN 20 étiqueté).",
    ],
    commands: [
      cmd("interface g0/0/1.20 → encapsulation dot1Q 20", "Sous-interface Wi-Fi"),
      cmd("ip dhcp pool GESTION → option 43 hex f104c0a80105", "Adresse du contrôleur pour les points d'accès"),
      cmd("switchport mode trunk", "Trunk vers R1 et vers le contrôleur"),
      cmd("https://192.168.1.5", "Interface web du contrôleur (navigateur du PC)"),
    ],
    build(net) {
      const r1 = add(net, "router", 330, 20, "R1");
      const s1 = add(net, "switch", 330, 180, "S1");
      const wlc = add(net, "wlc", 600, 180, "WLC1");
      const ap = add(net, "ap", 200, 360, "AP1");
      const pc = add(net, "pc", 460, 360, "PC-ADMIN");
      const lap = add(net, "pc", 120, 520, "Laptop1", "LAPTOP");
      cable(net, r1, G("0/0/1"), s1, G("0/1"));
      cable(net, wlc, G("0/0/1"), s1, G("0/2"));
      cable(net, ap, G("0"), s1, F("0/1"));
      cable(net, pc, F("0"), s1, F("0/2"));
      host(pc, "192.168.1.10", M24, "192.168.1.1");
      return { r1, s1, wlc, ap, pc, lap };
    },
    steps: [
      {
        title: "Routage et VLAN",
        body: "1. S1 : créez `vlan 20`, passez `G0/1` et `G0/2` en `switchport mode trunk`.\n2. R1 : `G0/0/1` `192.168.1.1/24` + `no shutdown` ; sous-interface `G0/0/1.20` : `encapsulation dot1Q 20`, `192.168.20.1/24`.",
        checks: (d) => [ck.vlan(d.s1, 20), ck.trunk(d.s1, G("0/1")), ck.trunk(d.s1, G("0/2")), ck.ip(d.r1, G("0/0/1"), "192.168.1.1", M24), ck.ip(d.r1, G("0/0/1.20"), "192.168.20.1", M24)],
      },
      {
        title: "Pools DHCP",
        body: "Sur R1 :\n1. `ip dhcp excluded-address 192.168.1.1 192.168.1.9` et `ip dhcp excluded-address 192.168.20.1 192.168.20.9`.\n2. Pool `GESTION` : `network 192.168.1.0 255.255.255.0`, `default-router 192.168.1.1`, `option 43 hex f104c0a80105`.\n3. Pool `WIFI` : `network 192.168.20.0 255.255.255.0`, `default-router 192.168.20.1`.",
        checks: (d) => [
          ck.show(d.r1, "show running-config", "^ip dhcp pool GESTION\\n(?: .*\\n)*? option 43 hex f104c0a80105", "Le pool GESTION annonce le contrôleur (option 43)"),
          ck.show(d.r1, "show running-config", "^ip dhcp pool WIFI\\n network 192\\.168\\.20\\.0 255\\.255\\.255\\.0", "Le pool WIFI distribue 192.168.20.0/24"),
        ],
      },
      {
        title: "Configurer le contrôleur",
        body: "1. Cliquez sur WLC1 : adresse de gestion `192.168.1.5`, masque `255.255.255.0`, passerelle `192.168.1.1`, VLAN vide (non étiqueté).\n2. Sur PC-ADMIN, onglet « Navigateur » : `https://192.168.1.5` (admin / admin).\n3. Interfaces : ajoutez `employes`, VLAN `20`, `192.168.20.5`, masque `255.255.255.0`, passerelle `192.168.20.1`.\n4. Réseaux Wi-Fi : SSID `BelAzur-Staff`, interface `employes`, WPA2 Personnel, clé `Hotel2026!`.",
        checks: (d) => [ck.ping(d.pc, "192.168.1.5"), ck.ping(d.r1, "192.168.20.5"), ck.tcp(d.pc, "192.168.1.5", 443, true)],
      },
      {
        title: "Connecter le portable",
        body: "1. Cliquez sur AP1 : il doit être « enregistré » auprès de WLC1 (adresse obtenue par DHCP).\n2. Cliquez sur Laptop1 : choisissez `BelAzur-Staff`, tapez la clé `Hotel2026!`, puis « Se connecter ».\n3. Depuis Laptop1 : `ping 192.168.20.1`.",
        checks: (d) => [ck.dhcp(d.lap, "192.168.20.0", M24), ck.ping(d.lap, "192.168.20.1"), ck.ping(d.lap, "192.168.1.10")],
      },
    ],
  },
];

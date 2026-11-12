import { F, G, M24, M30, add, cable, ck, host, type CatalogSpec } from "./base";

const cmd = (c: string, desc: string) => ({ cmd: c, desc });

export const CCNA1: CatalogSpec[] = [
  // ---------------------------------------------------------------- 1
  {
    slug: "ccna1-01-configuration-de-base",
    title: "Configuration de base et sécurisation d'un routeur et d'un switch",
    level: "CCNA 1",
    category: "Bases et adressage",
    difficulty: "Débutant",
    minutes: 40,
    summary: "Noms, mots de passe chiffrés, bannière, adressage de gestion et sauvegarde de la configuration.",
    context:
      "Togbé Assurances (entreprise fictive, Porto-Novo) installe son premier réseau au siège. Le routeur R1 et le switch S1 sortent du carton : vous devez les nommer, les sécuriser et les rendre joignables depuis le poste de l'administrateur.",
    objectives: ["Nommer les équipements", "Protéger l'accès à la console et au mode privilégié", "Adresser le routeur, le switch et le PC d'administration", "Vérifier la connectivité et sauvegarder la configuration"],
    addressing: [
      { device: "R1-SIEGE", iface: "G0/0/1", ip: "192.168.10.1", mask: M24, gw: "" },
      { device: "S1-SIEGE", iface: "VLAN 1", ip: "192.168.10.2", mask: M24, gw: "192.168.10.1" },
      { device: "PC-ADMIN", iface: "NIC", ip: "192.168.10.10", mask: M24, gw: "192.168.10.1" },
    ],
    tips: [
      "Les interfaces d'un routeur sont éteintes par défaut : pensez à « no shutdown ».",
      "Un switch de couche 2 s'administre par son interface VLAN 1 et a besoin d'une passerelle par défaut (ip default-gateway).",
      "« show running-config » affiche la configuration en cours ; « copy running-config startup-config » l'enregistre.",
    ],
    commands: [
      cmd("hostname <nom>", "Nommer l'équipement"),
      cmd("enable secret <mot de passe>", "Mot de passe chiffré du mode privilégié"),
      cmd("line console 0 → password <mdp> → login", "Protéger l'accès console"),
      cmd("service password-encryption", "Chiffrer les mots de passe en clair"),
      cmd("banner motd #<message>#", "Message d'avertissement à la connexion"),
      cmd("interface g0/0/1 → ip address … → no shutdown", "Adresser et activer une interface"),
      cmd("interface vlan 1 → ip address …", "Adresse de gestion du switch"),
      cmd("ip default-gateway <adresse>", "Passerelle du switch"),
      cmd("copy running-config startup-config", "Sauvegarder"),
    ],
    build(net) {
      const r1 = add(net, "router", 300, 40, "R1");
      const s1 = add(net, "switch", 300, 220, "S1");
      const pc = add(net, "pc", 300, 400, "PC-ADMIN");
      cable(net, r1, G("0/0/1"), s1, G("0/1"));
      cable(net, s1, F("0/1"), pc, F("0"));
      return { r1, s1, pc };
    },
    steps: [
      {
        title: "Nommer les équipements",
        body: "1. Sur le routeur, passez en mode configuration (`enable`, `configure terminal`) et nommez-le `R1-SIEGE`.\n2. Nommez le switch `S1-SIEGE`.",
        checks: (d) => [ck.hostname(d.r1, "R1-SIEGE"), ck.hostname(d.s1, "S1-SIEGE")],
      },
      {
        title: "Sécuriser les accès",
        body: "Sur les deux équipements :\n1. Mot de passe du mode privilégié chiffré : `enable secret class`.\n2. Console : `line console 0`, `password cisco`, `login`.\n3. Chiffrez les mots de passe en clair avec `service password-encryption`.\n4. Ajoutez la bannière `banner motd #Accès réservé au personnel autorisé#`.",
        checks: (d) => [
          ck.show(d.r1, "show running-config", "^enable secret", "R1 a un mot de passe enable secret"),
          ck.show(d.s1, "show running-config", "^enable secret", "S1 a un mot de passe enable secret"),
          ck.show(d.r1, "show running-config", "^line con 0\\n password .+\\n login", "La console de R1 demande un mot de passe"),
          ck.show(d.r1, "show running-config", "^service password-encryption", "R1 chiffre les mots de passe"),
          ck.show(d.s1, "show running-config", "^service password-encryption", "S1 chiffre les mots de passe"),
          ck.show(d.r1, "show running-config", "^banner motd", "R1 affiche une bannière"),
        ],
      },
      {
        title: "Adresser le routeur, le switch et le PC",
        body: "1. Sur R1, configurez `G0/0/1` en `192.168.10.1 255.255.255.0` puis activez-la (`no shutdown`).\n2. Sur S1, configurez `interface vlan 1` en `192.168.10.2 255.255.255.0`, activez-la, puis `ip default-gateway 192.168.10.1`.\n3. Sur PC-ADMIN : `192.168.10.10 / 255.255.255.0`, passerelle `192.168.10.1`.",
        checks: (d) => [
          ck.ip(d.r1, G("0/0/1"), "192.168.10.1", M24),
          ck.up(d.r1, G("0/0/1")),
          ck.ip(d.s1, "Vlan1", "192.168.10.2", M24),
          ck.show(d.s1, "show running-config", "^ip default-gateway 192\\.168\\.10\\.1", "S1 a pour passerelle 192.168.10.1"),
          ck.ip(d.pc, F("0"), "192.168.10.10", M24),
          ck.gw(d.pc, "192.168.10.1"),
        ],
      },
      {
        title: "Vérifier et sauvegarder",
        body: "1. Depuis PC-ADMIN, pinguez R1 (`ping 192.168.10.1`) et S1 (`ping 192.168.10.2`).\n2. Sur chaque équipement, sauvegardez : `copy running-config startup-config`.",
        checks: (d) => [
          ck.ping(d.pc, "192.168.10.1"),
          ck.ping(d.pc, "192.168.10.2"),
          ck.show(d.r1, "show startup-config", "^hostname R1-SIEGE", "La configuration de R1 est sauvegardée"),
          ck.show(d.s1, "show startup-config", "^hostname S1-SIEGE", "La configuration de S1 est sauvegardée"),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    slug: "ccna1-02-adressage-deux-lan",
    title: "Adressage IPv4 de deux réseaux locaux",
    level: "CCNA 1",
    category: "Bases et adressage",
    difficulty: "Débutant",
    minutes: 35,
    summary: "Un routeur, deux LAN, quatre postes : adressage complet et premiers échanges entre réseaux.",
    context:
      "La clinique Sainte-Grâce (fictive, Abomey-Calavi) sépare l'accueil et les bureaux médicaux dans deux réseaux. Le routeur R1 doit les relier.",
    objectives: ["Adresser les deux interfaces du routeur", "Configurer les quatre postes", "Faire communiquer les deux réseaux"],
    addressing: [
      { device: "R1", iface: "G0/0/0", ip: "172.16.10.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/1", ip: "172.16.20.1", mask: M24, gw: "" },
      { device: "PC-ACC1", iface: "NIC", ip: "172.16.10.11", mask: M24, gw: "172.16.10.1" },
      { device: "PC-ACC2", iface: "NIC", ip: "172.16.10.12", mask: M24, gw: "172.16.10.1" },
      { device: "PC-MED1", iface: "NIC", ip: "172.16.20.11", mask: M24, gw: "172.16.20.1" },
      { device: "PC-MED2", iface: "NIC", ip: "172.16.20.12", mask: M24, gw: "172.16.20.1" },
    ],
    tips: ["Un poste sans passerelle ne peut parler qu'à son propre réseau.", "« show ip interface brief » montre l'adresse et l'état de chaque interface."],
    commands: [
      cmd("interface g0/0/0", "Entrer dans l'interface"),
      cmd("ip address <adresse> <masque>", "Adresser l'interface"),
      cmd("no shutdown", "Activer l'interface"),
      cmd("show ip interface brief", "Résumé des interfaces"),
      cmd("show ip route", "Réseaux connus du routeur"),
      cmd("ping <adresse>", "Tester la connectivité"),
    ],
    build(net) {
      const r1 = add(net, "router", 330, 30, "R1");
      const s1 = add(net, "switch", 130, 200, "S-ACCUEIL");
      const s2 = add(net, "switch", 530, 200, "S-MEDICAL");
      const a1 = add(net, "pc", 40, 380, "PC-ACC1");
      const a2 = add(net, "pc", 220, 380, "PC-ACC2");
      const m1 = add(net, "pc", 440, 380, "PC-MED1");
      const m2 = add(net, "pc", 620, 380, "PC-MED2");
      cable(net, r1, G("0/0/0"), s1, G("0/1"));
      cable(net, r1, G("0/0/1"), s2, G("0/1"));
      cable(net, s1, F("0/1"), a1, F("0"));
      cable(net, s1, F("0/2"), a2, F("0"));
      cable(net, s2, F("0/1"), m1, F("0"));
      cable(net, s2, F("0/2"), m2, F("0"));
      return { r1, a1, a2, m1, m2 };
    },
    steps: [
      {
        title: "Adresser le routeur",
        body: "1. `G0/0/0` : `172.16.10.1 255.255.255.0` (accueil).\n2. `G0/0/1` : `172.16.20.1 255.255.255.0` (médical).\n3. Activez les deux interfaces.",
        checks: (d) => [ck.ip(d.r1, G("0/0/0"), "172.16.10.1", M24), ck.ip(d.r1, G("0/0/1"), "172.16.20.1", M24), ck.up(d.r1, G("0/0/0")), ck.up(d.r1, G("0/0/1"))],
      },
      {
        title: "Configurer les postes de l'accueil",
        body: "PC-ACC1 : `172.16.10.11`, PC-ACC2 : `172.16.10.12`, masque `255.255.255.0`, passerelle `172.16.10.1`.",
        checks: (d) => [ck.ip(d.a1, F("0"), "172.16.10.11", M24), ck.ip(d.a2, F("0"), "172.16.10.12", M24), ck.gw(d.a1, "172.16.10.1"), ck.gw(d.a2, "172.16.10.1")],
      },
      {
        title: "Configurer les postes médicaux",
        body: "PC-MED1 : `172.16.20.11`, PC-MED2 : `172.16.20.12`, masque `255.255.255.0`, passerelle `172.16.20.1`.",
        checks: (d) => [ck.ip(d.m1, F("0"), "172.16.20.11", M24), ck.ip(d.m2, F("0"), "172.16.20.12", M24), ck.gw(d.m1, "172.16.20.1"), ck.gw(d.m2, "172.16.20.1")],
      },
      {
        title: "Tester la communication",
        body: "1. Dans un même réseau : depuis PC-ACC1, `ping 172.16.10.12`.\n2. Entre les réseaux : depuis PC-ACC1, `ping 172.16.20.11`, puis `tracert 172.16.20.11` pour voir le passage par R1.",
        checks: (d) => [ck.ping(d.a1, "172.16.10.12"), ck.ping(d.a1, "172.16.20.11"), ck.ping(d.m2, "172.16.10.12")],
      },
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    slug: "ccna1-03-vlsm-trois-sites",
    title: "Découpage VLSM et routes statiques pour trois réseaux",
    level: "CCNA 1",
    category: "Bases et adressage",
    difficulty: "Intermédiaire",
    minutes: 60,
    summary: "Découper 192.168.50.0/24 en sous-réseaux de tailles différentes, puis router entre deux routeurs.",
    context:
      "Bénin Agro Export (fictive) dispose du bloc 192.168.50.0/24 pour trois services : Production (100 postes), Commercial (50 postes) et Direction (20 postes), plus la liaison entre ses deux routeurs. Le découpage VLSM a été calculé pour vous : appliquez-le.",
    objectives: ["Appliquer un plan d'adressage VLSM", "Relier deux routeurs par un réseau /30", "Ajouter les routes statiques nécessaires", "Vérifier la connectivité de bout en bout"],
    addressing: [
      { device: "R1", iface: "G0/0/0", ip: "192.168.50.1", mask: "255.255.255.128", gw: "Production /25" },
      { device: "R1", iface: "G0/0/1", ip: "192.168.50.129", mask: "255.255.255.192", gw: "Commercial /26" },
      { device: "R1", iface: "G0/0/2", ip: "192.168.50.225", mask: M30, gw: "Liaison /30" },
      { device: "R2", iface: "G0/0/2", ip: "192.168.50.226", mask: M30, gw: "Liaison /30" },
      { device: "R2", iface: "G0/0/0", ip: "192.168.50.193", mask: "255.255.255.224", gw: "Direction /27" },
      { device: "PC-PROD", iface: "NIC", ip: "192.168.50.10", mask: "255.255.255.128", gw: "192.168.50.1" },
      { device: "PC-COM", iface: "NIC", ip: "192.168.50.140", mask: "255.255.255.192", gw: "192.168.50.129" },
      { device: "PC-DIR", iface: "NIC", ip: "192.168.50.200", mask: "255.255.255.224", gw: "192.168.50.193" },
    ],
    tips: [
      "On découpe toujours du plus grand besoin au plus petit : /25, puis /26, puis /27, puis /30.",
      "R1 ne connaît pas le réseau de la Direction : il lui faut une route statique. R2 n'a qu'une sortie : une route par défaut suffit.",
      "Une route statique s'écrit : ip route <réseau> <masque> <saut suivant>.",
    ],
    commands: [
      cmd("ip address <adresse> <masque>", "Adresser une interface"),
      cmd("ip route 192.168.50.192 255.255.255.224 192.168.50.226", "Route statique vers la Direction (sur R1)"),
      cmd("ip route 0.0.0.0 0.0.0.0 192.168.50.225", "Route par défaut (sur R2)"),
      cmd("show ip route", "Table de routage"),
      cmd("traceroute <adresse>", "Chemin suivi par les paquets"),
    ],
    build(net) {
      const r1 = add(net, "router", 220, 40, "R1");
      const r2 = add(net, "router", 560, 40, "R2");
      const s1 = add(net, "switch", 60, 220, "S-PROD");
      const s2 = add(net, "switch", 300, 220, "S-COM");
      const s3 = add(net, "switch", 560, 220, "S-DIR");
      const p1 = add(net, "pc", 60, 400, "PC-PROD");
      const p2 = add(net, "pc", 300, 400, "PC-COM");
      const p3 = add(net, "pc", 560, 400, "PC-DIR");
      cable(net, r1, G("0/0/0"), s1, G("0/1"));
      cable(net, r1, G("0/0/1"), s2, G("0/1"));
      cable(net, r1, G("0/0/2"), r2, G("0/0/2"));
      cable(net, r2, G("0/0/0"), s3, G("0/1"));
      cable(net, s1, F("0/1"), p1, F("0"));
      cable(net, s2, F("0/1"), p2, F("0"));
      cable(net, s3, F("0/1"), p3, F("0"));
      return { r1, r2, p1, p2, p3 };
    },
    steps: [
      {
        title: "Adresser R1",
        body: "1. `G0/0/0` : `192.168.50.1 255.255.255.128` (Production).\n2. `G0/0/1` : `192.168.50.129 255.255.255.192` (Commercial).\n3. `G0/0/2` : `192.168.50.225 255.255.255.252` (liaison vers R2).\n4. Activez les trois interfaces.",
        checks: (d) => [ck.ip(d.r1, G("0/0/0"), "192.168.50.1", "255.255.255.128"), ck.ip(d.r1, G("0/0/1"), "192.168.50.129", "255.255.255.192"), ck.ip(d.r1, G("0/0/2"), "192.168.50.225", M30), ck.up(d.r1, G("0/0/2"))],
      },
      {
        title: "Adresser R2",
        body: "1. `G0/0/2` : `192.168.50.226 255.255.255.252`.\n2. `G0/0/0` : `192.168.50.193 255.255.255.224` (Direction).\n3. Activez les deux interfaces.",
        checks: (d) => [ck.ip(d.r2, G("0/0/2"), "192.168.50.226", M30), ck.ip(d.r2, G("0/0/0"), "192.168.50.193", "255.255.255.224"), ck.up(d.r2, G("0/0/0"))],
      },
      {
        title: "Configurer les postes",
        body: "Suivez la table d'adressage : PC-PROD, PC-COM et PC-DIR, avec le bon masque et la bonne passerelle.",
        checks: (d) => [ck.ip(d.p1, F("0"), "192.168.50.10", "255.255.255.128"), ck.ip(d.p2, F("0"), "192.168.50.140", "255.255.255.192"), ck.ip(d.p3, F("0"), "192.168.50.200", "255.255.255.224"), ck.gw(d.p3, "192.168.50.193")],
      },
      {
        title: "Ajouter les routes statiques",
        body: "1. Sur R1 : `ip route 192.168.50.192 255.255.255.224 192.168.50.226`.\n2. Sur R2 : route par défaut `ip route 0.0.0.0 0.0.0.0 192.168.50.225`.\n3. Vérifiez avec `show ip route` (lignes « S »).",
        checks: (d) => [ck.route(d.r1, "192.168.50.192", "255.255.255.224"), ck.route(d.r2, "0.0.0.0", "0.0.0.0")],
      },
      {
        title: "Vérifier de bout en bout",
        body: "Depuis PC-PROD et PC-COM, pinguez PC-DIR (`192.168.50.200`).",
        checks: (d) => [ck.ping(d.p1, "192.168.50.200"), ck.ping(d.p2, "192.168.50.200"), ck.ping(d.p1, "192.168.50.140")],
      },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    slug: "ccna1-04-acces-ssh",
    title: "Administration à distance sécurisée avec SSH",
    level: "CCNA 1",
    category: "Sécurité des équipements",
    difficulty: "Intermédiaire",
    minutes: 45,
    summary: "Remplacer Telnet par SSH version 2 avec comptes locaux sur un routeur et un switch.",
    context:
      "Un audit chez Sèmè Logistique (fictive) a montré que les équipements sont administrés en Telnet, en clair. Vous devez imposer SSH version 2 avec un compte nominatif sur R1 et S1.",
    objectives: ["Préparer les équipements pour SSH (nom de domaine, clés RSA)", "Créer un compte administrateur local", "N'autoriser que SSH sur les lignes VTY", "Tester la connexion SSH depuis le PC d'administration"],
    addressing: [
      { device: "R1", iface: "G0/0/1", ip: "10.20.0.1", mask: M24, gw: "" },
      { device: "S1", iface: "VLAN 1", ip: "10.20.0.2", mask: M24, gw: "10.20.0.1" },
      { device: "PC-ADMIN", iface: "NIC", ip: "10.20.0.10", mask: M24, gw: "10.20.0.1" },
    ],
    tips: ["Les clés RSA exigent un nom d'hôte et un nom de domaine.", "« login local » fait demander le compte créé avec « username ».", "Depuis le PC : ssh -l admin 10.20.0.1"],
    commands: [
      cmd("ip domain-name semelog.bj", "Nom de domaine (requis pour les clés)"),
      cmd("crypto key generate rsa modulus 2048", "Générer les clés RSA"),
      cmd("username admin secret <mot de passe>", "Compte local"),
      cmd("ip ssh version 2", "Imposer SSH version 2"),
      cmd("line vty 0 4 → transport input ssh → login local", "Lignes d'accès à distance"),
      cmd("ssh -l admin <adresse>", "Se connecter depuis le PC"),
    ],
    build(net) {
      const r1 = add(net, "router", 300, 40, "R1");
      const s1 = add(net, "switch", 300, 220, "S1");
      const pc = add(net, "pc", 300, 400, "PC-ADMIN");
      cable(net, r1, G("0/0/1"), s1, G("0/1"));
      cable(net, s1, F("0/1"), pc, F("0"));
      host(pc, "10.20.0.10", M24, "10.20.0.1");
      return { r1, s1, pc };
    },
    steps: [
      {
        title: "Adresser R1 et S1",
        body: "1. R1 `G0/0/1` : `10.20.0.1 255.255.255.0`, activée.\n2. S1 `interface vlan 1` : `10.20.0.2 255.255.255.0`, activée, et `ip default-gateway 10.20.0.1`.\n3. Vérifiez : depuis PC-ADMIN, `ping 10.20.0.1` et `ping 10.20.0.2`.",
        checks: (d) => [ck.ip(d.r1, G("0/0/1"), "10.20.0.1", M24), ck.ip(d.s1, "Vlan1", "10.20.0.2", M24), ck.ping(d.pc, "10.20.0.1"), ck.ping(d.pc, "10.20.0.2")],
      },
      {
        title: "Préparer SSH",
        body: "Sur R1 puis sur S1 :\n1. `ip domain-name semelog.bj`\n2. `crypto key generate rsa modulus 2048`\n3. `username admin secret Kora2026`\n4. `ip ssh version 2`",
        checks: (d) => [
          ck.show(d.r1, "show running-config", "^ip domain-name semelog\\.bj", "R1 a le nom de domaine semelog.bj"),
          ck.show(d.r1, "show running-config", "^username admin secret", "R1 a un compte admin"),
          ck.show(d.r1, "show running-config", "^ip ssh version 2", "R1 impose SSH version 2"),
          ck.show(d.s1, "show running-config", "^username admin secret", "S1 a un compte admin"),
          ck.show(d.s1, "show running-config", "^ip ssh version 2", "S1 impose SSH version 2"),
        ],
      },
      {
        title: "Restreindre les lignes VTY",
        body: "Sur R1 et S1 : `line vty 0 4`, puis `transport input ssh` et `login local`.",
        checks: (d) => [
          ck.show(d.r1, "show running-config", "^line vty 0 4[\\s\\S]*?transport input ssh", "R1 n'accepte que SSH sur les lignes VTY"),
          ck.show(d.r1, "show running-config", "^line vty 0 4[\\s\\S]*?login local", "R1 authentifie avec les comptes locaux"),
          ck.show(d.s1, "show running-config", "^line vty 0 4[\\s\\S]*?transport input ssh", "S1 n'accepte que SSH sur les lignes VTY"),
          ck.show(d.s1, "show running-config", "^line vty 0 4[\\s\\S]*?login local", "S1 authentifie avec les comptes locaux"),
        ],
      },
      {
        title: "Tester les accès",
        body: "1. Depuis PC-ADMIN : `ssh -l admin 10.20.0.1`, mot de passe `Kora2026`. Tapez `exit` pour revenir.\n2. Essayez `telnet 10.20.0.1` : la connexion doit être refusée.",
        checks: (d) => [ck.tcp(d.pc, "10.20.0.1", 22, true), ck.tcp(d.pc, "10.20.0.2", 22, true)],
      },
    ],
  },

  // ---------------------------------------------------------------- 5
  {
    slug: "ccna1-05-ipv6-slaac",
    title: "IPv6 : adressage, SLAAC et communication entre réseaux",
    level: "CCNA 1",
    category: "IPv6",
    difficulty: "Intermédiaire",
    minutes: 45,
    summary: "Activer le routage IPv6, adresser un routeur et laisser les postes s'autoconfigurer.",
    context:
      "L'université fictive UNI-Ouémé prépare sa migration vers IPv6. Le laboratoire informatique sert de pilote : deux salles, un routeur, et des postes qui doivent s'adresser tout seuls (SLAAC).",
    objectives: ["Activer le routage IPv6", "Adresser le routeur en IPv6", "Faire autoconfigurer les postes (SLAAC)", "Vérifier la communication IPv6"],
    addressing: [
      { device: "R1", iface: "G0/0/0", ip: "2001:db8:acad:1::1/64", mask: "", gw: "" },
      { device: "R1", iface: "G0/0/1", ip: "2001:db8:acad:2::1/64", mask: "", gw: "" },
      { device: "PC-SALLE1", iface: "NIC", ip: "SLAAC (2001:db8:acad:1::/64)", mask: "", gw: "lien local de R1" },
      { device: "PC-SALLE2", iface: "NIC", ip: "SLAAC (2001:db8:acad:2::/64)", mask: "", gw: "lien local de R1" },
    ],
    tips: ["Sans « ipv6 unicast-routing », le routeur n'envoie pas d'annonces de routeur (RA) : SLAAC ne fonctionne pas.", "Sur un PC : « ipv6 autoconfig » puis « ipconfig » pour voir l'adresse obtenue."],
    commands: [
      cmd("ipv6 unicast-routing", "Activer le routage IPv6"),
      cmd("ipv6 address 2001:db8:acad:1::1/64", "Adresse IPv6 d'une interface"),
      cmd("show ipv6 interface brief", "Adresses IPv6 des interfaces"),
      cmd("ipv6 autoconfig", "Autoconfiguration du PC (SLAAC)"),
      cmd("ping 2001:db8:acad:2::1", "Tester en IPv6"),
    ],
    build(net) {
      const r1 = add(net, "router", 300, 40, "R1");
      const s1 = add(net, "switch", 120, 220, "S1");
      const s2 = add(net, "switch", 480, 220, "S2");
      const p1 = add(net, "pc", 120, 400, "PC-SALLE1");
      const p2 = add(net, "pc", 480, 400, "PC-SALLE2");
      cable(net, r1, G("0/0/0"), s1, G("0/1"));
      cable(net, r1, G("0/0/1"), s2, G("0/1"));
      cable(net, s1, F("0/1"), p1, F("0"));
      cable(net, s2, F("0/1"), p2, F("0"));
      return { r1, p1, p2 };
    },
    steps: [
      {
        title: "Activer le routage IPv6",
        body: "Sur R1, en configuration globale : `ipv6 unicast-routing`.",
        checks: (d) => [ck.show(d.r1, "show running-config", "^ipv6 unicast-routing", "R1 route l'IPv6")],
      },
      {
        title: "Adresser R1 en IPv6",
        body: "1. `G0/0/0` : `ipv6 address 2001:db8:acad:1::1/64`, puis `no shutdown`.\n2. `G0/0/1` : `ipv6 address 2001:db8:acad:2::1/64`, puis `no shutdown`.\n3. Vérifiez avec `show ipv6 interface brief`.",
        checks: (d) => [
          ck.show(d.r1, "show ipv6 interface brief", "GigabitEthernet0/0/0\\s+\\[up/up\\][\\s\\S]*?2001:DB8:ACAD:1::1", "G0/0/0 est active avec 2001:db8:acad:1::1"),
          ck.show(d.r1, "show ipv6 interface brief", "GigabitEthernet0/0/1\\s+\\[up/up\\][\\s\\S]*?2001:DB8:ACAD:2::1", "G0/0/1 est active avec 2001:db8:acad:2::1"),
        ],
      },
      {
        title: "Autoconfigurer les postes",
        body: "Sur chaque PC, dans l'invite de commandes : `ipv6 autoconfig`, puis `ipconfig` pour voir l'adresse obtenue (elle commence par `2001:db8:acad:1:` ou `2001:db8:acad:2:`).",
        checks: (d) => [
          ck.show(d.p1, "ipconfig", "2001:db8:acad:1:", "PC-SALLE1 a une adresse 2001:db8:acad:1::/64", "Tapez « ipv6 autoconfig » sur le PC."),
          ck.show(d.p2, "ipconfig", "2001:db8:acad:2:", "PC-SALLE2 a une adresse 2001:db8:acad:2::/64", "Tapez « ipv6 autoconfig » sur le PC."),
        ],
      },
      {
        title: "Vérifier la communication IPv6",
        body: "Depuis PC-SALLE1 : `ping 2001:db8:acad:2::1`, puis pinguez l'adresse de PC-SALLE2 (lisez-la avec `ipconfig`).",
        checks: (d) => [
          ck.show(d.p1, "ping 2001:db8:acad:2::1", "Reply from 2001:db8:acad:2::1", "PC-SALLE1 joint R1 dans l'autre salle en IPv6"),
          ck.show(d.p2, "ping 2001:db8:acad:1::1", "Reply from 2001:db8:acad:1::1", "PC-SALLE2 joint R1 dans l'autre salle en IPv6"),
        ],
      },
    ],
  },
];

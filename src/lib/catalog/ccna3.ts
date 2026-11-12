import { F, G, M24, M30, add, cable, ck, host, type CatalogSpec } from "./base";

const cmd = (c: string, desc: string) => ({ cmd: c, desc });

export const CCNA3: CatalogSpec[] = [
  // ---------------------------------------------------------------- 16
  {
    slug: "ccna3-01-ospf",
    title: "OSPF à zone unique entre trois routeurs",
    level: "CCNA 3",
    category: "Routage",
    difficulty: "Avancé",
    minutes: 70,
    summary: "Router-ID, réseaux annoncés en zone 0, interfaces passives et route par défaut propagée par OSPF.",
    context:
      "L'opérateur fictif BéninNet relie ses trois points de présence (Cotonou, Parakou, Djougou) en triangle. Les routes statiques deviennent ingérables : passez à OSPF. R1 (Cotonou) a l'accès à Internet (loopback 8.8.8.8 chez le fournisseur simulée en loopback).",
    objectives: ["Adresser le triangle et les LAN", "Activer OSPF avec un router-id par routeur", "Rendre les interfaces LAN passives", "Propager la route par défaut depuis R1", "Vérifier les voisins et la connectivité"],
    addressing: [
      { device: "R1", iface: "G0/0/0 (LAN)", ip: "172.16.1.1", mask: M24, gw: "router-id 1.1.1.1" },
      { device: "R1", iface: "G0/0/1 → R2", ip: "10.0.12.1", mask: M30, gw: "" },
      { device: "R1", iface: "G0/0/2 → R3", ip: "10.0.13.1", mask: M30, gw: "" },
      { device: "R2", iface: "G0/0/0 (LAN)", ip: "172.16.2.1", mask: M24, gw: "router-id 2.2.2.2" },
      { device: "R2", iface: "G0/0/1 → R1", ip: "10.0.12.2", mask: M30, gw: "" },
      { device: "R2", iface: "G0/0/2 → R3", ip: "10.0.23.1", mask: M30, gw: "" },
      { device: "R3", iface: "G0/0/0 (LAN)", ip: "172.16.3.1", mask: M24, gw: "router-id 3.3.3.3" },
      { device: "R3", iface: "G0/0/1 → R1", ip: "10.0.13.2", mask: M30, gw: "" },
      { device: "R3", iface: "G0/0/2 → R2", ip: "10.0.23.2", mask: M30, gw: "" },
    ],
    tips: ["Masque générique (wildcard) d'un /30 : 0.0.0.3 ; d'un /24 : 0.0.0.255.", "Une interface passive est annoncée mais n'établit pas de voisinage.", "« default-information originate » ne fonctionne que si R1 a lui-même une route par défaut."],
    commands: [
      cmd("router ospf 1", "Activer OSPF"),
      cmd("router-id 1.1.1.1", "Identifiant du routeur"),
      cmd("network 10.0.12.0 0.0.0.3 area 0", "Annoncer un réseau en zone 0"),
      cmd("passive-interface g0/0/0", "Pas de voisin sur le LAN"),
      cmd("default-information originate", "Propager la route par défaut"),
      cmd("show ip ospf neighbor", "Voisins OSPF"),
      cmd("show ip route ospf", "Routes apprises par OSPF"),
    ],
    build(net) {
      const r1 = add(net, "router", 330, 30, "R1");
      const r2 = add(net, "router", 120, 280, "R2");
      const r3 = add(net, "router", 540, 280, "R3");
      const p1 = add(net, "pc", 330, -150, "PC-COTONOU");
      const p2 = add(net, "pc", 120, 460, "PC-PARAKOU");
      const p3 = add(net, "pc", 540, 460, "PC-DJOUGOU");
      cable(net, r1, G("0/0/1"), r2, G("0/0/1"));
      cable(net, r1, G("0/0/2"), r3, G("0/0/1"));
      cable(net, r2, G("0/0/2"), r3, G("0/0/2"));
      cable(net, r1, G("0/0/0"), p1, F("0"));
      cable(net, r2, G("0/0/0"), p2, F("0"));
      cable(net, r3, G("0/0/0"), p3, F("0"));
      host(p1, "172.16.1.10", M24, "172.16.1.1");
      host(p2, "172.16.2.10", M24, "172.16.2.1");
      host(p3, "172.16.3.10", M24, "172.16.3.1");
      r1.loopbacks = [{ name: "Loopback0", mac: r1.ifaces[0].mac, ip: "8.8.8.8", mask: "255.255.255.255", adminUp: true, description: "Internet simulé" }];
      return { r1, r2, r3, p1, p2, p3 };
    },
    steps: [
      {
        title: "Adresser les routeurs",
        body: "Suivez la table d'adressage sur R1, R2 et R3 (trois liaisons /30 et trois LAN /24), et activez toutes les interfaces.",
        checks: (d) => [ck.ip(d.r1, G("0/0/1"), "10.0.12.1", M30), ck.ip(d.r2, G("0/0/2"), "10.0.23.1", M30), ck.ip(d.r3, G("0/0/1"), "10.0.13.2", M30), ck.up(d.r1, G("0/0/0")), ck.up(d.r2, G("0/0/0")), ck.up(d.r3, G("0/0/0"))],
      },
      {
        title: "Activer OSPF",
        body: "Sur chaque routeur : `router ospf 1`, `router-id` (1.1.1.1, 2.2.2.2, 3.3.3.3), puis un `network … area 0` pour chaque réseau connecté. Exemple sur R1 :\n• `network 172.16.1.0 0.0.0.255 area 0`\n• `network 10.0.12.0 0.0.0.3 area 0`\n• `network 10.0.13.0 0.0.0.3 area 0`",
        checks: (d) => [
          ck.show(d.r1, "show ip ospf neighbor", "2\\.2\\.2\\.2[\\s\\S]*FULL|FULL[\\s\\S]*2\\.2\\.2\\.2", "R1 est voisin (FULL) de R2"),
          ck.show(d.r1, "show ip ospf neighbor", "3\\.3\\.3\\.3[\\s\\S]*FULL|FULL[\\s\\S]*3\\.3\\.3\\.3", "R1 est voisin (FULL) de R3"),
          ck.show(d.r2, "show ip ospf neighbor", "3\\.3\\.3\\.3", "R2 est voisin de R3"),
          ck.route(d.r2, "172.16.3.0", M24),
          ck.route(d.r3, "172.16.2.0", M24),
        ],
      },
      {
        title: "Interfaces passives",
        body: "Sur chaque routeur, dans `router ospf 1` : `passive-interface g0/0/0` (le LAN n'a pas de routeur voisin).",
        checks: (d) => [d.r1, d.r2, d.r3].map((r) => ck.show(r, "show running-config", "^ passive-interface GigabitEthernet0/0/0", `${r.hostname} : LAN en interface passive`)),
      },
      {
        title: "Route par défaut propagée",
        body: "1. Sur R1 : `ip route 0.0.0.0 0.0.0.0 loopback 0` (sortie Internet simulée).\n2. Dans `router ospf 1` de R1 : `default-information originate`.\n3. Sur R2 : `show ip route` doit afficher une route `O*E2 0.0.0.0/0`.",
        checks: (d) => [ck.route(d.r2, "0.0.0.0", "0.0.0.0"), ck.route(d.r3, "0.0.0.0", "0.0.0.0")],
      },
      {
        title: "Vérifier de bout en bout",
        body: "1. Depuis PC-PARAKOU : `ping 172.16.3.10` et `ping 8.8.8.8`.\n2. Depuis PC-DJOUGOU : `ping 172.16.1.10`.",
        checks: (d) => [ck.ping(d.p2, "172.16.3.10"), ck.ping(d.p2, "8.8.8.8"), ck.ping(d.p3, "172.16.1.10")],
      },
    ],
  },

  // ---------------------------------------------------------------- 17
  {
    slug: "ccna3-02-acl-standard",
    title: "Filtrer le trafic avec une ACL standard",
    level: "CCNA 3",
    category: "Sécurité réseau",
    difficulty: "Intermédiaire",
    minutes: 45,
    summary: "Interdire au réseau invité l'accès aux serveurs, tout en laissant passer les employés.",
    context:
      "La mairie fictive d'Allada a un réseau Employés, un réseau Invités et un réseau Serveurs, tous sur R1. Les invités ne doivent jamais atteindre les serveurs.",
    objectives: ["Adresser R1 et vérifier que tout communique", "Écrire une ACL standard numérotée", "L'appliquer au bon endroit et dans le bon sens", "Vérifier le filtrage"],
    addressing: [
      { device: "R1", iface: "G0/0/0 (Employés)", ip: "192.168.10.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/1 (Invités)", ip: "192.168.20.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/2 (Serveurs)", ip: "192.168.30.1", mask: M24, gw: "" },
      { device: "PC-EMPLOYE", iface: "NIC", ip: "192.168.10.10", mask: M24, gw: "192.168.10.1" },
      { device: "PC-INVITE", iface: "NIC", ip: "192.168.20.10", mask: M24, gw: "192.168.20.1" },
      { device: "SRV-MAIRIE", iface: "NIC", ip: "192.168.30.10", mask: M24, gw: "192.168.30.1" },
    ],
    tips: ["Une ACL standard ne regarde que la source : placez-la le plus près possible de la destination.", "Toute ACL se termine par un « deny any » implicite : n'oubliez pas « permit any ».", "« show access-lists » montre les correspondances de chaque ligne."],
    commands: [
      cmd("access-list 10 deny 192.168.20.0 0.0.0.255", "Refuser les invités"),
      cmd("access-list 10 permit any", "Autoriser le reste"),
      cmd("interface g0/0/2 → ip access-group 10 out", "Appliquer en sortie vers les serveurs"),
      cmd("show access-lists", "Contenu et compteurs des ACL"),
    ],
    build(net) {
      const r1 = add(net, "router", 330, 40, "R1");
      const e = add(net, "pc", 100, 260, "PC-EMPLOYE");
      const i = add(net, "pc", 330, 300, "PC-INVITE");
      const s = add(net, "pc", 560, 260, "SRV-MAIRIE", "SERVER");
      cable(net, r1, G("0/0/0"), e, F("0"));
      cable(net, r1, G("0/0/1"), i, F("0"));
      cable(net, r1, G("0/0/2"), s, G("0"));
      host(e, "192.168.10.10", M24, "192.168.10.1");
      host(i, "192.168.20.10", M24, "192.168.20.1");
      host(s, "192.168.30.10", M24, "192.168.30.1");
      return { r1, e, i, s };
    },
    steps: [
      {
        title: "Adresser R1",
        body: "Configurez et activez les trois interfaces de R1 selon la table d'adressage. Vérifiez : PC-INVITE peut encore pinguer `192.168.30.10`.",
        checks: (d) => [ck.ip(d.r1, G("0/0/0"), "192.168.10.1", M24), ck.ip(d.r1, G("0/0/1"), "192.168.20.1", M24), ck.ip(d.r1, G("0/0/2"), "192.168.30.1", M24), ck.ping(d.e, "192.168.30.10")],
      },
      {
        title: "Écrire l'ACL",
        body: "`access-list 10 deny 192.168.20.0 0.0.0.255`\n`access-list 10 permit any`",
        checks: (d) => [ck.show(d.r1, "show access-lists", "Standard IP access list 10\\n\\s+10 deny 192\\.168\\.20\\.0, wildcard bits 0\\.0\\.0\\.255\\n\\s+20 permit any", "L'ACL 10 refuse les invités puis autorise le reste")],
      },
      {
        title: "Appliquer l'ACL",
        body: "Au plus près de la destination : `interface g0/0/2` → `ip access-group 10 out`.",
        checks: (d) => [ck.show(d.r1, "show running-config", "^interface GigabitEthernet0/0/2\\n(?: .*\\n)*? ip access-group 10 out", "ACL 10 appliquée en sortie vers les serveurs")],
      },
      {
        title: "Vérifier le filtrage",
        body: "1. PC-INVITE : `ping 192.168.30.10` doit échouer.\n2. PC-EMPLOYE : `ping 192.168.30.10` doit réussir.\n3. PC-INVITE peut toujours joindre les employés (`ping 192.168.10.10`).",
        checks: (d) => [ck.noping(d.i, "192.168.30.10"), ck.ping(d.e, "192.168.30.10"), ck.ping(d.i, "192.168.10.10")],
      },
    ],
  },

  // ---------------------------------------------------------------- 18
  {
    slug: "ccna3-03-acl-etendue",
    title: "ACL étendue nommée : n'autoriser que le web",
    level: "CCNA 3",
    category: "Sécurité réseau",
    difficulty: "Avancé",
    minutes: 55,
    summary: "Laisser passer HTTP et HTTPS vers un serveur, bloquer le ping et le FTP, avec une ACL étendue nommée.",
    context:
      "La boutique en ligne fictive Gbéto Shop héberge son site sur SRV-WEB. Les postes de l'entrepôt doivent seulement pouvoir ouvrir le site (ports 80 et 443) : ni ping, ni FTP vers ce serveur.",
    objectives: ["Adresser R1", "Écrire une ACL étendue nommée", "L'appliquer au plus près de la source", "Vérifier : web autorisé, ping et FTP bloqués"],
    addressing: [
      { device: "R1", iface: "G0/0/0 (Entrepôt)", ip: "10.50.1.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/1 (Serveurs)", ip: "10.50.2.1", mask: M24, gw: "" },
      { device: "PC-ENTREPOT", iface: "NIC", ip: "10.50.1.10", mask: M24, gw: "10.50.1.1" },
      { device: "SRV-WEB", iface: "NIC", ip: "10.50.2.10", mask: M24, gw: "10.50.2.1" },
    ],
    tips: ["Une ACL étendue filtre source, destination, protocole et port : placez-la près de la source.", "Testez le web depuis l'onglet « Navigateur » du PC (http://10.50.2.10).", "Le « deny ip any any » est implicite à la fin de l'ACL."],
    commands: [
      cmd("ip access-list extended WEB-SEUL", "Créer une ACL étendue nommée"),
      cmd("permit tcp 10.50.1.0 0.0.0.255 host 10.50.2.10 eq 80", "Autoriser HTTP"),
      cmd("permit tcp 10.50.1.0 0.0.0.255 host 10.50.2.10 eq 443", "Autoriser HTTPS"),
      cmd("deny ip 10.50.1.0 0.0.0.255 host 10.50.2.10", "Refuser le reste vers le serveur"),
      cmd("permit ip any any", "Laisser passer les autres flux"),
      cmd("ip access-group WEB-SEUL in", "Appliquer en entrée sur G0/0/0"),
    ],
    build(net) {
      const r1 = add(net, "router", 300, 40, "R1");
      const pc = add(net, "pc", 120, 260, "PC-ENTREPOT");
      const srv = add(net, "pc", 480, 260, "SRV-WEB", "SERVER");
      cable(net, r1, G("0/0/0"), pc, F("0"));
      cable(net, r1, G("0/0/1"), srv, G("0"));
      host(pc, "10.50.1.10", M24, "10.50.1.1");
      host(srv, "10.50.2.10", M24, "10.50.2.1");
      return { r1, pc, srv };
    },
    steps: [
      {
        title: "Adresser R1",
        body: "`G0/0/0` : `10.50.1.1/24`, `G0/0/1` : `10.50.2.1/24`, activées. Vérifiez : PC-ENTREPOT pingue SRV-WEB.",
        checks: (d) => [ck.ip(d.r1, G("0/0/0"), "10.50.1.1", M24), ck.ip(d.r1, G("0/0/1"), "10.50.2.1", M24), ck.up(d.r1, G("0/0/1"))],
      },
      {
        title: "Écrire l'ACL étendue",
        body: "`ip access-list extended WEB-SEUL`, puis :\n• `permit tcp 10.50.1.0 0.0.0.255 host 10.50.2.10 eq 80`\n• `permit tcp 10.50.1.0 0.0.0.255 host 10.50.2.10 eq 443`\n• `deny ip 10.50.1.0 0.0.0.255 host 10.50.2.10`\n• `permit ip any any`",
        checks: (d) => [
          ck.show(d.r1, "show access-lists", "Extended IP access list WEB-SEUL[\\s\\S]*permit tcp 10\\.50\\.1\\.0 0\\.0\\.0\\.255 host 10\\.50\\.2\\.10 eq www", "WEB-SEUL autorise HTTP"),
          ck.show(d.r1, "show access-lists", "Extended IP access list WEB-SEUL[\\s\\S]*permit tcp 10\\.50\\.1\\.0 0\\.0\\.0\\.255 host 10\\.50\\.2\\.10 eq 443", "WEB-SEUL autorise HTTPS"),
        ],
      },
      {
        title: "Appliquer près de la source",
        body: "`interface g0/0/0` → `ip access-group WEB-SEUL in`.",
        checks: (d) => [ck.show(d.r1, "show running-config", "^interface GigabitEthernet0/0/0\\n(?: .*\\n)*? ip access-group WEB-SEUL in", "WEB-SEUL appliquée en entrée sur G0/0/0")],
      },
      {
        title: "Vérifier",
        body: "1. Navigateur de PC-ENTREPOT : `http://10.50.2.10` et `https://10.50.2.10` s'ouvrent.\n2. `ping 10.50.2.10` échoue.\n3. Le FTP (port 21) est bloqué.",
        checks: (d) => [ck.tcp(d.pc, "10.50.2.10", 80, true), ck.tcp(d.pc, "10.50.2.10", 443, true), ck.noping(d.pc, "10.50.2.10"), ck.tcp(d.pc, "10.50.2.10", 21, false)],
      },
    ],
  },

  // ---------------------------------------------------------------- 19
  {
    slug: "ccna3-04-nat-pat",
    title: "Accès Internet avec PAT et publication d'un serveur en NAT statique",
    level: "CCNA 3",
    category: "Services IP",
    difficulty: "Avancé",
    minutes: 60,
    summary: "Faire sortir tout le LAN derrière une seule adresse publique, et rendre un serveur interne joignable depuis Internet.",
    context:
      "La PME fictive Kpayo Solutions reçoit de son fournisseur l'adresse publique 203.0.113.2 et le bloc 198.51.100.0/24 pour ses serveurs. Le serveur interne SRV-WEB doit être joignable de l'extérieur sous 198.51.100.10.",
    objectives: ["Adresser R1 (inside / outside)", "Configurer le PAT (overload) pour le LAN", "Publier le serveur en NAT statique", "Vérifier les traductions"],
    addressing: [
      { device: "R1", iface: "G0/0/0 (LAN, inside)", ip: "192.168.1.1", mask: M24, gw: "" },
      { device: "R1", iface: "G0/0/2 (FAI, outside)", ip: "203.0.113.2", mask: M30, gw: "" },
      { device: "R-FAI", iface: "G0/0/2", ip: "203.0.113.1", mask: M30, gw: "Loopback 8.8.8.8" },
      { device: "PC-BUREAU", iface: "NIC", ip: "192.168.1.10", mask: M24, gw: "192.168.1.1" },
      { device: "SRV-WEB", iface: "NIC", ip: "192.168.1.100", mask: M24, gw: "192.168.1.1 · public 198.51.100.10" },
    ],
    tips: ["Le fournisseur ne connaît pas vos adresses privées : sans NAT, les réponses ne reviennent jamais.", "« overload » permet à tout le LAN de partager l'adresse de G0/0/2.", "« show ip nat translations » montre les traductions en cours."],
    commands: [
      cmd("ip nat inside / ip nat outside", "Rôle de chaque interface"),
      cmd("access-list 1 permit 192.168.1.0 0.0.0.255", "Adresses à traduire"),
      cmd("ip nat inside source list 1 interface g0/0/2 overload", "PAT"),
      cmd("ip nat inside source static 192.168.1.100 198.51.100.10", "NAT statique du serveur"),
      cmd("ip route 0.0.0.0 0.0.0.0 203.0.113.1", "Route par défaut vers le FAI"),
      cmd("show ip nat translations", "Traductions"),
    ],
    build(net) {
      const fai = add(net, "router", 560, 40, "R-FAI");
      const r1 = add(net, "router", 300, 40, "R1");
      const s1 = add(net, "switch", 300, 220, "S1");
      const pc = add(net, "pc", 160, 400, "PC-BUREAU");
      const srv = add(net, "pc", 440, 400, "SRV-WEB", "SERVER");
      cable(net, r1, G("0/0/2"), fai, G("0/0/2"));
      cable(net, r1, G("0/0/0"), s1, G("0/1"));
      cable(net, s1, F("0/1"), pc, F("0"));
      cable(net, s1, F("0/2"), srv, G("0"));
      host(pc, "192.168.1.10", M24, "192.168.1.1");
      host(srv, "192.168.1.100", M24, "192.168.1.1");
      const f = fai.ifaces.find((x) => x.name === G("0/0/2"))!;
      f.ip = "203.0.113.1";
      f.mask = M30;
      f.adminUp = true;
      fai.loopbacks = [{ name: "Loopback0", mac: f.mac, ip: "8.8.8.8", mask: "255.255.255.255", adminUp: true, description: "Internet" }];
      fai.routes = [{ network: "198.51.100.0", mask: M24, nextHop: "203.0.113.2" }];
      return { fai, r1, pc, srv };
    },
    steps: [
      {
        title: "Adresser R1",
        body: "1. `G0/0/0` : `192.168.1.1/24` ; `G0/0/2` : `203.0.113.2 255.255.255.252`. Activez-les.\n2. `ip route 0.0.0.0 0.0.0.0 203.0.113.1`.\n3. Essayez `ping 8.8.8.8` depuis PC-BUREAU : il échoue (pas encore de NAT).",
        checks: (d) => [ck.ip(d.r1, G("0/0/0"), "192.168.1.1", M24), ck.ip(d.r1, G("0/0/2"), "203.0.113.2", M30), ck.route(d.r1, "0.0.0.0", "0.0.0.0")],
      },
      {
        title: "Configurer le PAT",
        body: "1. `G0/0/0` : `ip nat inside` ; `G0/0/2` : `ip nat outside`.\n2. `access-list 1 permit 192.168.1.0 0.0.0.255`.\n3. `ip nat inside source list 1 interface g0/0/2 overload`.",
        checks: (d) => [
          ck.show(d.r1, "show running-config", "^ip nat inside source list 1 interface GigabitEthernet0/0/2 overload", "PAT configuré sur G0/0/2"),
          ck.show(d.r1, "show running-config", "^interface GigabitEthernet0/0/0\\n(?: .*\\n)*? ip nat inside", "G0/0/0 est inside"),
          ck.show(d.r1, "show running-config", "^interface GigabitEthernet0/0/2\\n(?: .*\\n)*? ip nat outside", "G0/0/2 est outside"),
          ck.ping(d.pc, "8.8.8.8"),
        ],
      },
      {
        title: "Publier le serveur",
        body: "`ip nat inside source static 192.168.1.100 198.51.100.10`. Le fournisseur a déjà une route vers 198.51.100.0/24.",
        checks: (d) => [ck.show(d.r1, "show ip nat translations", "198\\.51\\.100\\.10\\s+192\\.168\\.1\\.100", "Traduction statique 198.51.100.10 ↔ 192.168.1.100"), ck.ping(d.fai, "198.51.100.10")],
      },
      {
        title: "Vérifier les traductions",
        body: "1. Depuis PC-BUREAU : `ping 8.8.8.8`.\n2. Sur R1 : `show ip nat translations` montre les traductions PAT (adresse 203.0.113.2) et la traduction statique.",
        checks: (d) => [ck.ping(d.srv, "8.8.8.8"), ck.tcp(d.fai, "198.51.100.10", 80, true)],
      },
    ],
  },

  // ---------------------------------------------------------------- 20
  {
    slug: "ccna3-05-supervision",
    title: "Supervision du réseau : NTP, Syslog et SNMP",
    level: "CCNA 3",
    category: "Supervision",
    difficulty: "Intermédiaire",
    minutes: 45,
    summary: "Synchroniser l'heure, centraliser les journaux et préparer la supervision SNMP.",
    context:
      "Le centre de données fictif d'Akpakpa veut pouvoir analyser les incidents. Pour cela, tous les équipements doivent être à la même heure, envoyer leurs journaux au serveur SRV-LOGS et être interrogeables en SNMP.",
    objectives: ["Faire de R1 la référence de temps (NTP)", "Synchroniser S1 sur R1", "Envoyer les journaux vers SRV-LOGS", "Configurer une communauté SNMP en lecture seule"],
    addressing: [
      { device: "R1", iface: "G0/0/1", ip: "10.99.0.1", mask: M24, gw: "maître NTP" },
      { device: "S1", iface: "VLAN 1", ip: "10.99.0.2", mask: M24, gw: "10.99.0.1" },
      { device: "SRV-LOGS", iface: "NIC", ip: "10.99.0.50", mask: M24, gw: "10.99.0.1" },
    ],
    tips: ["« ntp master 3 » fait de R1 une horloge de référence (strate 3).", "Les journaux sont envoyés au serveur avec « logging host ».", "Choisissez une communauté SNMP difficile à deviner et en lecture seule (ro)."],
    commands: [
      cmd("ntp master 3", "Horloge de référence"),
      cmd("ntp server 10.99.0.1", "Se synchroniser sur R1"),
      cmd("logging host 10.99.0.50", "Serveur Syslog"),
      cmd("snmp-server community Akp@Sup-ro ro", "Communauté SNMP en lecture"),
      cmd("show ntp status", "État de la synchronisation"),
      cmd("show logging", "Configuration et journal"),
    ],
    build(net) {
      const r1 = add(net, "router", 300, 40, "R1");
      const s1 = add(net, "switch", 300, 220, "S1");
      const srv = add(net, "pc", 300, 400, "SRV-LOGS", "SERVER");
      cable(net, r1, G("0/0/1"), s1, G("0/1"));
      cable(net, s1, F("0/1"), srv, G("0"));
      host(srv, "10.99.0.50", M24, "10.99.0.1");
      return { r1, s1, srv };
    },
    steps: [
      {
        title: "Adresser R1 et S1",
        body: "1. R1 `G0/0/1` : `10.99.0.1/24`, activée.\n2. S1 `interface vlan 1` : `10.99.0.2/24`, activée, et `ip default-gateway 10.99.0.1`.",
        checks: (d) => [ck.ip(d.r1, G("0/0/1"), "10.99.0.1", M24), ck.ip(d.s1, "Vlan1", "10.99.0.2", M24), ck.ping(d.srv, "10.99.0.2")],
      },
      {
        title: "Synchroniser l'heure (NTP)",
        body: "1. R1 : `ntp master 3`.\n2. S1 : `ntp server 10.99.0.1`.\n3. Vérifiez avec `show ntp status` sur S1.",
        checks: (d) => [ck.show(d.r1, "show running-config", "^ntp master", "R1 est une horloge de référence"), ck.show(d.s1, "show ntp status", "Clock is synchronized", "S1 est synchronisé")],
      },
      {
        title: "Centraliser les journaux",
        body: "Sur R1 et S1 : `logging host 10.99.0.50`.",
        checks: (d) => [ck.show(d.r1, "show running-config", "^logging host 10\\.99\\.0\\.50", "R1 envoie ses journaux à SRV-LOGS"), ck.show(d.s1, "show running-config", "^logging host 10\\.99\\.0\\.50", "S1 envoie ses journaux à SRV-LOGS")],
      },
      {
        title: "Préparer SNMP",
        body: "Sur R1 et S1 : `snmp-server community Akp@Sup-ro ro`.",
        checks: (d) => [ck.show(d.r1, "show running-config", "^snmp-server community \\S+ (ro|RO)", "R1 : communauté SNMP en lecture seule"), ck.show(d.s1, "show running-config", "^snmp-server community \\S+ (ro|RO)", "S1 : communauté SNMP en lecture seule")],
      },
    ],
  },
];

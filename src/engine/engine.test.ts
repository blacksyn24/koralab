import { describe, expect, it } from "vitest";
import { IosCli } from "./cli/ios";
import { PcCli } from "./cli/pc";
import { Network } from "./network";

/** Tape une suite de commandes et renvoie les sorties. */
function type(cli: IosCli | PcCli, ...lines: string[]) {
  return lines.map((l) => cli.exec(l));
}

/** Reproduit le TP 01 Kora Logistique (routeur + 2 LAN). */
function kora() {
  const net = new Network();
  const r1 = net.addDevice("router");
  const s1 = net.addDevice("switch");
  const s2 = net.addDevice("switch");
  const pc1 = net.addDevice("pc");
  const pc3 = net.addDevice("pc");
  net.connect(r1.id, s1.id); // Gi0/0/0 <-> Gi0/1
  net.connect(r1.id, s2.id); // Gi0/0/1 <-> Gi0/1
  net.connect(s1.id, pc1.id); // Fa0/1
  net.connect(s2.id, pc3.id); // Fa0/1
  const cli = new IosCli(net, r1);
  type(
    cli,
    "en",
    "conf t",
    "hostname R1-KORA",
    "int g0/0/0",
    "ip add 192.168.50.1 255.255.255.128",
    "no shut",
    "int g0/0/1",
    "ip address 192.168.50.129 255.255.255.192",
    "no shutdown",
    "end"
  );
  new PcCli(net, pc1).exec("ip 192.168.50.10 255.255.255.128 192.168.50.1");
  new PcCli(net, pc3).exec("ip 192.168.50.140/26 192.168.50.129");
  return { net, r1, s1, s2, pc1, pc3, cli };
}

describe("Moteur réseau", () => {
  it("les interfaces de routeur sont éteintes par défaut", () => {
    const net = new Network();
    const r = net.addDevice("router");
    expect(r.ifaces.every((i) => !i.adminUp)).toBe(true);
  });

  it("ping entre deux LAN à travers le routeur, premier paquet perdu (ARP)", () => {
    const { net, pc1 } = kora();
    const res = net.ping(pc1, "192.168.50.140", 5);
    expect(res[0].ok).toBe(false); // le routeur jette le 1er paquet le temps de l'ARP
    expect(res.slice(1).every((r) => r.ok)).toBe(true); // le PC, lui, attend sa réponse ARP
    // un routeur traversé : TTL 128 - 1
    expect(res.at(-1)?.ttl).toBe(127);
  });

  it("sans passerelle, le PC ne joint pas l'autre réseau", () => {
    const { net, pc1 } = kora();
    pc1.gateway = undefined;
    expect(net.ping(pc1, "192.168.50.140").some((r) => r.ok)).toBe(false);
  });

  it("interface en shutdown = plus de communication", () => {
    const { net, pc1, cli } = kora();
    type(cli, "conf t", "int g0/0/1", "shutdown", "end");
    expect(net.ping(pc1, "192.168.50.140").some((r) => r.ok)).toBe(false);
  });

  it("le switch apprend les adresses MAC", () => {
    const { net, pc1, s1 } = kora();
    net.ping(pc1, "192.168.50.1");
    expect(net.macTable(s1).length).toBeGreaterThanOrEqual(2);
  });

  it("traceroute montre le routeur puis la destination", () => {
    const { net, pc1 } = kora();
    expect(net.traceroute(pc1, "192.168.50.140")).toEqual(["192.168.50.1", "192.168.50.140"]);
  });

  it("le switch répond au ping sur son SVI et utilise sa passerelle", () => {
    const { net, s1, pc3 } = kora();
    const sw = new IosCli(net, s1);
    type(sw, "enable", "configure terminal", "interface vlan 1", "ip address 192.168.50.2 255.255.255.128", "no shutdown", "exit", "ip default-gateway 192.168.50.1", "end");
    expect(net.ping(pc3, "192.168.50.2").filter((r) => r.ok).length).toBeGreaterThanOrEqual(3);
  });

  it("routage statique entre deux routeurs", () => {
    const net = new Network();
    const r1 = net.addDevice("router");
    const r2 = net.addDevice("router");
    const pc1 = net.addDevice("pc");
    const pc2 = net.addDevice("pc");
    net.connect(r1.id, pc1.id); // r1 g0/0/0
    net.connect(r1.id, r2.id); // r1 g0/0/1 <-> r2 g0/0/0
    net.connect(r2.id, pc2.id); // r2 g0/0/1
    type(new IosCli(net, r1), "en", "conf t", "int g0/0/0", "ip add 10.1.1.1 255.255.255.0", "no sh", "int g0/0/1", "ip add 10.0.0.1 255.255.255.252", "no sh", "exit", "ip route 10.2.2.0 255.255.255.0 10.0.0.2", "end");
    type(new IosCli(net, r2), "en", "conf t", "int g0/0/0", "ip add 10.0.0.2 255.255.255.252", "no sh", "int g0/0/1", "ip add 10.2.2.1 255.255.255.0", "no sh", "exit", "ip route 10.1.1.0 255.255.255.0 10.0.0.1", "end");
    new PcCli(net, pc1).exec("ip 10.1.1.10/24 10.1.1.1");
    new PcCli(net, pc2).exec("ip 10.2.2.10/24 10.2.2.1");
    const res = net.ping(pc1, "10.2.2.10", 6);
    expect(res.slice(-2).every((r) => r.ok)).toBe(true);
    expect(res.at(-1)?.ttl).toBe(126); // deux routeurs traversés
  });
});

describe("Interpréteur de commandes", () => {
  it("prompts et modes", () => {
    const net = new Network();
    const cli = new IosCli(net, net.addDevice("router"));
    expect(cli.prompt()).toBe("R1>");
    cli.exec("enable");
    expect(cli.prompt()).toBe("R1#");
    cli.exec("conf t");
    expect(cli.prompt()).toBe("R1(config)#");
    cli.exec("int gig0/0/0");
    expect(cli.prompt()).toBe("R1(config-if)#");
    cli.exec("end");
    expect(cli.prompt()).toBe("R1#");
  });

  it("commande ambiguë, inconnue et incomplète", () => {
    const net = new Network();
    const cli = new IosCli(net, net.addDevice("router"));
    cli.exec("en");
    expect(cli.exec("c")).toContain("Ambiguous"); // configure / copy
    expect(cli.exec("show ip blabla")).toContain("Invalid input");
    expect(cli.exec("show ip")).toContain("Incomplete");
    expect(cli.exec("xyz")).toContain("Unknown command");
  });

  it("show ip interface brief abrégé", () => {
    const { cli } = kora();
    const out = cli.exec("sh ip int br");
    expect(out).toMatch(/GigabitEthernet0\/0\/0\s+192\.168\.50\.1\s+YES manual up\s+up/);
    expect(out).toMatch(/GigabitEthernet0\/0\/2\s+unassigned\s+YES unset\s+administratively down/);
  });

  it("show ip route affiche les routes C et L", () => {
    const { cli } = kora();
    const out = cli.exec("show ip route");
    expect(out).toContain("C        192.168.50.0/25 is directly connected, GigabitEthernet0/0/0");
    expect(out).toContain("L        192.168.50.1/32 is directly connected, GigabitEthernet0/0/0");
  });

  it("ping depuis le routeur : .!!!!", () => {
    const { cli } = kora();
    expect(cli.exec("ping 192.168.50.10")).toContain(".!!!!");
  });

  it("aide « ? » et complétion Tab", () => {
    const net = new Network();
    const cli = new IosCli(net, net.addDevice("router"));
    cli.exec("enable");
    expect(cli.exec("show ?")).toContain("running-config");
    expect(cli.complete("conf")).toBe("configure ");
    expect(cli.complete("sh ip int")).toBe("sh ip interface ");
  });

  it("running-config et sauvegarde", () => {
    const { cli } = kora();
    type(cli, "conf t", "enable secret Kora@Enable26", "service password-encryption", "line con 0", "password Kora@Cons26", "login", "end");
    const run = cli.exec("show run");
    expect(run).toContain("hostname R1-KORA");
    expect(run).toContain("enable secret 5 ");
    expect(run).not.toContain("Kora@Enable26");
    expect(run).toContain("line con 0");
    expect(cli.exec("copy running-config startup-config")).toContain("[OK]");
    expect(cli.exec("show startup-config")).toContain("hostname R1-KORA");
  });

  it("crypto key demande un nom de domaine", () => {
    const net = new Network();
    const cli = new IosCli(net, net.addDevice("router"));
    type(cli, "en", "conf t");
    expect(cli.exec("crypto key generate rsa general-keys modulus 2048")).toContain("domain-name");
    cli.exec("ip domain-name koralog.bj");
    expect(cli.exec("crypto key generate rsa general-keys modulus 2048")).toContain("R1.koralog.bj");
  });

  it("sauvegarde et rechargement JSON", () => {
    const { net } = kora();
    const copy = Network.fromJSON(JSON.parse(JSON.stringify(net.toJSON())));
    const pc = copy.devices.find((d) => d.hostname === "PC1")!;
    expect(copy.ping(pc, "192.168.50.140").some((r) => r.ok)).toBe(true);
  });
});

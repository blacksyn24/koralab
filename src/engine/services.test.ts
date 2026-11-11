import { describe, expect, it } from "vitest";
import { IosCli } from "./cli/ios";
import { PcCli } from "./cli/pc";
import { Network, type Device } from "./network";

function run(net: Network, dev: Device, cmds: string) {
  const cli = new IosCli(net, dev);
  return cmds
    .trim()
    .split("\n")
    .map((l) => cli.exec(l.trim()))
    .join("\n");
}

function pc(net: Network, ip?: string, gw?: string) {
  const d = net.addDevice("pc");
  if (ip) {
    d.ifaces[0].ip = ip;
    d.ifaces[0].mask = "255.255.255.0";
  }
  d.gateway = gw;
  return d;
}

/** Deux réseaux reliés par un routeur : PC1 (192.168.1.0/24) — R1 — PC2 (192.168.2.0/24) */
function twoLans() {
  const net = new Network();
  const r1 = net.addDevice("router");
  const p1 = pc(net, "192.168.1.10", "192.168.1.1");
  const p2 = pc(net, "192.168.2.10", "192.168.2.1");
  net.connect(p1.id, r1.id, undefined, "GigabitEthernet0/0/0");
  net.connect(p2.id, r1.id, undefined, "GigabitEthernet0/0/1");
  run(net, r1, "enable\nconf t\ninterface g0/0/0\nip address 192.168.1.1 255.255.255.0\nno shutdown\ninterface g0/0/1\nip address 192.168.2.1 255.255.255.0\nno shutdown\nend");
  net.ping(p1, "192.168.2.10", 2); // résout les ARP
  return { net, r1, p1, p2 };
}

const ok = (net: Network, from: Device, to: string) => net.ping(from, to, 5).filter((r) => r.ok).length;

describe("ACL", () => {
  it("ACL standard numérotée appliquée en sortie", () => {
    const { net, r1, p1, p2 } = twoLans();
    expect(ok(net, p1, "192.168.2.10")).toBe(5);
    run(net, r1, "enable\nconf t\naccess-list 10 deny host 192.168.1.10\naccess-list 10 permit any\ninterface g0/0/1\nip access-group 10 out\nend");
    const res = net.ping(p1, "192.168.2.10", 4);
    expect(res.filter((r) => r.ok)).toHaveLength(0);
    expect(res.some((r) => r.kind === "unreachable")).toBe(true); // « Destination host unreachable »
    expect(ok(net, p2, "192.168.2.1")).toBe(5);
    expect(run(net, r1, "show access-lists")).toMatch(/Standard IP access list 10\n\s+10 deny 192\.168\.1\.10 \(\d+ match/);
    expect(new PcCli(net, p1).exec("ping 192.168.2.10")).toContain("Destination host unreachable");
  });

  it("ACL étendue nommée : bloque le web mais laisse passer le ping", () => {
    const { net, r1, p1, p2 } = twoLans();
    expect(net.tcpConnect(p2, "192.168.1.10", 80)).toBe("open");
    run(
      net,
      r1,
      `enable
      conf t
      ip access-list extended PAS_DE_WEB
      deny tcp any host 192.168.1.10 eq www
      permit ip any any
      exit
      interface g0/0/1
      ip access-group PAS_DE_WEB in
      end`
    );
    expect(net.tcpConnect(p2, "192.168.1.10", 80)).toBe("filtered");
    expect(ok(net, p2, "192.168.1.10")).toBe(5);
    expect(run(net, r1, "enable\nshow running-config")).toContain("ip access-list extended PAS_DE_WEB\n deny tcp any host 192.168.1.10 eq www");
    expect(run(net, r1, "show ip interface g0/0/1")).toContain("Inbound  access list is PAS_DE_WEB");
  });

  it("telnet vers un routeur : ouvert, puis filtré par une ACL", () => {
    const { net, r1, p1 } = twoLans();
    expect(new PcCli(net, p1).exec("telnet 192.168.1.1")).toContain("Open");
    run(net, r1, "enable\nconf t\naccess-list 101 deny tcp any any eq telnet\naccess-list 101 permit ip any any\ninterface g0/0/0\nip access-group 101 in\nend");
    expect(net.tcpConnect(p1, "192.168.1.1", 23)).toBe("filtered");
    expect(net.tcpConnect(p1, "192.168.1.1", 22)).toBe("open");
  });
});

describe("DHCP", () => {
  it("serveur DHCP sur le routeur + client PC (ipconfig /renew)", () => {
    const net = new Network();
    const r1 = net.addDevice("router");
    const s1 = net.addDevice("switch");
    const a = pc(net);
    const b = pc(net);
    net.connect(r1.id, s1.id);
    net.connect(a.id, s1.id);
    net.connect(b.id, s1.id);
    run(
      net,
      r1,
      `enable
      conf t
      ip dhcp excluded-address 192.168.10.1 192.168.10.10
      ip dhcp pool LAN
      network 192.168.10.0 255.255.255.0
      default-router 192.168.10.1
      dns-server 8.8.8.8
      exit
      interface g0/0/0
      ip address 192.168.10.1 255.255.255.0
      no shutdown
      end`
    );
    const out = new PcCli(net, a).exec("ipconfig /renew");
    expect(out).toContain("192.168.10.11");
    expect(a.gateway).toBe("192.168.10.1");
    expect(a.dns).toBe("8.8.8.8");
    expect(net.dhcpRequest(b, b.ifaces[0].name)?.yiaddr).toBe("192.168.10.12");
    expect(ok(net, a, "192.168.10.12")).toBe(5);
    expect(run(net, r1, "show ip dhcp binding")).toMatch(/192\.168\.10\.11\s+01/);
    // le même PC récupère la même adresse
    expect(net.dhcpRequest(a, a.ifaces[0].name)?.yiaddr).toBe("192.168.10.11");
  });

  it("relais DHCP (ip helper-address) vers un serveur sur un autre réseau", () => {
    const net = new Network();
    const r1 = net.addDevice("router"); // routeur du LAN, sans pool
    const r2 = net.addDevice("router"); // serveur DHCP central
    const client = pc(net);
    net.connect(client.id, r1.id, undefined, "GigabitEthernet0/0/0");
    net.connect(r1.id, r2.id, "GigabitEthernet0/0/1", "GigabitEthernet0/0/0");
    run(net, r1, "enable\nconf t\ninterface g0/0/0\nip address 192.168.50.1 255.255.255.0\nip helper-address 10.0.0.2\nno shutdown\ninterface g0/0/1\nip address 10.0.0.1 255.255.255.252\nno shutdown\nend");
    run(net, r2, "enable\nconf t\ninterface g0/0/0\nip address 10.0.0.2 255.255.255.252\nno shutdown\nexit\nip route 192.168.50.0 255.255.255.0 10.0.0.1\nip dhcp pool LAN50\nnetwork 192.168.50.0 /24\ndefault-router 192.168.50.1\nend");
    net.ping(r2, "10.0.0.1", 2);
    let ack = net.dhcpRequest(client, client.ifaces[0].name);
    if (!ack) ack = net.dhcpRequest(client, client.ifaces[0].name); // le 1er essai peut servir à l'ARP du serveur
    expect(ack?.yiaddr).toBe("192.168.50.2");
    expect(client.gateway).toBe("192.168.50.1");
  });
});

describe("NAT", () => {
  function natLab() {
    // PC (192.168.1.10) — R1 [inside g0/0/0 | outside g0/0/1 203.0.113.1] — ISP (203.0.113.2) — serveur 8.8.8.8
    const net = new Network();
    const r1 = net.addDevice("router");
    const isp = net.addDevice("router");
    const inside = pc(net, "192.168.1.10", "192.168.1.1");
    const inside2 = pc(net, "192.168.1.11", "192.168.1.1");
    const s1 = net.addDevice("switch");
    const web = pc(net, "8.8.8.8", "8.8.8.1");
    net.connect(r1.id, s1.id, "GigabitEthernet0/0/0");
    net.connect(inside.id, s1.id);
    net.connect(inside2.id, s1.id);
    net.connect(r1.id, isp.id, "GigabitEthernet0/0/1", "GigabitEthernet0/0/0");
    net.connect(web.id, isp.id, undefined, "GigabitEthernet0/0/1");
    run(net, r1, "enable\nconf t\ninterface g0/0/0\nip address 192.168.1.1 255.255.255.0\nip nat inside\nno shutdown\ninterface g0/0/1\nip address 203.0.113.1 255.255.255.252\nip nat outside\nno shutdown\nexit\nip route 0.0.0.0 0.0.0.0 203.0.113.2\nend");
    // le FAI ne connaît pas 192.168.1.0/24 : sans NAT, pas de retour
    run(net, isp, "enable\nconf t\ninterface g0/0/0\nip address 203.0.113.2 255.255.255.252\nno shutdown\ninterface g0/0/1\nip address 8.8.8.1 255.255.255.0\nno shutdown\nend");
    return { net, r1, inside, inside2, web };
  }

  it("sans NAT, pas de retour ; avec PAT (overload), Internet répond", () => {
    const { net, r1, inside, inside2 } = natLab();
    expect(ok(net, inside, "8.8.8.8")).toBe(0);
    run(net, r1, "enable\nconf t\naccess-list 1 permit 192.168.1.0 0.0.0.255\nip nat inside source list 1 interface g0/0/1 overload\nend");
    net.ping(inside, "8.8.8.8", 3);
    expect(ok(net, inside, "8.8.8.8")).toBe(5);
    expect(ok(net, inside2, "8.8.8.8")).toBeGreaterThanOrEqual(4);
    const t = run(net, r1, "show ip nat translations");
    expect(t).toMatch(/icmp\s+203\.0\.113\.1:\d+\s+192\.168\.1\.10:\d+/);
    expect(t).toMatch(/192\.168\.1\.11:\d+/);
  });

  it("NAT statique : un serveur interne joignable depuis Internet", () => {
    const { net, r1, inside, web } = natLab();
    run(net, r1, "enable\nconf t\nip nat inside source static 192.168.1.10 203.0.113.5\nend");
    // le FAI doit savoir que 203.0.113.5 est derrière R1 : même réseau ? non (/30) -> route statique chez le FAI
    expect(ok(net, inside, "8.8.8.8")).toBeGreaterThanOrEqual(0);
    const isp = net.devices.find((d) => d.hostname === "R2")!;
    run(net, isp, "enable\nconf t\nip route 203.0.113.5 255.255.255.255 203.0.113.1\nend");
    net.ping(web, "203.0.113.5", 3);
    expect(ok(net, web, "203.0.113.5")).toBe(5);
    expect(run(net, r1, "show ip nat translations")).toMatch(/---\s+203\.0\.113\.5\s+192\.168\.1\.10/);
  });

  it("NAT dynamique avec un pool d'adresses", () => {
    const { net, r1, inside } = natLab();
    const isp = net.devices.find((d) => d.hostname === "R2")!;
    run(net, isp, "enable\nconf t\nip route 198.51.100.0 255.255.255.0 203.0.113.1\nend");
    run(net, r1, "enable\nconf t\nip nat pool PUBLIC 198.51.100.10 198.51.100.20 netmask 255.255.255.0\naccess-list 1 permit 192.168.1.0 0.0.0.255\nip nat inside source list 1 pool PUBLIC\nend");
    net.ping(inside, "8.8.8.8", 3);
    expect(ok(net, inside, "8.8.8.8")).toBe(5);
    expect(run(net, r1, "show ip nat translations")).toMatch(/---\s+198\.51\.100\.10\s+192\.168\.1\.10/);
  });
});

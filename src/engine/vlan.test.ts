import { describe, expect, it } from "vitest";
import { IosCli } from "./cli/ios";
import { Network, type Device } from "./network";

/** Tape une suite de commandes sur un équipement et renvoie toutes les sorties. */
function run(net: Network, dev: Device, cmds: string) {
  const cli = new IosCli(net, dev);
  return cmds
    .trim()
    .split("\n")
    .map((l) => cli.exec(l.trim()))
    .join("\n");
}

function pc(net: Network, ip: string, gw?: string) {
  const d = net.addDevice("pc");
  d.ifaces[0].ip = ip;
  d.ifaces[0].mask = "255.255.255.0";
  d.gateway = gw;
  return d;
}

const okPings = (net: Network, from: Device, to: string) => net.ping(from, to, 5).filter((r) => r.ok).length;

describe("VLAN et trunks 802.1Q", () => {
  it("isole les VLAN et les transporte sur un trunk entre deux switchs", () => {
    const net = new Network();
    const s1 = net.addDevice("switch");
    const s2 = net.addDevice("switch", 0, 0, "KS-48");
    expect(s2.ifaces).toHaveLength(50);
    const a10 = pc(net, "192.168.10.1");
    const b10 = pc(net, "192.168.10.2");
    const a20 = pc(net, "192.168.10.3"); // même réseau IP mais VLAN différent
    net.connect(s1.id, s2.id, "GigabitEthernet0/1", "GigabitEthernet0/1");
    net.connect(a10.id, s1.id, undefined, "FastEthernet0/1");
    net.connect(a20.id, s1.id, undefined, "FastEthernet0/2");
    net.connect(b10.id, s2.id, undefined, "FastEthernet0/1");
    const cfg = `enable
      conf t
      vlan 10
      name VENTES
      vlan 20
      name RH
      exit
      interface fa0/1
      switchport mode access
      switchport access vlan 10
      interface fa0/2
      switchport mode access
      switchport access vlan 20
      interface g0/1
      switchport mode trunk
      end`;
    run(net, s1, cfg);
    // sans trunk configuré en face : auto <-> trunk => trunk (DTP)
    run(net, s2, "enable\nconf t\nvlan 10\ninterface fa0/1\nswitchport access vlan 10\nend");
    expect(okPings(net, a10, "192.168.10.2")).toBe(5);
    expect(okPings(net, a20, "192.168.10.2")).toBe(0);
    const brief = run(net, s1, "show vlan brief");
    expect(brief).toMatch(/10\s+VENTES\s+active\s+Fa0\/1/);
    expect(brief).toMatch(/20\s+RH\s+active\s+Fa0\/2/);
    expect(run(net, s1, "show interfaces trunk")).toMatch(/Gi0\/1\s+on\s+802\.1q\s+trunking\s+1/);
    expect(run(net, s1, "show mac address-table")).toMatch(/\s+10\s+\S+\s+DYNAMIC\s+Fa0\/1/);
  });

  it("refuse le VLAN quand il n'est pas autorisé sur le trunk", () => {
    const net = new Network();
    const s1 = net.addDevice("switch");
    const s2 = net.addDevice("switch");
    const a = pc(net, "10.0.0.1");
    const b = pc(net, "10.0.0.2");
    net.connect(s1.id, s2.id);
    net.connect(a.id, s1.id);
    net.connect(b.id, s2.id);
    for (const s of [s1, s2]) run(net, s, "enable\nconf t\nvlan 10\ninterface fa0/1\nswitchport access vlan 10\ninterface g0/1\nswitchport mode trunk\nswitchport trunk allowed vlan 1,20\nend");
    expect(okPings(net, a, "10.0.0.2")).toBe(0);
    run(net, s1, "enable\nconf t\ninterface g0/1\nswitchport trunk allowed vlan add 10\nend");
    run(net, s2, "enable\nconf t\ninterface g0/1\nswitchport trunk allowed vlan add 10\nend");
    expect(okPings(net, a, "10.0.0.2")).toBe(5);
  });

  it("négocie le trunk avec DTP : auto + auto = accès, desirable + auto = trunk", () => {
    const net = new Network();
    const s1 = net.addDevice("switch");
    const s2 = net.addDevice("switch");
    net.connect(s1.id, s2.id);
    const p1 = s1.ifaces.find((i) => i.name === "GigabitEthernet0/1")!;
    expect(net.opMode(s1, p1)).toBe("access");
    run(net, s1, "enable\nconf t\ninterface g0/1\nswitchport mode dynamic desirable\nend");
    expect(net.opMode(s1, p1)).toBe("trunk");
  });

  it("crée automatiquement le VLAN d'accès manquant", () => {
    const net = new Network();
    const s1 = net.addDevice("switch");
    expect(run(net, s1, "enable\nconf t\ninterface range fa0/1 - 4\nswitchport mode access\nswitchport access vlan 30")).toContain("Creating vlan 30");
    expect(s1.ifaces.slice(0, 4).every((i) => i.accessVlan === 30)).toBe(true);
    expect(s1.ifaces[4].accessVlan).toBeUndefined();
  });
});

describe("Routage inter-VLAN", () => {
  it("router-on-a-stick : sous-interfaces 802.1Q", () => {
    const net = new Network();
    const r1 = net.addDevice("router");
    const s1 = net.addDevice("switch");
    const p10 = pc(net, "192.168.10.10", "192.168.10.1");
    const p20 = pc(net, "192.168.20.10", "192.168.20.1");
    net.connect(r1.id, s1.id);
    net.connect(p10.id, s1.id, undefined, "FastEthernet0/1");
    net.connect(p20.id, s1.id, undefined, "FastEthernet0/2");
    run(net, s1, "enable\nconf t\nvlan 10\nvlan 20\ninterface fa0/1\nswitchport mode access\nswitchport access vlan 10\ninterface fa0/2\nswitchport mode access\nswitchport access vlan 20\ninterface g0/1\nswitchport mode trunk\nend");
    const out = run(
      net,
      r1,
      `enable
      conf t
      interface g0/0/0
      no shutdown
      interface g0/0/0.10
      ip address 192.168.10.1 255.255.255.0
      encapsulation dot1Q 10
      ip address 192.168.10.1 255.255.255.0
      interface g0/0/0.20
      encapsulation dot1Q 20
      ip address 192.168.20.1 255.255.255.0
      end`
    );
    expect(out).toContain("only allowed if that"); // adresse avant l'encapsulation : refusée comme sur IOS
    expect(okPings(net, p10, "192.168.20.10")).toBe(4); // 1er paquet perdu le temps de l'ARP du routeur, comme en vrai
    expect(okPings(net, p10, "192.168.20.10")).toBe(5);
    expect(net.traceroute(p10, "192.168.20.10")).toEqual(["192.168.10.1", "192.168.20.10"]);
    expect(run(net, r1, "show ip interface brief")).toMatch(/GigabitEthernet0\/0\/0\.10\s+192\.168\.10\.1\s+YES manual up\s+up/);
    expect(run(net, r1, "enable\nshow running-config")).toContain(" encapsulation dot1Q 20");
  });

  it("switch de couche 3 : SVI + ip routing", () => {
    const net = new Network();
    const ms = net.addDevice("l3switch");
    expect(ms.hostname).toBe("MS1");
    expect(ms.ifaces).toHaveLength(28);
    const p10 = pc(net, "10.10.0.10", "10.10.0.1");
    const p20 = pc(net, "10.20.0.10", "10.20.0.1");
    for (const p of [p10, p20]) p.ifaces[0].mask = "255.255.255.0";
    net.connect(p10.id, ms.id, undefined, "GigabitEthernet1/0/1");
    net.connect(p20.id, ms.id, undefined, "GigabitEthernet1/0/2");
    run(
      net,
      ms,
      `enable
      conf t
      vlan 10
      vlan 20
      interface g1/0/1
      switchport mode access
      switchport access vlan 10
      interface g1/0/2
      switchport mode access
      switchport access vlan 20
      interface vlan 10
      ip address 10.10.0.1 255.255.255.0
      interface vlan 20
      ip address 10.20.0.1 255.255.255.0
      end`
    );
    expect(okPings(net, p10, "10.10.0.1")).toBe(5); // la SVI répond
    expect(okPings(net, p10, "10.20.0.10")).toBe(0); // pas encore de routage
    run(net, ms, "enable\nconf t\nip routing\nend");
    expect(okPings(net, p10, "10.20.0.10")).toBeGreaterThanOrEqual(4);
    expect(okPings(net, p10, "10.20.0.10")).toBe(5);
    expect(run(net, ms, "show ip route")).toMatch(/C\s+10\.20\.0\.0\/24 is directly connected, Vlan20/);
  });

  it("switch de couche 3 : port routé (no switchport) vers un routeur", () => {
    const net = new Network();
    const ms = net.addDevice("l3switch");
    const r1 = net.addDevice("router");
    const p = pc(net, "10.10.0.10", "10.10.0.1");
    net.connect(ms.id, r1.id);
    net.connect(p.id, ms.id, undefined, "GigabitEthernet1/0/1");
    expect(run(net, ms, "enable\nconf t\ninterface g1/1/1\nip address 10.0.0.1 255.255.255.252")).toContain("Invalid input");
    run(net, ms, "enable\nconf t\nip routing\nvlan 10\ninterface g1/0/1\nswitchport access vlan 10\ninterface vlan 10\nip address 10.10.0.1 255.255.255.0\ninterface g1/1/1\nno switchport\nip address 10.0.0.1 255.255.255.252\nend");
    run(net, r1, "enable\nconf t\ninterface g0/0/0\nip address 10.0.0.2 255.255.255.252\nno shutdown\nexit\nip route 10.10.0.0 255.255.255.0 10.0.0.1\nend");
    expect(okPings(net, p, "10.0.0.2")).toBeGreaterThanOrEqual(4); // réseau directement connecté au switch L3
    run(net, r1, "enable\nconf t\ninterface g0/0/1\nip address 172.16.0.1 255.255.255.0\nend");
    expect(okPings(net, p, "172.16.0.1")).toBe(0); // g0/0/1 n'est pas câblée : réseau absent
    run(net, ms, "enable\nconf t\nip route 0.0.0.0 0.0.0.0 10.0.0.2\nend");
    expect(run(net, ms, "show ip route")).toContain("Gateway of last resort is 10.0.0.2 to network 0.0.0.0");
    expect(run(net, r1, "show cdp neighbors")).toMatch(/MS1\s+Gig 0\/0\/0\s+170\s+R S I\s+KX-24\s+Gig 1\/1\/1/);
  });

  it("recharge un ancien lab (format avec un seul « svi »)", () => {
    const old = {
      version: 1,
      devices: [{ id: "d1", kind: "switch", model: "KS-24", hostname: "S1", x: 0, y: 0, ifaces: [], svi: { name: "Vlan1", mac: "00d0.0000.0001", adminUp: true, description: "", ip: "1.1.1.1", mask: "255.0.0.0" }, routes: [], extra: [] }],
      links: [],
    };
    const net = Network.fromJSON(old);
    expect(net.devices[0].svis?.[0].ip).toBe("1.1.1.1");
  });
});

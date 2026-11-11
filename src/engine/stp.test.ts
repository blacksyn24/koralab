import { describe, expect, it } from "vitest";
import { IosCli } from "./cli/ios";
import { Network, type Device } from "./network";

function run(net: Network, dev: Device, cmds: string) {
  const cli = new IosCli(net, dev);
  return cmds
    .trim()
    .split("\n")
    .map((l) => cli.exec(l.trim()))
    .join("\n");
}

const pc = (net: Network, ip: string) => {
  const d = net.addDevice("pc");
  Object.assign(d.ifaces[0], { ip, mask: "255.255.255.0" });
  return d;
};

/** Triangle de switchs (boucle) : S1-S2 (Gi0/1), S2-S3 (Gi0/2 - Gi0/1), S1-S3 (Gi0/2) */
function triangle() {
  const net = new Network();
  const [s1, s2, s3] = [net.addDevice("switch"), net.addDevice("switch"), net.addDevice("switch")];
  net.connect(s1.id, s2.id, "GigabitEthernet0/1", "GigabitEthernet0/1");
  net.connect(s2.id, s3.id, "GigabitEthernet0/2", "GigabitEthernet0/1");
  net.connect(s1.id, s3.id, "GigabitEthernet0/2", "GigabitEthernet0/2");
  const a = pc(net, "10.0.0.1");
  const b = pc(net, "10.0.0.3");
  net.connect(a.id, s1.id, undefined, "FastEthernet0/1");
  net.connect(b.id, s3.id, undefined, "FastEthernet0/1");
  return { net, s1, s2, s3, a, b };
}

describe("Spanning Tree", () => {
  it("bloque un port de la boucle et élit la racine (adresse MAC la plus basse)", () => {
    const { net, s1, s2, s3, a, b } = triangle();
    expect(net.ping(a, "10.0.0.3", 4).filter((r) => r.ok)).toHaveLength(4);
    const blocked = [s1, s2, s3].flatMap((s) => [...(net.stpState().get(s.id)!.get(1)!.ports.values())].filter((p) => p.state === "BLK"));
    expect(blocked).toHaveLength(1);
    expect(run(net, s1, "show spanning-tree")).toContain("This bridge is the root"); // S1 a la plus petite MAC
    expect(run(net, s3, "show spanning-tree vlan 1")).toMatch(/Gi0\/1\s+Altn BLK 4\s+128\.25\s+P2p/);
    expect(run(net, s3, "show spanning-tree")).toMatch(/Fa0\/1\s+Desg FWD 19\s+128\.1\s+P2p/);
  });

  it("spanning-tree vlan 1 root primary déplace la racine", () => {
    const { net, s1, s3 } = triangle();
    run(net, s3, "enable\nconf t\nspanning-tree vlan 1 root primary\nend");
    expect(run(net, s3, "show spanning-tree")).toContain("This bridge is the root");
    expect(run(net, s3, "show spanning-tree")).toMatch(/Bridge ID  Priority    24577  \(priority 24576 sys-id-ext 1\)/);
    expect(run(net, s1, "show spanning-tree")).not.toContain("This bridge is the root");
    expect(run(net, s3, "enable\nconf t\nspanning-tree vlan 1 priority 1000")).toContain("increments of 4096");
  });

  it("PVST+ : un arbre par VLAN", () => {
    const { net, s1, s2, s3 } = triangle();
    for (const s of [s1, s2, s3]) run(net, s, "enable\nconf t\nvlan 10\ninterface range g0/1 - 2\nswitchport mode trunk\nend");
    run(net, s2, "enable\nconf t\nspanning-tree vlan 10 root primary\nend");
    expect(run(net, s2, "show spanning-tree vlan 10")).toContain("This bridge is the root");
    expect(run(net, s2, "show spanning-tree vlan 1")).not.toContain("This bridge is the root");
    expect(run(net, s1, "show spanning-tree summary")).toContain("Root bridge for: VLAN0001");
  });

  it("BPDU Guard met en err-disabled un port PortFast branché sur un switch", () => {
    const { net, s1 } = triangle();
    run(net, s1, "enable\nconf t\ninterface g0/1\nspanning-tree portfast\nspanning-tree bpduguard enable\nend");
    expect(run(net, s1, "show interfaces status")).toMatch(/Gi0\/1\s+err-disabled/);
  });
});

describe("EtherChannel", () => {
  function twoLinks(modeA: string, modeB: string) {
    const net = new Network();
    const s1 = net.addDevice("switch");
    const s2 = net.addDevice("switch");
    net.connect(s1.id, s2.id, "GigabitEthernet0/1", "GigabitEthernet0/1");
    net.connect(s1.id, s2.id, "GigabitEthernet0/2", "GigabitEthernet0/2");
    const a = pc(net, "10.0.0.1");
    const b = pc(net, "10.0.0.2");
    net.connect(a.id, s1.id, undefined, "FastEthernet0/1");
    net.connect(b.id, s2.id, undefined, "FastEthernet0/1");
    const o1 = run(net, s1, `enable\nconf t\ninterface range g0/1 - 2\nchannel-group 1 mode ${modeA}\nend`);
    run(net, s2, `enable\nconf t\ninterface range g0/1 - 2\nchannel-group 1 mode ${modeB}\nend`);
    return { net, s1, s2, a, b, o1 };
  }

  it("LACP active/passive : les deux liens sont agrégés, aucun port bloqué", () => {
    const { net, s1, a, o1 } = twoLinks("active", "passive");
    expect(o1).toContain("Creating a port-channel interface Port-channel 1");
    expect(run(net, s1, "show etherchannel summary")).toMatch(/1\s+Po1\(SU\)\s+LACP\s+Gi0\/1\(P\)\s+Gi0\/2\(P\)/);
    expect(run(net, s1, "show spanning-tree")).toMatch(/Po1\s+Desg FWD 3\s+128\.65\s+P2p/);
    expect(run(net, s1, "show spanning-tree")).not.toContain("BLK");
    expect(net.ping(a, "10.0.0.2", 4).filter((r) => r.ok)).toHaveLength(4);
    expect(run(net, s1, "show mac address-table")).toContain("Po1");
  });

  it("LACP passive/passive : pas d'agrégat, STP bloque un des deux liens", () => {
    const { net, s1, s2, a } = twoLinks("passive", "passive");
    expect(run(net, s1, "show etherchannel summary")).toMatch(/Po1\(SD\)\s+LACP\s+Gi0\/1\(s\)\s+Gi0\/2\(s\)/);
    expect(net.ping(a, "10.0.0.2", 4).filter((r) => r.ok)).toHaveLength(0); // membres suspendus : plus de lien
    run(net, s2, "enable\nconf t\ninterface range g0/1 - 2\nchannel-group 1 mode active\nend");
    expect(net.ping(a, "10.0.0.2", 4).filter((r) => r.ok)).toHaveLength(4);
  });

  it("la configuration du Port-channel s'applique aux membres", () => {
    const { net, s1, s2 } = twoLinks("on", "on");
    run(net, s1, "enable\nconf t\nvlan 20\ninterface port-channel 1\nswitchport mode trunk\nswitchport trunk allowed vlan 1,20\nend");
    run(net, s2, "enable\nconf t\nvlan 20\ninterface port-channel 1\nswitchport mode trunk\nend");
    expect(s1.ifaces.find((i) => i.name === "GigabitEthernet0/2")?.allowed).toBe("1,20");
    expect(run(net, s1, "show interfaces trunk")).toMatch(/Po1\s+on\s+802\.1q\s+trunking/);
    expect(run(net, s1, "enable\nshow running-config")).toContain("interface Port-channel1\n switchport trunk allowed vlan 1,20\n switchport mode trunk");
  });
});

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

/**
 * Triangle : R1 —(10.0.12.0/30)— R2 —(10.0.23.0/30)— R3 —(10.0.13.0/30)— R1
 * LAN de R1 : 192.168.1.0/24 (PC1) ; LAN de R3 : 192.168.3.0/24 (PC3)
 */
function triangle() {
  const net = new Network();
  const [r1, r2, r3] = [net.addDevice("router"), net.addDevice("router"), net.addDevice("router")];
  const pc1 = net.addDevice("pc");
  const pc3 = net.addDevice("pc");
  Object.assign(pc1.ifaces[0], { ip: "192.168.1.10", mask: "255.255.255.0" });
  Object.assign(pc3.ifaces[0], { ip: "192.168.3.10", mask: "255.255.255.0" });
  pc1.gateway = "192.168.1.1";
  pc3.gateway = "192.168.3.1";
  net.connect(r1.id, r2.id, "GigabitEthernet0/0/0", "GigabitEthernet0/0/0");
  net.connect(r2.id, r3.id, "GigabitEthernet0/0/1", "GigabitEthernet0/0/0");
  net.connect(r1.id, r3.id, "GigabitEthernet0/0/1", "GigabitEthernet0/0/1");
  net.connect(pc1.id, r1.id, undefined, "GigabitEthernet0/0/2");
  net.connect(pc3.id, r3.id, undefined, "GigabitEthernet0/0/2");
  const base = (ips: string[], lo: string) =>
    `enable\nconf t\ninterface loopback 0\nip address ${lo} 255.255.255.255\n` +
    ["g0/0/0", "g0/0/1", "g0/0/2"].map((g, k) => (ips[k] ? `interface ${g}\nip address ${ips[k]}\nno shutdown\n` : "")).join("") +
    "end";
  run(net, r1, base(["10.0.12.1 255.255.255.252", "10.0.13.1 255.255.255.252", "192.168.1.1 255.255.255.0"], "1.1.1.1"));
  run(net, r2, base(["10.0.12.2 255.255.255.252", "10.0.23.1 255.255.255.252"], "2.2.2.2"));
  run(net, r3, base(["10.0.23.2 255.255.255.252", "10.0.13.2 255.255.255.252", "192.168.3.1 255.255.255.0"], "3.3.3.3"));
  return { net, r1, r2, r3, pc1, pc3 };
}

const ospfAll = (net: Network, devs: Device[]) => {
  for (const d of devs) run(net, d, "enable\nconf t\nrouter ospf 1\nnetwork 0.0.0.0 255.255.255.255 area 0\nend");
};

describe("OSPF", () => {
  it("forme les voisinages et apprend les réseaux distants", () => {
    const { net, r1, r2, r3, pc1 } = triangle();
    expect(net.ping(pc1, "192.168.3.10", 4).filter((r) => r.ok)).toHaveLength(0);
    ospfAll(net, [r1, r2, r3]);
    const nb = run(net, r1, "show ip ospf neighbor");
    expect(nb).toMatch(/2\.2\.2\.2\s+1\s+FULL\/(DR|BDR)\s+00:00:\d\d\s+10\.0\.12\.2\s+GigabitEthernet0\/0\/0/);
    expect(nb).toMatch(/3\.3\.3\.3\s+1\s+FULL\/(DR|BDR)/);
    const rt = run(net, r1, "show ip route");
    expect(rt).toMatch(/O\s+192\.168\.3\.0\/24 \[110\/2\] via 10\.0\.13\.2, 00:00:12, GigabitEthernet0\/0\/1/);
    expect(rt).toMatch(/O\s+2\.2\.2\.2\/32 \[110\/2\] via 10\.0\.12\.2/);
    // ECMP : 10.0.23.0/30 est à égale distance via R2 et via R3
    expect(rt).toMatch(/O\s+10\.0\.23\.0\/30 \[110\/2\] via 10\.0\.1[23]\.2[^\n]*\n\s+\[110\/2\] via 10\.0\.1[23]\.2/);
    net.ping(pc1, "192.168.3.10", 2);
    expect(net.ping(pc1, "192.168.3.10", 4).filter((r) => r.ok)).toHaveLength(4);
    expect(run(net, r1, "show ip protocols")).toContain('Routing Protocol is "ospf 1"');
    expect(run(net, r1, "show ip ospf interface brief")).toMatch(/Gi0\/0\/0\s+1\s+0\s+10\.0\.12\.1\/30\s+1\s+(DR|BDR)\s+1\/1/);
  });

  it("le coût OSPF change le chemin choisi", () => {
    const { net, r1, r2, r3 } = triangle();
    ospfAll(net, [r1, r2, r3]);
    run(net, r1, "enable\nconf t\ninterface g0/0/1\nip ospf cost 50\nend");
    expect(run(net, r1, "show ip route 192.168.3.0")).toContain("10.0.12.2");
    expect(run(net, r1, "show ip route ospf")).toMatch(/O\s+192\.168\.3\.0\/24 \[110\/3\] via 10\.0\.12\.2/);
  });

  it("interface passive et timers différents : pas de voisinage", () => {
    const { net, r1, r2, r3 } = triangle();
    ospfAll(net, [r1, r2, r3]);
    run(net, r1, "enable\nconf t\nrouter ospf 1\npassive-interface g0/0/0\nend");
    expect(run(net, r1, "show ip ospf neighbor")).not.toContain("2.2.2.2");
    run(net, r1, "enable\nconf t\ninterface g0/0/1\nip ospf hello-interval 5\nend");
    expect(run(net, r1, "show ip ospf neighbor")).not.toContain("3.3.3.3");
  });

  it("élection DR/BDR sur un switch (priorité puis router-id)", () => {
    const net = new Network();
    const s = net.addDevice("switch");
    const rs = [net.addDevice("router"), net.addDevice("router"), net.addDevice("router")];
    rs.forEach((r, k) => {
      net.connect(r.id, s.id, "GigabitEthernet0/0/0");
      run(net, r, `enable\nconf t\ninterface g0/0/0\nip address 10.0.0.${k + 1} 255.255.255.0\nno shutdown\nexit\nrouter ospf 1\nrouter-id ${k + 1}.${k + 1}.${k + 1}.${k + 1}\nnetwork 10.0.0.0 0.0.0.255 area 0\nend`);
    });
    // R3 (ID le plus haut) est DR, R2 BDR ; entre R1 et… R1 est DROTHER
    const fromR1 = run(net, rs[0], "show ip ospf neighbor");
    expect(fromR1).toMatch(/3\.3\.3\.3\s+1\s+FULL\/DR/);
    expect(fromR1).toMatch(/2\.2\.2\.2\s+1\s+FULL\/BDR/);
    // priorité 0 sur R3 : il ne peut plus être DR
    run(net, rs[2], "enable\nconf t\ninterface g0/0/0\nip ospf priority 0\nend");
    const again = run(net, rs[0], "show ip ospf neighbor");
    expect(again).toMatch(/2\.2\.2\.2\s+1\s+FULL\/DR/);
    expect(again).toMatch(/3\.3\.3\.3\s+0\s+FULL\/DROTHER/);
    expect(run(net, rs[2], "show ip ospf neighbor")).toMatch(/1\.1\.1\.1\s+1\s+FULL\/BDR/);
  });

  it("route par défaut annoncée (default-information originate) et route statique flottante", () => {
    const { net, r1, r2, r3 } = triangle();
    ospfAll(net, [r1, r2, r3]);
    run(net, r2, "enable\nconf t\nip route 0.0.0.0 0.0.0.0 GigabitEthernet0/0/2\nrouter ospf 1\ndefault-information originate\nend");
    expect(run(net, r1, "show ip route")).toMatch(/O\*E2\s+0\.0\.0\.0\/0 \[110\/1\] via 10\.0\.12\.2/);
    // statique flottante (distance 120) : reste en secours tant qu'OSPF connaît le réseau
    run(net, r1, "enable\nconf t\nip route 192.168.3.0 255.255.255.0 10.0.12.2 120\nend");
    expect(run(net, r1, "show ip route 192.168.3.0")).toContain('Known via "ospf 1", distance 110');
    run(net, r1, "enable\nconf t\nno router ospf 1\nend");
    expect(run(net, r1, "show ip route static")).toMatch(/S\s+192\.168\.3\.0\/24 \[120\/0\] via 10\.0\.12\.2/);
    expect(run(net, r1, "enable\nshow running-config")).toContain("ip route 192.168.3.0 255.255.255.0 10.0.12.2 120");
  });

  it("OSPF sur un switch de couche 3 (SVI) avec un routeur", () => {
    const net = new Network();
    const ms = net.addDevice("l3switch");
    const r1 = net.addDevice("router");
    const pc = net.addDevice("pc");
    Object.assign(pc.ifaces[0], { ip: "172.16.10.10", mask: "255.255.255.0" });
    pc.gateway = "172.16.10.1";
    net.connect(ms.id, r1.id);
    net.connect(pc.id, ms.id, undefined, "GigabitEthernet1/0/1");
    expect(run(net, ms, "enable\nconf t\nrouter ospf 1")).toContain("IP routing not enabled");
    run(net, ms, "enable\nconf t\nip routing\nvlan 10\ninterface g1/0/1\nswitchport access vlan 10\ninterface vlan 10\nip address 172.16.10.1 255.255.255.0\ninterface g1/1/1\nno switchport\nip address 10.1.1.1 255.255.255.252\nexit\nrouter ospf 1\nnetwork 172.16.0.0 0.0.255.255 area 0\nnetwork 10.1.1.0 0.0.0.3 area 0\nend");
    run(net, r1, "enable\nconf t\ninterface loopback 1\nip address 8.8.8.8 255.255.255.255\ninterface g0/0/0\nip address 10.1.1.2 255.255.255.252\nno shutdown\nexit\nrouter ospf 1\nnetwork 10.1.1.0 0.0.0.3 area 0\nnetwork 8.8.8.8 0.0.0.0 area 0\nend");
    expect(run(net, r1, "show ip route")).toMatch(/O\s+172\.16\.10\.0\/24 \[110\/2\] via 10\.1\.1\.1/);
    net.ping(pc, "8.8.8.8", 2);
    expect(net.ping(pc, "8.8.8.8", 4).filter((r) => r.ok)).toHaveLength(4);
  });
});

import { describe, expect, it } from "vitest";
import { IosCli } from "./cli/ios";
import { PcCli } from "./cli/pc";
import { compress6, eui64, expand6, network6 } from "./ip6";
import { Network, type Device } from "./network";

function run(net: Network, dev: Device, cmds: string) {
  const cli = new IosCli(net, dev);
  return cmds
    .trim()
    .split("\n")
    .map((l) => cli.exec(l.trim()))
    .join("\n");
}

describe("Adresses IPv6", () => {
  it("abréviation, réseau et EUI-64", () => {
    expect(expand6("2001:db8::1")).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(compress6("2001:0db8:0000:0000:0001:0000:0000:0001")).toBe("2001:db8::1:0:0:1");
    expect(compress6(network6("2001:db8:a:b:1:2:3:4", 64))).toBe("2001:db8:a:b::");
    expect(eui64("00d0.ba12.3456")).toBe("02d0:baff:fe12:3456");
    expect(expand6("2001:db8:::1")).toBeNull();
  });
});

describe("IPv6 de bout en bout", () => {
  function lab() {
    // PC1 —(2001:db8:1::/64)— R1 —(2001:db8:12::/64)— R2 —(2001:db8:2::/64)— PC2
    const net = new Network();
    const r1 = net.addDevice("router");
    const r2 = net.addDevice("router");
    const pc1 = net.addDevice("pc");
    const pc2 = net.addDevice("pc");
    net.connect(pc1.id, r1.id, undefined, "GigabitEthernet0/0/0");
    net.connect(r1.id, r2.id, "GigabitEthernet0/0/1", "GigabitEthernet0/0/1");
    net.connect(pc2.id, r2.id, undefined, "GigabitEthernet0/0/0");
    run(net, r1, "enable\nconf t\nipv6 unicast-routing\ninterface g0/0/0\nipv6 address 2001:db8:1::1/64\nno shutdown\ninterface g0/0/1\nipv6 address 2001:db8:12::1/64\nno shutdown\nend");
    run(net, r2, "enable\nconf t\nipv6 unicast-routing\ninterface g0/0/0\nipv6 address 2001:db8:2::1/64\nno shutdown\ninterface g0/0/1\nipv6 address 2001:db8:12::/64 eui-64\nno shutdown\nend");
    return { net, r1, r2, pc1, pc2 };
  }

  it("SLAAC sur les PC, routes statiques, ping et traceroute IPv6", () => {
    const { net, r1, r2, pc1, pc2 } = lab();
    const c1 = new PcCli(net, pc1);
    expect(c1.exec("ipv6 autoconfig")).toMatch(/SLAAC : 2001:DB8:1:0:[0-9A-F:]+ · passerelle FE80::/);
    expect(new PcCli(net, pc2).exec("ipv6 autoconfig")).toContain("2001:DB8:2:0:");
    expect(c1.exec("ipconfig")).toContain("IPv6 Address....................: 2001:DB8:1:0:");
    expect(net.ping6(pc1, "2001:db8:1::1", 4).filter((r) => r.ok)).toHaveLength(4);
    const pc2addr = pc2.ifaces[0].ipv6![0].addr;
    expect(net.ping6(pc1, pc2addr, 4).filter((r) => r.ok)).toHaveLength(0); // pas encore de routes
    const r2ll = net.v6Addrs(r2.ifaces.find((i) => i.name === "GigabitEthernet0/0/1")!)[0].addr;
    run(net, r1, `enable\nconf t\nipv6 route 2001:db8:2::/64 g0/0/1 ${r2ll}\nend`);
    run(net, r2, "enable\nconf t\nipv6 route ::/0 2001:db8:12::1\nend");
    net.ping6(pc1, pc2addr, 6); // découverte des voisins (NDP) à chaque saut : les premiers paquets sont perdus
    expect(net.ping6(pc1, pc2addr, 4).filter((r) => r.ok)).toHaveLength(4);
    expect(net.traceroute6(pc1, pc2addr)).toEqual([expand6("2001:db8:1::1"), expect.stringMatching(/^2001:0db8:0012/), pc2addr]);
    const route = run(net, r1, "show ipv6 route");
    expect(route).toMatch(/S   2001:DB8:2::\/64 \[1\/0\]\n\s+via FE80::[0-9A-F:]+, GigabitEthernet0\/0\/1/);
    expect(route).toMatch(/C   2001:DB8:1::\/64 \[0\/0\]\n\s+via GigabitEthernet0\/0\/0, directly connected/);
    expect(run(net, r2, "show ipv6 interface brief")).toMatch(/GigabitEthernet0\/0\/1\s+\[up\/up\]\n\s+FE80::[0-9A-F:]+\n\s+2001:DB8:12:0:[0-9A-F:]+/);
    expect(run(net, r1, "show ipv6 neighbors")).toMatch(/FE80::\S+\s+0 [0-9a-f.]{14}\s+REACH Gi0\/0\/1/);
    expect(run(net, r1, "ping 2001:db8:12::1")).toContain("Success rate is 100 percent");
    expect(c1.exec(`ping ${pc2addr}`)).toContain("Received = 4");
    expect(run(net, r2, "enable\nshow running-config")).toContain("ipv6 address 2001:DB8:12::/64 eui-64");
  });

  it("sans ipv6 unicast-routing, le routeur ne transfère pas", () => {
    const { net, r1, pc1, pc2 } = lab();
    new PcCli(net, pc1).exec("ipv6 2001:db8:1::10/64 2001:db8:1::1");
    new PcCli(net, pc2).exec("ipv6 2001:db8:2::10/64 2001:db8:2::1");
    run(net, r1, "enable\nconf t\nipv6 route 2001:db8:2::/64 2001:db8:12::2\nend");
    const r2 = net.devices.find((d) => d.hostname === "R2")!;
    run(net, r2, "enable\nconf t\nipv6 route 2001:db8:1::/64 g0/0/1 " + net.v6Addrs(r1.ifaces.find((i) => i.name === "GigabitEthernet0/0/1")!)[0].addr + "\nend");
    // R2 a une adresse EUI-64 : 2001:db8:12::2 n'existe pas ; on vise la vraie adresse
    const r2g = r2.ifaces.find((i) => i.name === "GigabitEthernet0/0/1")!.ipv6![0].addr;
    run(net, r1, `enable\nconf t\nno ipv6 route 2001:db8:2::/64 2001:db8:12::2\nipv6 route 2001:db8:2::/64 ${r2g}\nend`);
    net.ping6(pc1, "2001:db8:2::10", 6);
    expect(net.ping6(pc1, "2001:db8:2::10", 4).filter((r) => r.ok)).toHaveLength(4);
    run(net, r1, "enable\nconf t\nno ipv6 unicast-routing\nend");
    expect(net.ping6(pc1, "2001:db8:2::10", 4).filter((r) => r.ok)).toHaveLength(0);
  });
});

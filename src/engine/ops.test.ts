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

describe("HSRP", () => {
  function lab() {
    // PC — S1 — R1 / R2 (même LAN 192.168.1.0/24), passerelle virtuelle 192.168.1.254
    const net = new Network();
    const s1 = net.addDevice("switch");
    const r1 = net.addDevice("router");
    const r2 = net.addDevice("router");
    const pc = net.addDevice("pc");
    Object.assign(pc.ifaces[0], { ip: "192.168.1.10", mask: "255.255.255.0" });
    pc.gateway = "192.168.1.254";
    net.connect(r1.id, s1.id, "GigabitEthernet0/0/0");
    net.connect(r2.id, s1.id, "GigabitEthernet0/0/0");
    net.connect(pc.id, s1.id);
    run(net, r1, "enable\nconf t\ninterface loopback 0\nip address 8.8.8.8 255.255.255.255\ninterface g0/0/0\nip address 192.168.1.1 255.255.255.0\nstandby 1 ip 192.168.1.254\nstandby 1 priority 110\nstandby 1 preempt\nno shutdown\nend");
    run(net, r2, "enable\nconf t\ninterface loopback 0\nip address 8.8.8.8 255.255.255.255\ninterface g0/0/0\nip address 192.168.1.2 255.255.255.0\nstandby 1 ip 192.168.1.254\nno shutdown\nend");
    return { net, r1, r2, pc };
  }

  it("le routeur de plus haute priorité est actif et répond pour l'adresse virtuelle", () => {
    const { net, r1, r2, pc } = lab();
    expect(run(net, r1, "show standby brief")).toMatch(/Gi0\/0\/0\s+1\s+110 P Active\s+local\s+192\.168\.1\.2\s+192\.168\.1\.254/);
    expect(run(net, r2, "show standby brief")).toMatch(/Gi0\/0\/0\s+1\s+100\s+Standby\s+192\.168\.1\.1\s+local\s+192\.168\.1\.254/);
    expect(net.ping(pc, "192.168.1.254", 4).filter((r) => r.ok)).toHaveLength(4);
    expect(net.arpTable(pc).find((e) => e.ip === "192.168.1.254")?.mac).toBe("0000.0c07.ac01");
    expect(run(net, r1, "show standby")).toContain("Active virtual MAC address is 0000.0c07.ac01");
  });

  it("bascule : si R1 tombe, R2 devient actif et la passerelle répond toujours", () => {
    const { net, r1, r2, pc } = lab();
    run(net, r1, "enable\nconf t\ninterface g0/0/0\nshutdown\nend");
    expect(run(net, r2, "show standby brief")).toMatch(/100\s+Active\s+local/);
    net.ping(pc, "192.168.1.254", 2);
    expect(net.ping(pc, "192.168.1.254", 4).filter((r) => r.ok)).toHaveLength(4);
  });
});

describe("Exploitation", () => {
  it("NTP : un client se synchronise sur le maître", () => {
    const net = new Network();
    const r1 = net.addDevice("router");
    const r2 = net.addDevice("router");
    net.connect(r1.id, r2.id);
    run(net, r1, "enable\nclock set 08:30:00 15 Jan 2026\nconf t\nntp master 3\ninterface g0/0/0\nip address 10.0.0.1 255.255.255.252\nno shutdown\nend");
    run(net, r2, "enable\nconf t\nntp server 10.0.0.1\ninterface g0/0/0\nip address 10.0.0.2 255.255.255.252\nno shutdown\nend");
    expect(run(net, r2, "show ntp status")).toContain("Clock is synchronized, stratum 4, reference is 10.0.0.1");
    expect(run(net, r2, "show clock")).toMatch(/^08:30:\d\d\.\d{3} UTC Thu Jan 15 2026$/);
    expect(run(net, r2, "show ntp associations")).toMatch(/\*~10\.0\.0\.1\s+127\.127\.1\.1\s+3/);
  });

  it("journal, ip host, CDP / LLDP", () => {
    const net = new Network();
    const r1 = net.addDevice("router");
    const r2 = net.addDevice("router");
    net.connect(r1.id, r2.id);
    run(net, r1, "enable\nconf t\nservice timestamps log datetime msec\nip host R2 10.0.0.2\nlldp run\ninterface g0/0/0\nip address 10.0.0.1 255.255.255.252\nno shutdown\nend");
    run(net, r2, "enable\nconf t\nlldp run\ninterface g0/0/0\nip address 10.0.0.2 255.255.255.252\nno shutdown\nend");
    expect(run(net, r2, "show logging")).toContain("%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/0/0, changed state to up");
    expect(run(net, r1, "ping R2")).toContain("Sending 5, 100-byte ICMP Echos to 10.0.0.2");
    expect(run(net, r1, "show lldp neighbors")).toMatch(/R2\s+Gi0\/0\/0\s+120\s+R\s+Gi0\/0\/0/);
    run(net, r2, "enable\nconf t\nno cdp run\nend");
    expect(run(net, r1, "show cdp neighbors")).toContain("Total cdp entries displayed : 0");
  });

  it("reload : la configuration non sauvegardée est perdue, la sauvegardée revient", () => {
    const net = new Network();
    const r1 = net.addDevice("router");
    run(net, r1, "enable\nconf t\nhostname SIEGE\ninterface g0/0/0\nip address 10.1.1.1 255.255.255.0\nno shutdown\nend\ncopy running-config startup-config");
    run(net, r1, "enable\nconf t\nhostname PERDU\nend");
    expect(r1.hostname).toBe("PERDU");
    run(net, r1, "enable\nreload");
    expect(r1.hostname).toBe("SIEGE");
    expect(r1.ifaces[0].ip).toBe("10.1.1.1");
    run(net, r1, "enable\nerase startup-config\nreload");
    expect(r1.hostname).toBe("Router");
    expect(r1.ifaces[0].ip).toBeUndefined();
  });
});

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

const pc = (net: Network, ip?: string) => {
  const d = net.addDevice("pc");
  if (ip) Object.assign(d.ifaces[0], { ip, mask: "255.255.255.0" });
  return d;
};

describe("Port-security", () => {
  it("violation shutdown : un PC inconnu met le port en err-disabled", () => {
    const net = new Network();
    const s1 = net.addDevice("switch");
    const ok = pc(net, "10.0.0.1");
    const srv = pc(net, "10.0.0.100");
    net.connect(ok.id, s1.id, undefined, "FastEthernet0/1");
    net.connect(srv.id, s1.id, undefined, "FastEthernet0/24");
    expect(run(net, s1, "enable\nconf t\ninterface fa0/1\nswitchport port-security")).toContain("dynamic port");
    run(net, s1, "enable\nconf t\ninterface fa0/1\nswitchport mode access\nswitchport port-security\nswitchport port-security mac-address sticky\nend");
    expect(net.ping(ok, "10.0.0.100", 4).filter((r) => r.ok)).toHaveLength(4);
    expect(run(net, s1, "show port-security address")).toMatch(/1\s+\S+\s+SecureSticky\s+Fa0\/1/);
    // un intrus prend la place du PC autorisé sur le même port
    net.disconnect(net.links.find((l) => l.a.dev === ok.id)!.id);
    const intrus = pc(net, "10.0.0.66");
    net.connect(intrus.id, s1.id, undefined, "FastEthernet0/1");
    expect(net.ping(intrus, "10.0.0.100", 4).filter((r) => r.ok)).toHaveLength(0);
    expect(run(net, s1, "show interfaces status")).toMatch(/Fa0\/1\s+err-disabled/);
    expect(run(net, s1, "show port-security interface fa0/1")).toContain("Secure-shutdown");
    expect(run(net, s1, "show port-security")).toMatch(/Fa0\/1\s+1\s+1\s+1\s+Shutdown/);
    // le bon PC revient ; shutdown / no shutdown réactive le port
    net.disconnect(net.links.find((l) => l.a.dev === intrus.id)!.id);
    net.connect(ok.id, s1.id, undefined, "FastEthernet0/1");
    run(net, s1, "enable\nconf t\ninterface fa0/1\nshutdown\nno shutdown\nend");
    expect(net.ping(ok, "10.0.0.100", 4).filter((r) => r.ok)).toHaveLength(4);
    expect(run(net, s1, "enable\nshow running-config")).toMatch(/switchport port-security mac-address sticky [0-9a-f.]{14}/);
  });

  it("violation restrict : le trafic est jeté mais le port reste actif", () => {
    const net = new Network();
    const s1 = net.addDevice("switch");
    const a = pc(net, "10.0.0.1");
    const srv = pc(net, "10.0.0.100");
    net.connect(a.id, s1.id, undefined, "FastEthernet0/1");
    net.connect(srv.id, s1.id, undefined, "FastEthernet0/24");
    run(net, s1, "enable\nconf t\ninterface fa0/1\nswitchport mode access\nswitchport port-security\nswitchport port-security mac-address 0000.1111.2222\nswitchport port-security violation restrict\nend");
    expect(net.ping(a, "10.0.0.100", 4).filter((r) => r.ok)).toHaveLength(0);
    expect(run(net, s1, "show interfaces status")).toMatch(/Fa0\/1\s+connected/);
    expect(run(net, s1, "show port-security")).toMatch(/Restrict/);
  });
});

describe("DHCP snooping et DAI", () => {
  function lab() {
    const net = new Network();
    const s1 = net.addDevice("switch");
    const r1 = net.addDevice("router"); // vrai serveur
    const rogue = net.addDevice("router"); // serveur pirate
    const client = pc(net);
    net.connect(r1.id, s1.id, "GigabitEthernet0/0/0", "GigabitEthernet0/1");
    net.connect(rogue.id, s1.id, "GigabitEthernet0/0/0", "FastEthernet0/24");
    net.connect(client.id, s1.id, undefined, "FastEthernet0/1");
    run(net, r1, "enable\nconf t\ninterface g0/0/0\nip address 192.168.1.1 255.255.255.0\nno shutdown\nexit\nip dhcp pool OK\nnetwork 192.168.1.0 255.255.255.0\ndefault-router 192.168.1.1\nend");
    run(net, rogue, "enable\nconf t\ninterface g0/0/0\nip address 192.168.1.254 255.255.255.0\nno shutdown\nexit\nip dhcp excluded-address 192.168.1.1 192.168.1.199\nip dhcp pool PIRATE\nnetwork 192.168.1.0 255.255.255.0\ndefault-router 192.168.1.254\nend");
    return { net, s1, client };
  }

  it("seul le serveur derrière un port de confiance peut répondre", () => {
    const { net, s1, client } = lab();
    run(net, s1, "enable\nconf t\nip dhcp snooping\nip dhcp snooping vlan 1\nend");
    expect(net.dhcpRequest(client, client.ifaces[0].name)).toBeNull(); // aucun port de confiance : tout est bloqué
    run(net, s1, "enable\nconf t\ninterface g0/1\nip dhcp snooping trust\nend");
    const ack = net.dhcpRequest(client, client.ifaces[0].name);
    expect(ack?.router).toBe("192.168.1.1"); // jamais le pirate
    expect(run(net, s1, "show ip dhcp snooping binding")).toMatch(/192\.168\.1\.2\s+86400\s+dhcp-snooping\s+1\s+FastEthernet0\/1/);
  });

  it("DAI : une machine en adresse fixe (hors baux DHCP) ne peut plus faire d'ARP", () => {
    const { net, s1, client } = lab();
    run(net, s1, "enable\nconf t\nip dhcp snooping\nip dhcp snooping vlan 1\ninterface g0/1\nip dhcp snooping trust\nip arp inspection trust\nexit\nip arp inspection vlan 1\nend");
    net.dhcpRequest(client, client.ifaces[0].name);
    expect(net.ping(client, "192.168.1.1", 4).filter((r) => r.ok)).toHaveLength(4);
    const statique = pc(net, "192.168.1.50");
    net.connect(statique.id, s1.id, undefined, "FastEthernet0/2");
    expect(net.ping(statique, "192.168.1.1", 4).filter((r) => r.ok)).toHaveLength(0);
    expect(run(net, s1, "show ip arp inspection")).toMatch(/Dropped ARP packets : [1-9]/);
  });
});

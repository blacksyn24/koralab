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

const okPings = (net: Network, from: Device, to: string) => net.ping(from, to, 5).filter((r) => r.ok).length;

/** Routeur (DHCP + router-on-a-stick), switch, contrôleur, point d'accès, serveur filaire et portable Wi-Fi. */
function lab(opt43 = true) {
  const net = new Network();
  const r1 = net.addDevice("router", 0, 0);
  const s1 = net.addDevice("switch", 0, 100);
  const wlc = net.addDevice("wlc", 200, 100);
  const ap = net.addDevice("ap", 0, 300);
  const srv = net.addDevice("pc", 300, 300);
  const laptop = net.addDevice("pc", 100, 450, "LAPTOP");
  net.connect(r1.id, s1.id, undefined, "GigabitEthernet0/1");
  net.connect(wlc.id, s1.id, undefined, "GigabitEthernet0/2");
  net.connect(ap.id, s1.id, undefined, "FastEthernet0/1");
  net.connect(srv.id, s1.id, undefined, "FastEthernet0/2");
  srv.ifaces[0].ip = "192.168.1.50";
  srv.ifaces[0].mask = "255.255.255.0";
  srv.gateway = "192.168.1.1";
  const g = r1.ifaces[0].name;
  run(
    net,
    r1,
    `enable
    conf t
    interface ${g}
    no shutdown
    ip address 192.168.1.1 255.255.255.0
    interface ${g}.20
    encapsulation dot1Q 20
    ip address 192.168.20.1 255.255.255.0
    exit
    ip dhcp excluded-address 192.168.1.1 192.168.1.9
    ip dhcp excluded-address 192.168.20.1 192.168.20.9
    ip dhcp pool AP
    network 192.168.1.0 255.255.255.0
    default-router 192.168.1.1
    ${opt43 ? "option 43 hex f104c0a80105" : ""}
    ip dhcp pool WIFI
    network 192.168.20.0 255.255.255.0
    default-router 192.168.20.1`,
  );
  run(
    net,
    s1,
    `enable
    conf t
    vlan 20
    interface range GigabitEthernet0/1 - 2
    switchport mode trunk`,
  );
  const c = wlc.wlcCfg!;
  c.mgmt = { name: "management", vlan: 0, ip: "192.168.1.5", mask: "255.255.255.0", gw: "192.168.1.1" };
  c.ifaces = [{ name: "employes", vlan: 20, ip: "192.168.20.5", mask: "255.255.255.0", gw: "192.168.20.1" }];
  c.wlans = [{ id: 1, profile: "KoraNet", ssid: "KoraNet", enabled: true, iface: "employes", security: "wpa2-psk", psk: "secret123" }];
  net.syncWlc(wlc);
  return { net, r1, s1, wlc, ap, srv, laptop };
}

describe("Wi-Fi : contrôleur, point d'accès et clients", () => {
  it("enregistre le point d'accès grâce à l'option 43 et associe un client WPA2", () => {
    const { net, ap, wlc, laptop, srv } = lab();
    expect(net.apStatus(ap).wlc).toBe(wlc);
    expect(ap.ifaces[0].ip).toMatch(/^192\.168\.1\./);
    expect(net.visibleSsids(laptop).map((s) => s.ssid)).toEqual(["KoraNet"]);
    laptop.wifi = { ssid: "KoraNet", psk: "secret123" };
    net.clearDynamic();
    expect(net.wifiStatus(laptop)).toMatchObject({ vlan: 20 });
    const ack = net.dhcpRequest(laptop, "Wireless0");
    expect(ack?.op).toBe("ack");
    expect(laptop.ifaces[0].ip).toMatch(/^192\.168\.20\.1\d$/);
    expect(okPings(net, laptop, "192.168.20.1")).toBeGreaterThanOrEqual(4);
    expect(okPings(net, laptop, "192.168.1.50")).toBeGreaterThanOrEqual(4);
    expect(okPings(net, srv, laptop.ifaces[0].ip!)).toBeGreaterThanOrEqual(4);
    expect(net.wlcClients(wlc).map((x) => x.client)).toEqual([laptop]);
  });

  it("refuse un mauvais mot de passe ou un SSID inconnu", () => {
    const { net, laptop } = lab();
    laptop.wifi = { ssid: "KoraNet", psk: "mauvais" };
    net.clearDynamic();
    expect(net.wifiStatus(laptop)).toMatchObject({ error: expect.stringContaining("Mot de passe") });
    expect(net.dhcpRequest(laptop, "Wireless0")).toBeNull();
    laptop.wifi = { ssid: "Inconnu", psk: "x" };
    net.clearDynamic();
    expect(net.wifiStatus(laptop)).toMatchObject({ error: expect.stringContaining("n'existe pas") });
  });

  it("sans option 43 ni adresse de contrôleur, le point d'accès ne s'enregistre pas… puis s'enregistre avec l'adresse", () => {
    const { net, ap } = lab(false);
    // le contrôleur est dans le même réseau : découverte par diffusion
    expect(net.apStatus(ap).wlc).not.toBeNull();
    ap.apCfg!.controller = "10.9.9.9";
    net.clearDynamic();
    expect(net.apStatus(ap).reason).toContain("10.9.9.9");
    ap.apCfg!.controller = "192.168.1.5";
    net.clearDynamic();
    expect(net.apStatus(ap).wlc).not.toBeNull();
  });

  it("le client hors de portée ne voit aucun réseau ; un câble sur une carte Wi-Fi est refusé", () => {
    const { net, laptop, s1 } = lab();
    laptop.x = 5000;
    expect(net.visibleSsids(laptop)).toEqual([]);
    expect(net.connect(laptop.id, s1.id)).toContain("Wi-Fi");
  });

  it("un PC filaire atteint le contrôleur sur le port 443 (interface web)", () => {
    const { net, srv } = lab();
    expect(net.tcpConnect(srv, "192.168.1.5", 443)).toBe("open");
    expect(net.tcpConnect(srv, "192.168.1.5", 23)).toBe("refused");
  });
});

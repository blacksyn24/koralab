import { describe, expect, it } from "vitest";
import { evaluate } from "@/engine/checks";
import { IosCli } from "@/engine/cli/ios";
import { PcCli } from "@/engine/cli/pc";
import { Network, type Device } from "@/engine/network";
import { catalog } from "./index";

/** Tape des commandes sur un équipement (mode privilégié atteint par « enable »). */
function ios(net: Network, dev: Device, cmds: string, after: string[] = []) {
  const cli = new IosCli(net, dev);
  const errors: string[] = [];
  for (const raw of ["enable", "configure terminal", ...cmds.trim().split("\n"), "end", ...after]) {
    const line = raw.trim();
    if (!line) continue;
    const out = cli.exec(line);
    if (/% (Invalid|Incomplete|Ambiguous)|^% /m.test(out) && !/%(LINK|LINEPROTO|SYS|SSH|OSPF|HSRP|STANDBY|DHCP|PM|PORT|SPANTREE|EC)/.test(out)) errors.push(`${dev.hostname}: ${line} → ${out}`);
  }
  return errors;
}

const pc = (net: Network, dev: Device, cmds: string) => cmds.trim().split("\n").map((l) => new PcCli(net, dev).exec(l.trim()));

function setPc(dev: Device, ip: string, mask: string, gw?: string) {
  dev.ifaces[0].ip = ip;
  dev.ifaces[0].mask = mask;
  dev.gateway = gw;
}

type Sol = (net: Network, by: (name: string) => Device) => string[];

/** Solution de référence de chaque TP (ce qu'un étudiant doit faire). */
const SOLUTIONS: Record<string, Sol> = {
  "ccna1-01-configuration-de-base": (net, by) => {
    const e = [
      ...ios(net, by("R1"), `hostname R1-SIEGE
enable secret class
service password-encryption
banner motd #Accès réservé au personnel autorisé#
line console 0
password cisco
login
exit
interface g0/0/1
ip address 192.168.10.1 255.255.255.0
no shutdown`, ["copy running-config startup-config"]),
      ...ios(net, by("S1"), `hostname S1-SIEGE
enable secret class
service password-encryption
line console 0
password cisco
login
exit
interface vlan 1
ip address 192.168.10.2 255.255.255.0
no shutdown
exit
ip default-gateway 192.168.10.1`, ["copy running-config startup-config"]),
    ];
    setPc(by("PC-ADMIN"), "192.168.10.10", "255.255.255.0", "192.168.10.1");
    return e;
  },
  "ccna1-02-adressage-deux-lan": (net, by) => {
    const e = ios(net, by("R1"), `interface g0/0/0
ip address 172.16.10.1 255.255.255.0
no shutdown
interface g0/0/1
ip address 172.16.20.1 255.255.255.0
no shutdown`);
    setPc(by("PC-ACC1"), "172.16.10.11", "255.255.255.0", "172.16.10.1");
    setPc(by("PC-ACC2"), "172.16.10.12", "255.255.255.0", "172.16.10.1");
    setPc(by("PC-MED1"), "172.16.20.11", "255.255.255.0", "172.16.20.1");
    setPc(by("PC-MED2"), "172.16.20.12", "255.255.255.0", "172.16.20.1");
    return e;
  },
  "ccna1-03-vlsm-trois-sites": (net, by) => {
    const e = [
      ...ios(net, by("R1"), `interface g0/0/0
ip address 192.168.50.1 255.255.255.128
no shutdown
interface g0/0/1
ip address 192.168.50.129 255.255.255.192
no shutdown
interface g0/0/2
ip address 192.168.50.225 255.255.255.252
no shutdown
exit
ip route 192.168.50.192 255.255.255.224 192.168.50.226`),
      ...ios(net, by("R2"), `interface g0/0/2
ip address 192.168.50.226 255.255.255.252
no shutdown
interface g0/0/0
ip address 192.168.50.193 255.255.255.224
no shutdown
exit
ip route 0.0.0.0 0.0.0.0 192.168.50.225`),
    ];
    setPc(by("PC-PROD"), "192.168.50.10", "255.255.255.128", "192.168.50.1");
    setPc(by("PC-COM"), "192.168.50.140", "255.255.255.192", "192.168.50.129");
    setPc(by("PC-DIR"), "192.168.50.200", "255.255.255.224", "192.168.50.193");
    return e;
  },
  "ccna1-04-acces-ssh": (net, by) => {
    const ssh = `ip domain-name semelog.bj
crypto key generate rsa modulus 2048
username admin secret Kora2026
ip ssh version 2
line vty 0 4
transport input ssh
login local`;
    return [
      ...ios(net, by("R1"), `interface g0/0/1
ip address 10.20.0.1 255.255.255.0
no shutdown
exit
${ssh}`),
      ...ios(net, by("S1"), `interface vlan 1
ip address 10.20.0.2 255.255.255.0
no shutdown
exit
ip default-gateway 10.20.0.1
${ssh}`),
    ];
  },
  "ccna1-05-ipv6-slaac": (net, by) => {
    const e = ios(net, by("R1"), `ipv6 unicast-routing
interface g0/0/0
ipv6 address 2001:db8:acad:1::1/64
no shutdown
interface g0/0/1
ipv6 address 2001:db8:acad:2::1/64
no shutdown`);
    pc(net, by("PC-SALLE1"), "ipv6 autoconfig");
    pc(net, by("PC-SALLE2"), "ipv6 autoconfig");
    return e;
  },
  "ccna2-01-vlan-trunk": (net, by) => {
    const sw = `vlan 10
name VENTES
vlan 20
name COMPTA
vlan 99
name GESTION
exit
interface f0/1
switchport mode access
switchport access vlan 10
interface f0/2
switchport mode access
switchport access vlan 20
interface g0/1
switchport mode trunk
switchport trunk native vlan 99`;
    return [...ios(net, by("S1-ETAGE1"), sw), ...ios(net, by("S2-ETAGE2"), sw)];
  },
  "ccna2-02-router-on-a-stick": (net, by) => {
    const e = [
      ...ios(net, by("S1"), `vlan 10
name ADMIN
vlan 20
name ENSEIGNANTS
vlan 99
name GESTION
exit
interface f0/1
switchport mode access
switchport access vlan 10
interface f0/2
switchport mode access
switchport access vlan 20
interface g0/1
switchport mode trunk
interface vlan 99
ip address 192.168.99.2 255.255.255.0
no shutdown
exit
ip default-gateway 192.168.99.1`),
      ...ios(net, by("R1"), `interface g0/0/1
no shutdown
interface g0/0/1.10
encapsulation dot1Q 10
ip address 192.168.10.1 255.255.255.0
interface g0/0/1.20
encapsulation dot1Q 20
ip address 192.168.20.1 255.255.255.0
interface g0/0/1.99
encapsulation dot1Q 99
ip address 192.168.99.1 255.255.255.0`),
    ];
    setPc(by("PC-ADM"), "192.168.10.10", "255.255.255.0", "192.168.10.1");
    setPc(by("PC-PROF"), "192.168.20.10", "255.255.255.0", "192.168.20.1");
    return e;
  },
  "ccna2-03-switch-couche3": (net, by) => [
    ...ios(net, by("S1"), `vlan 10
name AGENCE
vlan 20
name CREDIT
exit
interface f0/1
switchport mode access
switchport access vlan 10
interface f0/2
switchport mode access
switchport access vlan 20
interface g0/1
switchport mode trunk`),
    ...ios(net, by("MS1"), `vlan 10
name AGENCE
vlan 20
name CREDIT
exit
ip routing
interface g1/0/1
switchport mode trunk
interface vlan 10
ip address 10.10.10.1 255.255.255.0
no shutdown
interface vlan 20
ip address 10.10.20.1 255.255.255.0
no shutdown
interface g1/1/1
no switchport
ip address 10.0.0.2 255.255.255.252
no shutdown
exit
ip route 0.0.0.0 0.0.0.0 10.0.0.1`),
    ...ios(net, by("R1"), `interface g0/0/0
ip address 10.0.0.1 255.255.255.252
no shutdown
interface loopback 0
ip address 8.8.8.8 255.255.255.255
exit
ip route 10.10.0.0 255.255.0.0 10.0.0.2`),
  ],
  "ccna2-04-spanning-tree": (net, by) => {
    const acc = `interface f0/1
spanning-tree portfast
spanning-tree bpduguard enable`;
    return [
      ...ios(net, by("S1"), `spanning-tree mode rapid-pvst
spanning-tree vlan 1 root primary`),
      ...ios(net, by("S2"), `spanning-tree mode rapid-pvst
spanning-tree vlan 1 root secondary
${acc}`),
      ...ios(net, by("S3"), `spanning-tree mode rapid-pvst
${acc}`),
    ];
  },
  "ccna2-05-etherchannel": (net, by) => [
    ...ios(net, by("S1"), `interface range g0/1 - 2
channel-group 1 mode active
interface port-channel 1
switchport mode trunk`),
    ...ios(net, by("S2"), `interface range g0/1 - 2
channel-group 1 mode active
interface range f0/23 - 24
channel-group 2 mode desirable
interface port-channel 1
switchport mode trunk
interface port-channel 2
switchport mode trunk`),
    ...ios(net, by("S3"), `interface range f0/23 - 24
channel-group 2 mode desirable
interface port-channel 2
switchport mode trunk`),
  ],
  "ccna2-06-dhcp-relais": (net, by) => {
    const e = [
      ...ios(net, by("R1"), `interface g0/0/0
ip address 192.168.11.1 255.255.255.0
no shutdown
interface g0/0/2
ip address 10.1.1.1 255.255.255.252
no shutdown
exit
ip route 192.168.22.0 255.255.255.0 10.1.1.2
ip dhcp excluded-address 192.168.11.1 192.168.11.9
ip dhcp excluded-address 192.168.22.1 192.168.22.9
ip dhcp pool BAT-A
network 192.168.11.0 255.255.255.0
default-router 192.168.11.1
dns-server 8.8.8.8
ip dhcp pool BAT-B
network 192.168.22.0 255.255.255.0
default-router 192.168.22.1
dns-server 8.8.8.8`),
      ...ios(net, by("R2"), `interface g0/0/2
ip address 10.1.1.2 255.255.255.252
no shutdown
interface g0/0/0
ip address 192.168.22.1 255.255.255.0
ip helper-address 10.1.1.1
no shutdown
exit
ip route 192.168.11.0 255.255.255.0 10.1.1.1`),
    ];
    for (const n of ["PC-A", "PC-B"]) pc(net, by(n), "ipconfig /renew");
    return e;
  },
  "ccna2-07-securite-ports": (net, by) => {
    const e = ios(net, by("S1"), `interface range f0/1 - 2
switchport mode access
switchport port-security
switchport port-security maximum 2
switchport port-security mac-address sticky
switchport port-security violation restrict
interface range f0/3 - 24
shutdown
exit
ip dhcp snooping
ip dhcp snooping vlan 1
interface g0/1
ip dhcp snooping trust`);
    for (const n of ["PC1", "PC2"]) pc(net, by(n), "ipconfig /renew");
    return e;
  },
  "ccna2-08-routes-flottantes": (net, by) => [
    ...ios(net, by("R1"), `interface g0/0/0
ip address 192.168.1.1 255.255.255.0
no shutdown
interface g0/0/1
ip address 10.13.0.1 255.255.255.252
no shutdown
interface g0/0/2
ip address 10.12.0.1 255.255.255.252
no shutdown
exit
ip route 192.168.3.0 255.255.255.0 10.13.0.2
ip route 192.168.3.0 255.255.255.0 10.12.0.2 10`),
    ...ios(net, by("R2"), `interface g0/0/2
ip address 10.12.0.2 255.255.255.252
no shutdown
interface g0/0/1
ip address 10.23.0.2 255.255.255.252
no shutdown
exit
ip route 192.168.1.0 255.255.255.0 10.12.0.1
ip route 192.168.3.0 255.255.255.0 10.23.0.1`),
    ...ios(net, by("R3"), `interface g0/0/0
ip address 192.168.3.1 255.255.255.0
no shutdown
interface g0/0/1
ip address 10.13.0.2 255.255.255.252
no shutdown
interface g0/0/2
ip address 10.23.0.1 255.255.255.252
no shutdown
exit
ip route 192.168.1.0 255.255.255.0 10.13.0.1
ip route 192.168.1.0 255.255.255.0 10.23.0.2 10`),
  ],
  "ccna2-09-hsrp": (net, by) => {
    const e = [
      ...ios(net, by("R1"), `interface g0/0/0
ip address 203.0.113.1 255.255.255.248
no shutdown
interface g0/0/1
ip address 192.168.100.1 255.255.255.0
standby 1 ip 192.168.100.254
standby 1 priority 150
standby 1 preempt
no shutdown
exit
ip route 0.0.0.0 0.0.0.0 203.0.113.6`),
      ...ios(net, by("R2"), `interface g0/0/0
ip address 203.0.113.2 255.255.255.248
no shutdown
interface g0/0/1
ip address 192.168.100.2 255.255.255.0
standby 1 ip 192.168.100.254
no shutdown
exit
ip route 0.0.0.0 0.0.0.0 203.0.113.6`),
    ];
    setPc(by("PC-URGENCES"), "192.168.100.10", "255.255.255.0", "192.168.100.254");
    return e;
  },
  "ccna2-10-wifi-controleur": (net, by) => {
    const e = [
      ...ios(net, by("S1"), `vlan 20
exit
interface range g0/1 - 2
switchport mode trunk`),
      ...ios(net, by("R1"), `interface g0/0/1
ip address 192.168.1.1 255.255.255.0
no shutdown
interface g0/0/1.20
encapsulation dot1Q 20
ip address 192.168.20.1 255.255.255.0
exit
ip dhcp excluded-address 192.168.1.1 192.168.1.9
ip dhcp excluded-address 192.168.20.1 192.168.20.9
ip dhcp pool GESTION
network 192.168.1.0 255.255.255.0
default-router 192.168.1.1
option 43 hex f104c0a80105
ip dhcp pool WIFI
network 192.168.20.0 255.255.255.0
default-router 192.168.20.1`),
    ];
    const wlc = by("WLC1");
    const c = wlc.wlcCfg!;
    c.mgmt = { name: "management", vlan: 0, ip: "192.168.1.5", mask: "255.255.255.0", gw: "192.168.1.1" };
    c.ifaces = [{ name: "employes", vlan: 20, ip: "192.168.20.5", mask: "255.255.255.0", gw: "192.168.20.1" }];
    c.wlans = [{ id: 1, profile: "Staff", ssid: "BelAzur-Staff", enabled: true, iface: "employes", security: "wpa2-psk", psk: "Hotel2026!" }];
    net.syncWlc(wlc);
    const lap = by("Laptop1");
    lap.wifi = { ssid: "BelAzur-Staff", psk: "Hotel2026!" };
    net.clearDynamic();
    lap.ifaces[0].dhcp = true;
    net.dhcpRequest(lap, "Wireless0");
    return e;
  },
  "ccna3-01-ospf": (net, by) => {
    const r = (name: string, lan: string, links: string[], rid: string, extra = "") =>
      ios(net, by(name), `${links.map((l) => l).join("\n")}
interface g0/0/0
ip address ${lan}.1 255.255.255.0
no shutdown
exit
${extra}
router ospf 1
router-id ${rid}
network ${lan}.0 0.0.0.255 area 0
passive-interface g0/0/0`);
    return [
      ...r(
        "R1",
        "172.16.1",
        ["interface g0/0/1", "ip address 10.0.12.1 255.255.255.252", "no shutdown", "interface g0/0/2", "ip address 10.0.13.1 255.255.255.252", "no shutdown"],
        "1.1.1.1",
        "ip route 0.0.0.0 0.0.0.0 loopback 0",
      ),
      ...ios(net, by("R1"), "router ospf 1\nnetwork 10.0.12.0 0.0.0.3 area 0\nnetwork 10.0.13.0 0.0.0.3 area 0\ndefault-information originate"),
      ...r("R2", "172.16.2", ["interface g0/0/1", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface g0/0/2", "ip address 10.0.23.1 255.255.255.252", "no shutdown"], "2.2.2.2"),
      ...ios(net, by("R2"), "router ospf 1\nnetwork 10.0.12.0 0.0.0.3 area 0\nnetwork 10.0.23.0 0.0.0.3 area 0"),
      ...r("R3", "172.16.3", ["interface g0/0/1", "ip address 10.0.13.2 255.255.255.252", "no shutdown", "interface g0/0/2", "ip address 10.0.23.2 255.255.255.252", "no shutdown"], "3.3.3.3"),
      ...ios(net, by("R3"), "router ospf 1\nnetwork 10.0.13.0 0.0.0.3 area 0\nnetwork 10.0.23.0 0.0.0.3 area 0"),
    ];
  },
  "ccna3-02-acl-standard": (net, by) =>
    ios(net, by("R1"), `interface g0/0/0
ip address 192.168.10.1 255.255.255.0
no shutdown
interface g0/0/1
ip address 192.168.20.1 255.255.255.0
no shutdown
interface g0/0/2
ip address 192.168.30.1 255.255.255.0
no shutdown
exit
access-list 10 deny 192.168.20.0 0.0.0.255
access-list 10 permit any
interface g0/0/2
ip access-group 10 out`),
  "ccna3-03-acl-etendue": (net, by) =>
    ios(net, by("R1"), `interface g0/0/0
ip address 10.50.1.1 255.255.255.0
no shutdown
interface g0/0/1
ip address 10.50.2.1 255.255.255.0
no shutdown
exit
ip access-list extended WEB-SEUL
permit tcp 10.50.1.0 0.0.0.255 host 10.50.2.10 eq 80
permit tcp 10.50.1.0 0.0.0.255 host 10.50.2.10 eq 443
deny ip 10.50.1.0 0.0.0.255 host 10.50.2.10
permit ip any any
exit
interface g0/0/0
ip access-group WEB-SEUL in`),
  "ccna3-04-nat-pat": (net, by) =>
    ios(net, by("R1"), `interface g0/0/0
ip address 192.168.1.1 255.255.255.0
ip nat inside
no shutdown
interface g0/0/2
ip address 203.0.113.2 255.255.255.252
ip nat outside
no shutdown
exit
ip route 0.0.0.0 0.0.0.0 203.0.113.1
access-list 1 permit 192.168.1.0 0.0.0.255
ip nat inside source list 1 interface g0/0/2 overload
ip nat inside source static 192.168.1.100 198.51.100.10`),
  "ccna3-05-supervision": (net, by) => [
    ...ios(net, by("R1"), `interface g0/0/1
ip address 10.99.0.1 255.255.255.0
no shutdown
exit
ntp master 3
logging host 10.99.0.50
snmp-server community Akp@Sup-ro ro`),
    ...ios(net, by("S1"), `interface vlan 1
ip address 10.99.0.2 255.255.255.0
no shutdown
exit
ip default-gateway 10.99.0.1
ntp server 10.99.0.1
logging host 10.99.0.50
snmp-server community Akp@Sup-ro ro`),
  ],
};

Object.assign(SOLUTIONS, {
  "depannage-01-connectivite": (net, by) => {
    const e = ios(net, by("R1"), "interface g0/0/1\nno shutdown");
    setPc(by("PC-DIR2"), "192.168.10.12", "255.255.255.0", "192.168.10.1");
    setPc(by("PC-COMPTA"), "192.168.20.10", "255.255.255.0", "192.168.20.1");
    return e;
  },
  "depannage-02-vlan-trunk": (net, by) => [
    ...ios(net, by("S1"), "interface g0/1\nswitchport mode trunk"),
    ...ios(net, by("S2"), "vlan 20\nname SECRETARIAT\nexit\ninterface f0/2\nswitchport access vlan 20"),
  ],
  "depannage-03-inter-vlan": (net, by) => {
    const e = [...ios(net, by("S1"), "interface g0/1\nswitchport mode trunk"), ...ios(net, by("R1"), "interface g0/0/1.20\nencapsulation dot1Q 20")];
    setPc(by("PC-ETUD"), "192.168.20.10", "255.255.255.0", "192.168.20.1");
    return e;
  },
  "depannage-04-dhcp": (net, by) => {
    const e = [
      ...ios(net, by("R2"), "interface g0/0/0\nip helper-address 10.1.1.1"),
      ...ios(net, by("R1"), "ip route 192.168.22.0 255.255.255.0 10.1.1.2\nip dhcp pool BAT-B\ndefault-router 192.168.22.1"),
    ];
    pc(net, by("PC-B"), "ipconfig /renew");
    return e;
  },
  "depannage-05-ospf": (net, by) => [
    ...ios(net, by("R2"), "router ospf 1\nno passive-interface g0/0/1"),
    ...ios(net, by("R3"), "router ospf 1\nno network 10.0.23.0 0.0.0.0 area 0\nnetwork 10.0.23.0 0.0.0.3 area 0\nnetwork 172.16.3.0 0.0.0.255 area 0"),
  ],
  "depannage-06-nat-acl": (net, by) =>
    ios(net, by("R1"), "interface g0/0/0\nip nat inside\nno ip access-group SECURITE in\ninterface g0/0/2\nip nat outside\nexit\nno access-list 1\naccess-list 1 permit 192.168.1.0 0.0.0.255"),
} satisfies Record<string, Sol>);

describe("Catalogue des TP guidés", () => {
  const tps = catalog();

  it("contient 20 TP guidés et 6 TP de dépannage, avec des identifiants uniques", () => {
    expect(tps).toHaveLength(26);
    expect(tps.filter((t) => t.category === "Dépannage")).toHaveLength(6);
    expect(new Set(tps.map((t) => t.id)).size).toBe(26);
    for (const l of ["CCNA 1", "CCNA 2", "CCNA 3"]) expect(tps.some((t) => t.level === l)).toBe(true);
    for (const t of tps) {
      expect(t.checks.length, t.id).toBeGreaterThanOrEqual(t.category === "Dépannage" ? 5 : 6);
      expect(t.brief.steps!.every((s) => s.checks.length > 0), t.id).toBe(true);
    }
  });

  for (const tp of catalog()) {
    it(`${tp.id} : la solution valide tous les critères`, () => {
      const net = Network.fromJSON(JSON.parse(tp.topology));
      const original = Network.fromJSON(JSON.parse(tp.topology));
      const name = (id: string) => original.getDevice(id)?.hostname ?? "?";
      // Avant : le TP n'est pas déjà réussi
      const before = evaluate(Network.fromJSON(JSON.parse(tp.topology)), tp.checks, name);
      expect(before.filter((r) => r.ok).length, `${tp.id} trop facile au départ`).toBeLessThan(before.length / 2);
      const by = (n: string) => {
        const d = net.devices.find((x) => x.hostname === n) ?? net.devices.find((x) => name(x.id) === n);
        if (!d) throw new Error(`${tp.id} : équipement ${n} introuvable`);
        return d;
      };
      const sol = SOLUTIONS[tp.id];
      expect(sol, `solution manquante pour ${tp.id}`).toBeTruthy();
      const errors = sol(net, by);
      expect(errors, errors.join("\n")).toEqual([]);
      const res = evaluate(net, tp.checks, name);
      const failed = res.filter((r) => !r.ok).map((r) => `✗ ${r.label} — ${r.hint ?? ""}`);
      expect(failed, `${tp.id}\n${failed.join("\n")}`).toEqual([]);
    });
  }
});

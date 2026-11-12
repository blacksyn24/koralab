"use client";

import { BaseEdge, getStraightPath, type EdgeProps } from "@xyflow/react";
import { ArrowLeft, ArrowRight, Globe, KeyRound, Lock, LogOut, Plus, RefreshCw, RotateCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { isIp, isMask } from "@/engine/ip";
import type { Device, Network, Wlan, WlcIface, WifiSecurity } from "@/engine/network";

const input = "mt-1 w-full rounded-lg bg-ink-800 px-2.5 py-1.5 font-mono text-sm text-white outline-none ring-1 ring-white/10 focus:ring-kora-300";
const btn = "w-full rounded-lg bg-kora-500 py-1.5 text-sm font-semibold text-white hover:bg-kora-400 disabled:opacity-50";
const btnGhost = "w-full rounded-lg py-1.5 text-sm font-semibold text-kora-200 ring-1 ring-white/15 hover:bg-white/5 hover:text-white";

export const SECURITY_LABEL: Record<WifiSecurity, string> = {
  open: "Ouvert (aucune sécurité)",
  "wpa2-psk": "WPA2 Personnel",
  "wpa3-psk": "WPA3 Personnel",
  "wpa2-ent": "WPA2 Entreprise (802.1X)",
  "wpa3-ent": "WPA3 Entreprise (802.1X)",
};
const isPsk = (s: WifiSecurity) => s === "wpa2-psk" || s === "wpa3-psk";
const isEnt = (s: WifiSecurity) => s === "wpa2-ent" || s === "wpa3-ent";

/** Liaison radio entre un client et son point d'accès (pointillés animés). */
export function WifiEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return <BaseEdge id={id} path={path} className="kora-wifi-edge" style={{ stroke: "#34d399", strokeWidth: 2, strokeDasharray: "6 6" }} />;
}

function Field({ label, value, onChange, ph, type = "text" }: { label: string; value: string; onChange: (v: string) => void; ph?: string; type?: string }) {
  return (
    <label className="block text-xs text-kora-200/80">
      {label}
      <input type={type} value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} className={input} />
    </label>
  );
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <p className={`rounded-lg px-2.5 py-1.5 text-xs ring-1 ${ok ? "bg-ok/10 text-ok ring-ok/30" : "bg-amber-400/10 text-amber-200 ring-amber-300/30"}`}>{children}</p>;
}

/** Panneau Wi-Fi d'un portable ou d'un téléphone : réseaux visibles, mot de passe, connexion. */
export function ClientWifiPanel({ dev, net, onChange }: { dev: Device; net: Network; onChange: () => void }) {
  const [ssid, setSsid] = useState(dev.wifi?.ssid ?? "");
  const [psk, setPsk] = useState(dev.wifi?.psk ?? "");
  const [user, setUser] = useState(dev.wifi?.user ?? "");
  const [pass, setPass] = useState(dev.wifi?.pass ?? "");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setSsid(dev.wifi?.ssid ?? "");
    setPsk(dev.wifi?.psk ?? "");
    setMsg("");
  }, [dev.id, dev.wifi?.ssid, dev.wifi?.psk]);
  const list = net.visibleSsids(dev);
  const sec = list.find((s) => s.ssid === ssid)?.security;
  const status = net.wifiStatus(dev);
  const nic = dev.ifaces[0];

  const connect = () => {
    if (!ssid) return setMsg("Choisissez un réseau.");
    dev.wifi = { ssid, psk: psk || undefined, user: user || undefined, pass: pass || undefined };
    net.clearDynamic();
    const st = net.wifiStatus(dev);
    if (st && "error" in st) {
      setMsg(st.error);
    } else if (!nic.ip || nic.dhcp) {
      nic.dhcp = true;
      const ack = net.dhcpRequest(dev, nic.name);
      setMsg(ack?.op === "ack" ? `Connecté à « ${ssid} » · adresse ${ack.yiaddr} (DHCP) ✓` : `Connecté à « ${ssid} », mais aucun serveur DHCP n'a répondu dans ce VLAN.`);
    } else setMsg(`Connecté à « ${ssid} » ✓`);
    onChange();
  };

  const disconnect = () => {
    dev.wifi = undefined;
    if (nic.dhcp) nic.ip = nic.mask = undefined;
    net.clearDynamic();
    setMsg("Déconnecté.");
    onChange();
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Wifi size={15} /> Wi-Fi
        </p>
        <button onClick={() => (net.clearDynamic(), onChange())} title="Rechercher les réseaux" className="text-kora-200/70 hover:text-white">
          <RefreshCw size={14} />
        </button>
      </div>
      {status && "ap" in status ? (
        <Status ok>
          Connecté à « {status.wlan.ssid} » via {status.ap.hostname} · VLAN {status.vlan || "natif"}
        </Status>
      ) : status && "error" in status ? (
        <Status ok={false}>{status.error}</Status>
      ) : null}
      {list.length === 0 ? (
        <p className="text-xs text-kora-200/60">Aucun réseau visible. Il faut un point d&apos;accès à portée, enregistré auprès d&apos;un contrôleur qui diffuse un réseau.</p>
      ) : (
        <div className="space-y-1">
          {list.map((s) => (
            <button
              key={s.ssid}
              onClick={() => setSsid(s.ssid)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ring-1 ${ssid === s.ssid ? "bg-kora-500/20 text-white ring-kora-300/50" : "text-kora-100 ring-white/10 hover:bg-white/5"}`}
            >
              <Wifi size={14} />
              <span className="min-w-0 flex-1 truncate">{s.ssid}</span>
              {s.security !== "open" && <Lock size={12} className="text-kora-200/60" />}
            </button>
          ))}
        </div>
      )}
      {sec && isPsk(sec) && <Field label="Mot de passe du réseau" type="password" value={psk} onChange={setPsk} />}
      {sec && isEnt(sec) && (
        <>
          <Field label="Identifiant" value={user} onChange={setUser} />
          <Field label="Mot de passe" type="password" value={pass} onChange={setPass} />
        </>
      )}
      <button onClick={connect} disabled={!ssid} className={btn}>
        Se connecter
      </button>
      {dev.wifi && (
        <button onClick={disconnect} className={btnGhost}>
          Se déconnecter
        </button>
      )}
      {msg && <p className="text-xs text-kora-200">{msg}</p>}
    </div>
  );
}

/** Panneau d'un point d'accès léger : adressage IP et contrôleur. */
export function ApPanel({ dev, net, onChange }: { dev: Device; net: Network; onChange: () => void }) {
  const nic = dev.ifaces[0];
  const cfg = (dev.apCfg ??= { dhcp: true });
  const [dhcp, setDhcp] = useState(cfg.dhcp);
  const [f, setF] = useState({ ip: "", mask: "", gw: "", ctrl: "" });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setDhcp(cfg.dhcp);
    setF({ ip: cfg.dhcp ? "" : (nic.ip ?? ""), mask: cfg.dhcp ? "" : (nic.mask ?? ""), gw: cfg.dhcp ? "" : (dev.gateway ?? ""), ctrl: cfg.controller ?? "" });
    setMsg("");
  }, [dev.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = net.apStatus(dev);

  const apply = () => {
    if (f.ctrl && !isIp(f.ctrl)) return setMsg("Adresse du contrôleur invalide.");
    if (!dhcp && (!isIp(f.ip) || !isMask(f.mask) || (f.gw && !isIp(f.gw)))) return setMsg("Adresse, masque ou passerelle invalide.");
    cfg.dhcp = dhcp;
    cfg.controller = f.ctrl || undefined;
    cfg.learned = undefined;
    if (dhcp) {
      nic.ip = nic.mask = undefined;
      dev.gateway = undefined;
    } else {
      nic.ip = f.ip;
      nic.mask = f.mask;
      dev.gateway = f.gw || undefined;
    }
    net.clearDynamic();
    const s = net.apStatus(dev);
    setMsg(s.wlc ? `Enregistré auprès de ${s.wlc.hostname} ✓` : s.reason);
    onChange();
  };

  return (
    <div className="w-72 shrink-0 space-y-2.5 overflow-y-auto p-4">
      <p className="text-sm font-semibold text-white">Point d&apos;accès {dev.hostname}</p>
      {st.wlc ? (
        <Status ok>
          Enregistré auprès de {st.wlc.hostname} ({st.wlc.wlcCfg?.mgmt.ip}) · IP {nic.ip}
        </Status>
      ) : (
        <Status ok={false}>{st.reason || "Pas encore enregistré."}</Status>
      )}
      <div className="flex gap-1.5 text-sm">
        {[true, false].map((v) => (
          <button key={String(v)} onClick={() => setDhcp(v)} className={`flex-1 rounded-lg py-1 ring-1 ${dhcp === v ? "bg-kora-500/25 text-white ring-kora-300/50" : "text-kora-200 ring-white/10"}`}>
            {v ? "DHCP" : "Statique"}
          </button>
        ))}
      </div>
      {!dhcp && (
        <>
          <Field label="Adresse IPv4" value={f.ip} onChange={(v) => setF({ ...f, ip: v.trim() })} ph="192.168.1.20" />
          <Field label="Masque" value={f.mask} onChange={(v) => setF({ ...f, mask: v.trim() })} ph="255.255.255.0" />
          <Field label="Passerelle" value={f.gw} onChange={(v) => setF({ ...f, gw: v.trim() })} ph="192.168.1.1" />
        </>
      )}
      <Field label="Adresse du contrôleur (facultatif)" value={f.ctrl} onChange={(v) => setF({ ...f, ctrl: v.trim() })} ph="option 43 ou même réseau" />
      <button onClick={apply} className={btn}>
        Appliquer
      </button>
      {msg && <p className="text-xs text-kora-200">{msg}</p>}
      <p className="text-[11px] leading-snug text-kora-200/50">
        Un point d&apos;accès léger trouve son contrôleur : dans le même réseau, par l&apos;option 43 du DHCP, ou par l&apos;adresse saisie ici. Les réseaux Wi-Fi se configurent sur le contrôleur.
      </p>
    </div>
  );
}

/** Assistant de démarrage du contrôleur (comme la configuration initiale en console). */
export function WlcPanel({ dev, net, onChange }: { dev: Device; net: Network; onChange: () => void }) {
  const c = dev.wlcCfg!;
  const init = () => ({ ip: c.mgmt.ip ?? "", mask: c.mgmt.mask ?? "", gw: c.mgmt.gw ?? "", vlan: String(c.mgmt.vlan || ""), user: c.admin.user, pass: "" });
  const [f, setF] = useState(init);
  const [msg, setMsg] = useState("");
  useEffect(() => (setF(init()), setMsg("")), [dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (!isIp(f.ip) || !isMask(f.mask) || (f.gw && !isIp(f.gw))) return setMsg("Adresse, masque ou passerelle invalide.");
    const vlan = f.vlan ? Number(f.vlan) : 0;
    if (!Number.isInteger(vlan) || vlan < 0 || vlan > 4094) return setMsg("VLAN invalide (laisser vide = non étiqueté).");
    if (!f.user.trim()) return setMsg("Nom d'utilisateur requis.");
    if (f.pass && f.pass.length < 6) return setMsg("Mot de passe : 6 caractères minimum.");
    c.mgmt = { ...c.mgmt, ip: f.ip, mask: f.mask, gw: f.gw || undefined, vlan };
    c.admin = { user: f.user.trim(), pass: f.pass || c.admin.pass };
    net.syncWlc(dev);
    setMsg(`Configuration appliquée ✓ Ouvrez un PC → onglet « Navigateur » → https://${f.ip}`);
    setF({ ...f, pass: "" });
    onChange();
  };

  return (
    <div className="w-80 shrink-0 space-y-2.5 overflow-y-auto p-4">
      <p className="text-sm font-semibold text-white">Contrôleur {dev.hostname} · démarrage</p>
      {c.mgmt.ip ? (
        <Status ok>
          Interface de gestion : {c.mgmt.ip} · {net.wlcAps(dev).length} point(s) d&apos;accès · {net.wlcClients(dev).length} client(s)
        </Status>
      ) : (
        <Status ok={false}>Contrôleur non configuré : donnez-lui une adresse de gestion.</Status>
      )}
      <Field label="Adresse IP de gestion" value={f.ip} onChange={(v) => setF({ ...f, ip: v.trim() })} ph="192.168.1.5" />
      <Field label="Masque" value={f.mask} onChange={(v) => setF({ ...f, mask: v.trim() })} ph="255.255.255.0" />
      <Field label="Passerelle" value={f.gw} onChange={(v) => setF({ ...f, gw: v.trim() })} ph="192.168.1.1" />
      <Field label="VLAN de gestion (vide = non étiqueté)" value={f.vlan} onChange={(v) => setF({ ...f, vlan: v.trim() })} ph="" />
      <Field label="Administrateur" value={f.user} onChange={(v) => setF({ ...f, user: v })} />
      <Field label="Nouveau mot de passe (facultatif)" type="password" value={f.pass} onChange={(v) => setF({ ...f, pass: v })} ph="inchangé" />
      <button onClick={apply} className={btn}>
        Appliquer
      </button>
      {msg && <p className="text-xs text-kora-200">{msg}</p>}
      <p className="text-[11px] leading-snug text-kora-200/50">
        Identifiants par défaut : admin / admin. Les réseaux Wi-Fi, les interfaces et les clients se gèrent dans l&apos;interface web du contrôleur, depuis le navigateur d&apos;un PC qui peut le joindre.
      </p>
    </div>
  );
}

// ---------- Navigateur web du PC ----------

type Page = { kind: "blank" } | { kind: "error"; title: string; text: string } | { kind: "site"; host: Device; ip: string } | { kind: "wlc"; wlc: Device; ip: string };

/** Navigateur web simulé : la page ne s'affiche que si le PC joint vraiment le serveur (TCP 80/443). */
export function Browser({ dev, net, onChange }: { dev: Device; net: Network; onChange: () => void }) {
  const [url, setUrl] = useState("");
  const [page, setPage] = useState<Page>({ kind: "blank" });
  const [loading, setLoading] = useState(false);
  useEffect(() => (setUrl(""), setPage({ kind: "blank" })), [dev.id]);

  const go = (raw = url) => {
    const m = raw.trim().match(/^(?:(https?):\/\/)?([^/:\s]+)(?::(\d+))?/i);
    if (!m) return;
    const scheme = (m[1] ?? "https").toLowerCase();
    let host = m[2];
    const port = m[3] ? Number(m[3]) : scheme === "http" ? 80 : 443;
    setUrl(`${scheme}://${host}${m[3] ? `:${m[3]}` : ""}`);
    if (!isIp(host)) {
      const known = dev.hosts?.find((h) => h.name === host)?.ip;
      if (!known) return setPage({ kind: "error", title: "Adresse introuvable", text: `Le nom « ${host} » ne peut pas être résolu. Saisissez l'adresse IP du serveur (par exemple https://192.168.1.5).` });
      host = known;
    }
    setLoading(true);
    window.setTimeout(() => {
      const r = net.tcpConnect(dev, host, port);
      setLoading(false);
      if (r === "timeout" || r === "filtered") setPage({ kind: "error", title: "Délai d'attente dépassé", text: `${host} ne répond pas. Vérifiez l'adresse du PC, sa passerelle, le routage, les VLAN et les ACL.` });
      else if (r === "refused") setPage({ kind: "error", title: "Connexion refusée", text: `${host} est joignable mais n'offre aucun site web sur le port ${port}.` });
      else {
        const owner = net.devices.find((d) => net.l3Ifaces(d).some((i) => i.ip === host));
        if (owner?.kind === "wlc") setPage({ kind: "wlc", wlc: owner, ip: host });
        else if (owner) setPage({ kind: "site", host: owner, ip: host });
        else setPage({ kind: "error", title: "Page indisponible", text: "Le serveur a répondu, mais aucune page n'est publiée." });
      }
      onChange();
    }, 250);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-950">
      <div className="flex items-center gap-2 border-b border-white/8 bg-ink-900 px-3 py-2">
        <ArrowLeft size={15} className="text-kora-200/40" />
        <ArrowRight size={15} className="text-kora-200/40" />
        <button onClick={() => go()} title="Actualiser" className="text-kora-200/70 hover:text-white">
          <RotateCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-ink-800 px-3 py-1 ring-1 ring-white/10 focus-within:ring-kora-300"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          {url.startsWith("https") ? <Lock size={13} className="text-ok" /> : <Globe size={13} className="text-kora-200/60" />}
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://192.168.1.5" className="min-w-0 flex-1 bg-transparent font-mono text-sm text-white outline-none" />
        </form>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-kora-200/60">Connexion…</div>
        ) : page.kind === "blank" ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-kora-200/60">
            <div>
              <Globe size={34} className="mx-auto mb-2 text-kora-300/60" />
              Saisissez l&apos;adresse d&apos;un serveur ou d&apos;un contrôleur Wi-Fi, par exemple <span className="font-mono text-kora-100">https://192.168.1.5</span>.
            </div>
          </div>
        ) : page.kind === "error" ? (
          <div className="mx-auto max-w-lg px-6 py-10 text-kora-100">
            <WifiOff size={30} className="mb-3 text-kora-200/60" />
            <p className="text-lg font-semibold text-white">{page.title}</p>
            <p className="mt-2 text-sm text-kora-200/80">{page.text}</p>
          </div>
        ) : page.kind === "site" ? (
          <div className="mx-auto max-w-lg px-6 py-10 text-kora-100">
            <p className="text-lg font-semibold text-white">Ça marche !</p>
            <p className="mt-2 text-sm text-kora-200/80">
              Page web par défaut de {page.host.hostname} ({page.ip}). La connexion TCP depuis {dev.hostname} a réussi.
            </p>
          </div>
        ) : (
          <WlcWebGui key={page.wlc.id + page.ip} wlc={page.wlc} net={net} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

// ---------- Interface web du contrôleur ----------

type Tab = "dash" | "wlan" | "ifaces" | "aaa" | "aps" | "clients" | "admin";
const TABS: [Tab, string][] = [
  ["dash", "Tableau de bord"],
  ["wlan", "Réseaux Wi-Fi"],
  ["ifaces", "Interfaces"],
  ["aaa", "Sécurité (RADIUS)"],
  ["aps", "Points d'accès"],
  ["clients", "Clients"],
  ["admin", "Administration"],
];

const gInput = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-violet-500";
const gBtn = "rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500";
const gGhost = "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100";

function GField({ label, value, onChange, type = "text", ph }: { label: string; value: string; onChange: (v: string) => void; type?: string; ph?: string }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input type={type} value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} className={gInput} />
    </label>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-4 text-center text-slate-400">{empty}</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-800">{c}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Interface web du contrôleur Wi-Fi (design KoraLab). */
export function WlcWebGui({ wlc, net, onChange }: { wlc: Device; net: Network; onChange: () => void }) {
  const c = wlc.wlcCfg!;
  const [logged, setLogged] = useState(false);
  const [cred, setCred] = useState({ user: "", pass: "" });
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("dash");
  const [, setV] = useState(0);
  const save = (fn: () => void) => {
    fn();
    net.syncWlc(wlc);
    setV((v) => v + 1);
    onChange();
  };

  if (!logged)
    return (
      <div className="grid min-h-full place-items-center bg-slate-100 p-6">
        <form
          className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (cred.user === c.admin.user && cred.pass === c.admin.pass) setLogged(true);
            else setErr("Identifiant ou mot de passe incorrect.");
          }}
        >
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-700 text-white">
              <Wifi size={18} />
            </span>
            <div>
              <p className="font-semibold text-slate-900">Contrôleur Wi-Fi {wlc.hostname}</p>
              <p className="text-xs text-slate-500">{wlc.model} · connexion administrateur</p>
            </div>
          </div>
          <GField label="Utilisateur" value={cred.user} onChange={(v) => setCred({ ...cred, user: v })} />
          <GField label="Mot de passe" type="password" value={cred.pass} onChange={(v) => setCred({ ...cred, pass: v })} />
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <button className={`${gBtn} w-full`}>Se connecter</button>
        </form>
      </div>
    );

  const aps = net.wlcAps(wlc);
  const clients = net.wlcClients(wlc);
  return (
    <div className="flex min-h-full bg-slate-100 text-slate-900">
      <nav className="w-48 shrink-0 bg-white p-3 shadow-sm">
        <p className="mb-3 flex items-center gap-2 px-2 text-sm font-bold text-purple-700">
          <Wifi size={16} /> {wlc.hostname}
        </p>
        {TABS.map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`mb-0.5 block w-full rounded-md px-2.5 py-1.5 text-left text-sm ${tab === t ? "bg-violet-100 font-semibold text-violet-800" : "text-slate-600 hover:bg-slate-100"}`}>
            {l}
          </button>
        ))}
        <button onClick={() => setLogged(false)} className="mt-4 flex items-center gap-1.5 px-2.5 text-xs text-slate-500 hover:text-slate-800">
          <LogOut size={13} /> Déconnexion
        </button>
      </nav>
      <main className="min-w-0 flex-1 p-5">
        {tab === "dash" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Tableau de bord</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Points d'accès", aps.length],
                ["Clients", clients.length],
                ["Réseaux Wi-Fi", c.wlans.filter((w) => w.enabled).length],
                ["Gestion", c.mgmt.ip ?? "—"],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{v}</p>
                </div>
              ))}
            </div>
            {!c.wlans.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Aucun réseau Wi-Fi : créez-en un dans « Réseaux Wi-Fi ».</p>}
          </div>
        )}
        {tab === "wlan" && <WlanTab wlc={wlc} save={save} />}
        {tab === "ifaces" && <IfacesTab wlc={wlc} save={save} />}
        {tab === "aps" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">Points d&apos;accès enregistrés</h2>
            <Table head={["Nom", "Modèle", "Adresse IP", "MAC", "Clients"]} rows={aps.map((a) => [a.hostname, a.model, a.ifaces[0].ip, a.ifaces[0].mac, clients.filter((x) => x.a.ap === a).length])} empty="Aucun point d'accès enregistré." />
          </div>
        )}
        {tab === "clients" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">Clients associés</h2>
            <Table
              head={["Appareil", "MAC", "Adresse IP", "Réseau", "VLAN", "Point d'accès"]}
              rows={clients.map(({ client, a }) => [client.hostname, client.ifaces[0].mac, client.ifaces[0].ip ?? "—", a.wlan.ssid, a.vlan || "natif", a.ap.hostname])}
              empty="Aucun client connecté."
            />
          </div>
        )}
        {tab === "admin" && <AdminTab wlc={wlc} save={save} />}
        {tab === "aaa" && <AaaTab wlc={wlc} save={save} />}
      </main>
    </div>
  );
}

function WlanTab({ wlc, save }: { wlc: Device; save: (fn: () => void) => void }) {
  const c = wlc.wlcCfg!;
  const blank = (): Wlan => ({ id: Math.max(0, ...c.wlans.map((w) => w.id)) + 1, profile: "", ssid: "", enabled: true, iface: "management", security: "wpa2-psk", psk: "" });
  const [edit, setEdit] = useState<Wlan | null>(null);
  const [err, setErr] = useState("");
  const ifaceNames = ["management", ...c.ifaces.map((i) => i.name)];

  const submit = () => {
    if (!edit) return;
    if (!edit.ssid.trim() || edit.ssid.length > 32) return setErr("SSID requis (32 caractères maximum).");
    if (c.wlans.some((w) => w.id !== edit.id && w.ssid === edit.ssid)) return setErr("Ce SSID existe déjà.");
    if (isPsk(edit.security) && (edit.psk ?? "").length < 8) return setErr("La clé WPA doit contenir au moins 8 caractères.");
    save(() => {
      const w = { ...edit, profile: edit.profile.trim() || edit.ssid, psk: isPsk(edit.security) ? edit.psk : undefined, aaa: isEnt(edit.security) ? (edit.aaa ?? "local") : undefined };
      c.wlans = c.wlans.some((x) => x.id === w.id) ? c.wlans.map((x) => (x.id === w.id ? w : x)) : [...c.wlans, w];
    });
    setEdit(null);
    setErr("");
  };

  if (edit)
    return (
      <div className="max-w-md space-y-3">
        <h2 className="text-lg font-bold">{c.wlans.some((w) => w.id === edit.id) ? "Modifier le réseau" : "Nouveau réseau Wi-Fi"}</h2>
        <GField label="Nom du profil" value={edit.profile} onChange={(v) => setEdit({ ...edit, profile: v })} ph="Employés" />
        <GField label="SSID (nom diffusé)" value={edit.ssid} onChange={(v) => setEdit({ ...edit, ssid: v })} ph="Kora-Employes" />
        <label className="block text-xs font-medium text-slate-600">
          Interface (VLAN des clients)
          <select value={edit.iface} onChange={(e) => setEdit({ ...edit, iface: e.target.value })} className={gInput}>
            {ifaceNames.map((n) => (
              <option key={n} value={n}>
                {n}
                {n === "management" ? ` (VLAN ${c.mgmt.vlan || "non étiqueté"})` : ` (VLAN ${c.ifaces.find((i) => i.name === n)?.vlan})`}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Sécurité
          <select value={edit.security} onChange={(e) => setEdit({ ...edit, security: e.target.value as WifiSecurity })} className={gInput}>
            {(Object.keys(SECURITY_LABEL) as WifiSecurity[]).map((s) => (
              <option key={s} value={s}>
                {SECURITY_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {isPsk(edit.security) && <GField label="Clé pré-partagée (8 caractères min.)" type="password" value={edit.psk ?? ""} onChange={(v) => setEdit({ ...edit, psk: v })} />}
        {isEnt(edit.security) && (
          <>
            <label className="block text-xs font-medium text-slate-600">
              Authentification 802.1X
              <select value={edit.aaa ?? "local"} onChange={(e) => setEdit({ ...edit, aaa: e.target.value as "local" | "radius" })} className={gInput}>
                <option value="local">Base locale du contrôleur</option>
                <option value="radius">Serveurs RADIUS</option>
              </select>
            </label>
            <p className="rounded-md bg-violet-50 p-2.5 text-xs text-violet-800">
              {edit.aaa === "radius" ? "Déclarez les serveurs dans « Sécurité (RADIUS) », puis le contrôleur comme client sur le serveur." : "Les comptes se créent dans « Administration »."}
            </p>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Réseau activé
        </label>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={submit} className={gBtn}>
            Enregistrer
          </button>
          <button onClick={() => (setEdit(null), setErr(""))} className={gGhost}>
            Annuler
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Réseaux Wi-Fi (WLAN)</h2>
        <button onClick={() => setEdit(blank())} className={`${gBtn} flex items-center gap-1`}>
          <Plus size={14} /> Nouveau
        </button>
      </div>
      <Table
        head={["ID", "Profil", "SSID", "Interface", "Sécurité", "État", ""]}
        rows={c.wlans.map((w) => [
          w.id,
          w.profile,
          w.ssid,
          w.iface,
          SECURITY_LABEL[w.security] + (isEnt(w.security) ? (w.aaa === "radius" ? " · RADIUS" : " · locale") : ""),
          <span key="s" className={w.enabled ? "text-emerald-600" : "text-slate-400"}>{w.enabled ? "Activé" : "Désactivé"}</span>,
          <span key="a" className="flex gap-2">
            <button onClick={() => setEdit({ ...w })} className="text-violet-700 hover:underline">
              Modifier
            </button>
            <button onClick={() => save(() => (c.wlans = c.wlans.filter((x) => x.id !== w.id)))} aria-label="Supprimer" className="text-slate-400 hover:text-rose-600">
              <Trash2 size={14} />
            </button>
          </span>,
        ])}
        empty="Aucun réseau Wi-Fi."
      />
    </div>
  );
}

function IfacesTab({ wlc, save }: { wlc: Device; save: (fn: () => void) => void }) {
  const c = wlc.wlcCfg!;
  const [f, setF] = useState({ name: "", vlan: "", ip: "", mask: "", gw: "" });
  const [err, setErr] = useState("");
  const add = () => {
    const vlan = Number(f.vlan);
    if (!/^[\w-]{1,24}$/.test(f.name) || f.name === "management" || c.ifaces.some((i) => i.name === f.name)) return setErr("Nom invalide ou déjà utilisé.");
    if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) return setErr("VLAN entre 1 et 4094.");
    if (vlan === c.mgmt.vlan || c.ifaces.some((i) => i.vlan === vlan)) return setErr("Ce VLAN est déjà utilisé par une autre interface.");
    if (!isIp(f.ip) || !isMask(f.mask) || (f.gw && !isIp(f.gw))) return setErr("Adresse, masque ou passerelle invalide.");
    const x: WlcIface = { name: f.name, vlan, ip: f.ip, mask: f.mask, gw: f.gw || undefined };
    save(() => (c.ifaces = [...c.ifaces, x]));
    setF({ name: "", vlan: "", ip: "", mask: "", gw: "" });
    setErr("");
  };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Interfaces</h2>
      <Table
        head={["Nom", "VLAN", "Adresse IP", "Masque", "Passerelle", ""]}
        rows={[
          ["management", c.mgmt.vlan || "non étiqueté", c.mgmt.ip ?? "—", c.mgmt.mask ?? "—", c.mgmt.gw ?? "—", ""],
          ...c.ifaces.map((i) => [
            i.name,
            i.vlan,
            i.ip,
            i.mask,
            i.gw ?? "—",
            <button
              key="d"
              onClick={() => save(() => ((c.ifaces = c.ifaces.filter((x) => x !== i)), c.wlans.forEach((w) => w.iface === i.name && (w.iface = "management"))))}
              aria-label="Supprimer"
              className="text-slate-400 hover:text-rose-600"
            >
              <Trash2 size={14} />
            </button>,
          ]),
        ]}
        empty=""
      />
      <div className="max-w-xl rounded-xl bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Nouvelle interface dynamique (un VLAN de clients)</p>
        <div className="grid grid-cols-2 gap-2">
          <GField label="Nom" value={f.name} onChange={(v) => setF({ ...f, name: v.trim() })} ph="employes" />
          <GField label="VLAN" value={f.vlan} onChange={(v) => setF({ ...f, vlan: v.trim() })} ph="20" />
          <GField label="Adresse IP" value={f.ip} onChange={(v) => setF({ ...f, ip: v.trim() })} ph="192.168.20.5" />
          <GField label="Masque" value={f.mask} onChange={(v) => setF({ ...f, mask: v.trim() })} ph="255.255.255.0" />
          <GField label="Passerelle" value={f.gw} onChange={(v) => setF({ ...f, gw: v.trim() })} ph="192.168.20.1" />
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <button onClick={add} className={`${gBtn} mt-3`}>
          Ajouter
        </button>
        <p className="mt-2 text-xs text-slate-500">Le port du switch relié au contrôleur doit être un trunk qui transporte ces VLAN.</p>
      </div>
    </div>
  );
}

function AdminTab({ wlc, save }: { wlc: Device; save: (fn: () => void) => void }) {
  const c = wlc.wlcCfg!;
  const [pw, setPw] = useState("");
  const [u, setU] = useState({ user: "", pass: "" });
  const [msg, setMsg] = useState("");
  return (
    <div className="max-w-xl space-y-5">
      <h2 className="text-lg font-bold">Administration</h2>
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Mot de passe de {c.admin.user}</p>
        <GField label="Nouveau mot de passe (6 caractères min.)" type="password" value={pw} onChange={setPw} />
        <button
          onClick={() => {
            if (pw.length < 6) return setMsg("Mot de passe trop court.");
            save(() => (c.admin = { ...c.admin, pass: pw }));
            setPw("");
            setMsg("Mot de passe modifié ✓");
          }}
          className={`${gBtn} mt-3`}
        >
          Modifier
        </button>
      </div>
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Comptes Wi-Fi Entreprise (802.1X, base locale)</p>
        <Table
          head={["Utilisateur", ""]}
          rows={c.users.map((x) => [
            x.user,
            <button key="d" onClick={() => save(() => (c.users = c.users.filter((y) => y !== x)))} aria-label="Supprimer" className="text-slate-400 hover:text-rose-600">
              <Trash2 size={14} />
            </button>,
          ])}
          empty="Aucun compte."
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <GField label="Utilisateur" value={u.user} onChange={(v) => setU({ ...u, user: v.trim() })} />
          <GField label="Mot de passe" type="password" value={u.pass} onChange={(v) => setU({ ...u, pass: v })} />
        </div>
        <button
          onClick={() => {
            if (!u.user || !u.pass || c.users.some((x) => x.user === u.user)) return setMsg("Utilisateur vide ou déjà existant.");
            save(() => (c.users = [...c.users, u]));
            setU({ user: "", pass: "" });
            setMsg("Compte ajouté ✓");
          }}
          className={`${gBtn} mt-3`}
        >
          Ajouter le compte
        </button>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </div>
  );
}

function AaaTab({ wlc, save }: { wlc: Device; save: (fn: () => void) => void }) {
  const c = wlc.wlcCfg!;
  const [f, setF] = useState({ ip: "", secret: "" });
  const [err, setErr] = useState("");
  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-lg font-bold">Serveurs d&apos;authentification RADIUS</h2>
      <Table
        head={["Priorité", "Adresse du serveur", "Port", "Secret partagé", ""]}
        rows={c.radius.map((r, i) => [
          i + 1,
          r.ip,
          1812,
          "••••••",
          <button key="d" onClick={() => save(() => (c.radius = c.radius.filter((x) => x !== r)))} aria-label="Supprimer" className="text-slate-400 hover:text-rose-600">
            <Trash2 size={14} />
          </button>,
        ])}
        empty="Aucun serveur RADIUS."
      />
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Ajouter un serveur</p>
        <div className="grid grid-cols-2 gap-2">
          <GField label="Adresse IP du serveur" value={f.ip} onChange={(v) => setF({ ...f, ip: v.trim() })} ph="192.168.1.50" />
          <GField label="Secret partagé" type="password" value={f.secret} onChange={(v) => setF({ ...f, secret: v })} />
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <button
          onClick={() => {
            if (!isIp(f.ip) || c.radius.some((r) => r.ip === f.ip)) return setErr("Adresse invalide ou déjà déclarée.");
            if (f.secret.length < 4) return setErr("Secret partagé : 4 caractères minimum.");
            save(() => (c.radius = [...c.radius, f]));
            setF({ ip: "", secret: "" });
            setErr("");
          }}
          className={`${gBtn} mt-3`}
        >
          Ajouter
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Le contrôleur interroge les serveurs dans l&apos;ordre, depuis son adresse de gestion ({c.mgmt.ip ?? "non configurée"}). Sur le serveur, déclarez cette adresse comme client avec le même secret.
        </p>
      </div>
    </div>
  );
}

/** Services d'un serveur : RADIUS (clients NAS, comptes, journal). */
export function ServerPanel({ dev, net, onChange }: { dev: Device; net: Network; onChange: () => void }) {
  const r = (dev.radius ??= { enabled: false, clients: [], users: [] });
  const [nas, setNas] = useState({ name: "", ip: "", secret: "" });
  const [u, setU] = useState({ user: "", pass: "" });
  const [msg, setMsg] = useState("");
  const commit = (fn: () => void, m: string) => {
    fn();
    net.clearDynamic();
    setMsg(m);
    onChange();
  };
  const log = net.radiusLogOf(dev);
  const small = "rounded-md px-2 py-1 text-xs";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <KeyRound size={15} /> Service RADIUS
        </p>
        <button
          onClick={() => commit(() => (r.enabled = !r.enabled), r.enabled ? "Service arrêté." : "Service démarré ✓")}
          className={`${small} font-semibold ring-1 ${r.enabled ? "bg-ok/15 text-ok ring-ok/40" : "text-kora-200 ring-white/15"}`}
        >
          {r.enabled ? "Activé" : "Désactivé"}
        </button>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-kora-100">Clients (contrôleurs autorisés)</p>
        {r.clients.map((n) => (
          <div key={n.ip} className="flex items-center justify-between rounded-md bg-ink-800 px-2 py-1 font-mono text-[11px] text-kora-100">
            {n.name || "NAS"} · {n.ip}
            <button onClick={() => commit(() => (r.clients = r.clients.filter((x) => x !== n)), "Client supprimé.")} aria-label="Supprimer" className="text-kora-200/60 hover:text-ko">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <div className="mt-1 space-y-1.5">
          <Field label="Nom" value={nas.name} onChange={(v) => setNas({ ...nas, name: v.trim() })} ph="WLC1" />
          <Field label="Adresse IP du contrôleur" value={nas.ip} onChange={(v) => setNas({ ...nas, ip: v.trim() })} ph="192.168.1.5" />
          <Field label="Secret partagé" type="password" value={nas.secret} onChange={(v) => setNas({ ...nas, secret: v })} />
          <button
            className={btnGhost}
            onClick={() => {
              if (!isIp(nas.ip) || nas.secret.length < 4 || r.clients.some((x) => x.ip === nas.ip)) return setMsg("Adresse invalide/déjà déclarée ou secret trop court.");
              commit(() => (r.clients = [...r.clients, nas]), "Client ajouté ✓");
              setNas({ name: "", ip: "", secret: "" });
            }}
          >
            Ajouter le client
          </button>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-kora-100">Comptes utilisateurs</p>
        {r.users.map((x) => (
          <div key={x.user} className="flex items-center justify-between rounded-md bg-ink-800 px-2 py-1 font-mono text-[11px] text-kora-100">
            {x.user}
            <button onClick={() => commit(() => (r.users = r.users.filter((y) => y !== x)), "Compte supprimé.")} aria-label="Supprimer" className="text-kora-200/60 hover:text-ko">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <div className="mt-1 space-y-1.5">
          <Field label="Utilisateur" value={u.user} onChange={(v) => setU({ ...u, user: v.trim() })} />
          <Field label="Mot de passe" type="password" value={u.pass} onChange={(v) => setU({ ...u, pass: v })} />
          <button
            className={btnGhost}
            onClick={() => {
              if (!u.user || !u.pass || r.users.some((x) => x.user === u.user)) return setMsg("Utilisateur vide ou déjà existant.");
              commit(() => (r.users = [...r.users, u]), "Compte ajouté ✓");
              setU({ user: "", pass: "" });
            }}
          >
            Ajouter le compte
          </button>
        </div>
      </div>
      {msg && <p className="text-xs text-kora-200">{msg}</p>}
      <div>
        <p className="mb-1 text-xs font-semibold text-kora-100">Journal</p>
        {log.length ? (
          log.map((l, i) => (
            <p key={i} className={`font-mono text-[10.5px] ${l.startsWith("Access-Accept") ? "text-ok" : "text-amber-200"}`}>
              {l}
            </p>
          ))
        ) : (
          <p className="text-[11px] text-kora-200/50">Aucune requête reçue.</p>
        )}
      </div>
    </div>
  );
}

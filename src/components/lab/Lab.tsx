"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { BookOpen, Boxes, Cable, CheckCircle2, CircleHelp, Cloud, CloudCheck, CloudOff, Download, FilePlus2, FlaskConical, Loader2, Lock, Monitor, MousePointer2, Network as SwitchIcon, RotateCcw, Router, Server, Trash2, Upload, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IosCli } from "@/engine/cli/ios";
import { PcCli } from "@/engine/cli/pc";
import { isIp, isMask } from "@/engine/ip";
import { Network, shortIf, type Device, type DeviceKind } from "@/engine/network";
import { evaluate, type Check, type CheckResult } from "@/engine/checks";
import { createLab } from "@/lib/labs";
import { AccountMenu } from "../auth/AccountMenu";
import { useAuth } from "../auth/AuthProvider";
import { DeviceNode, type DeviceNodeData } from "./DeviceNode";
import { LinkEdge, type LinkEdgeData } from "./LinkEdge";
import { Terminal, type Shell } from "./Terminal";

import { KoraLogo } from "@/components/Logo";
import { askConfirm, askText } from "@/components/Dialog";
import { BackButton } from "@/components/BackButton";

const STORAGE = "koralab:lab:v1";
const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

/** Topologie de départ du TP 01 (non configurée) : un routeur, deux switchs, deux PC. */
export function starter(): Network {
  const net = new Network();
  const r1 = net.addDevice("router", 330, 40);
  const s1 = net.addDevice("switch", 120, 230);
  const s2 = net.addDevice("switch", 540, 230);
  const pc1 = net.addDevice("pc", 40, 430);
  const pc2 = net.addDevice("pc", 200, 430);
  const pc3 = net.addDevice("pc", 460, 430);
  const pc4 = net.addDevice("pc", 620, 430);
  net.connect(r1.id, s1.id);
  net.connect(r1.id, s2.id);
  for (const pc of [pc1, pc2]) net.connect(s1.id, pc.id);
  for (const pc of [pc3, pc4]) net.connect(s2.id, pc.id);
  return net;
}

function load(): Network {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return Network.fromJSON(JSON.parse(raw));
  } catch {
    /* lab corrompu ou stockage indisponible : on repart d'un lab neuf */
  }
  return starter();
}

/** Lab enregistré en ligne (ouvert depuis « Mes labs »). */
export type CloudLab = { id: string; name: string; initial: Network; save: (json: string) => Promise<void> };

/** Mode TP : énoncé, topologie de départ et critères de vérification. */
export type TpMode = {
  id: string;
  title: string;
  statement: string;
  checks: Check[];
  initial: string;
  onResult?: (score: number, total: number) => void;
  /** Hackathon : correction sur le serveur, critères secrets. Renvoie le résultat de chaque critère et un message. */
  remote?: (json: string) => Promise<{ passed: boolean[]; message: string }>;
  /** Lien de retour (page du hackathon) */
  backHref?: string;
};

export function Lab({ cloud, tp }: { cloud?: CloudLab; tp?: TpMode }) {
  return (
    <ReactFlowProvider>
      <LabInner cloud={cloud} tp={tp} />
    </ReactFlowProvider>
  );
}

/** Bibliothèque d'équipements, classés par constructeur. */
const LIBRARY: { vendor: string; color: string; items: { kind: DeviceKind; label: string; icon: typeof Router; soon?: boolean }[] }[] = [
  {
    vendor: "Cisco (simulé)",
    color: "text-sky-300",
    items: [
      { kind: "router", label: "Routeur KR-4300", icon: Router },
      { kind: "switch", label: "Switch KS-24", icon: SwitchIcon },
    ],
  },
  {
    vendor: "Huawei (simulé)",
    color: "text-rose-300",
    items: [
      { kind: "router", label: "Routeur AR", icon: Router, soon: true },
      { kind: "switch", label: "Switch S", icon: SwitchIcon, soon: true },
    ],
  },
  {
    vendor: "MikroTik (simulé)",
    color: "text-slate-300",
    items: [{ kind: "router", label: "RouterBOARD", icon: Router, soon: true }],
  },
  {
    vendor: "Génériques",
    color: "text-emerald-300",
    items: [
      { kind: "pc", label: "PC", icon: Monitor },
      { kind: "pc", label: "Serveur", icon: Server, soon: true },
    ],
  },
];

function LabInner({ cloud, tp }: { cloud?: CloudLab; tp?: TpMode }) {
  const tpKey = tp ? `koralab:tp:${tp.id}` : null;
  const [library, setLibrary] = useState(false);
  const [tpPanel, setTpPanel] = useState(true);
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [remoteMsg, setRemoteMsg] = useState("");
  const flow = useReactFlow();
  const router = useRouter();
  const { user } = useAuth();
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const skipFirstSave = useRef(true);
  /** Dernier contenu enregistré en ligne et contenu en attente : évite les écritures inutiles (quota Firebase). */
  const lastSaved = useRef<string | null>(null);
  const pending = useRef<string | null>(null);
  const netRef = useRef<Network | null>(null);
  const [ready, setReady] = useState(false);
  const [ver, setVer] = useState(0);
  const bump = useCallback(() => setVer((v) => v + 1), []);
  const shells = useRef(new Map<string, Shell>());
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "cable">("select");
  const [picked, setPicked] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  // Chargement : lab en ligne, sinon dernier lab de ce navigateur (localStorage)
  useEffect(() => {
    if (tp) {
      // Mode TP : on reprend la progression de l'étudiant (navigateur), sinon la topologie de départ
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(tpKey!);
      } catch {
        /* stockage indisponible */
      }
      try {
        netRef.current = Network.fromJSON(JSON.parse(saved ?? tp.initial));
      } catch {
        netRef.current = Network.fromJSON(JSON.parse(tp.initial));
      }
    } else netRef.current = cloud?.initial ?? load();
    setReady(true);
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump, cloud]);

  const net = netRef.current;

  // Quand la console s'ouvre ou se ferme, le canevas change de taille : on recentre la topologie
  const consoleOpen = open.length > 0;
  useEffect(() => {
    const t = window.setTimeout(() => flow.fitView({ padding: 0.2, duration: 250 }), 60);
    return () => window.clearTimeout(t);
  }, [consoleOpen, flow]);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  // Sauvegarde automatique : en ligne (avec un petit délai) pour un lab du compte, sinon dans le navigateur
  useEffect(() => {
    if (!net) return;
    const json = JSON.stringify(net.toJSON());
    if (!cloud) {
      try {
        localStorage.setItem(tpKey ?? STORAGE, json);
      } catch {
        /* stockage plein ou bloqué */
      }
      return;
    }
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      lastSaved.current = json;
      return;
    }
    if (json === lastSaved.current) return; // rien n'a changé : aucune écriture
    pending.current = json;
    setSaveState("saving");
    // On attend 5 s sans modification avant d'écrire : une écriture par « pause », pas par commande
    const t = window.setTimeout(() => flushSave(), 5000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, net, cloud]);

  const flushSave = useCallback(() => {
    const json = pending.current;
    if (!cloud || !json || json === lastSaved.current) return;
    pending.current = null;
    cloud
      .save(json)
      .then(() => {
        lastSaved.current = json;
        setSaveState("saved");
      })
      .catch((e) => {
        console.error("[lab] sauvegarde en ligne impossible", e);
        pending.current = json;
        setSaveState("error");
      });
  }, [cloud]);

  // Enregistre tout de suite si l'étudiant quitte la page ou change d'onglet
  useEffect(() => {
    if (!cloud) return;
    const onHide = () => document.visibilityState === "hidden" && flushSave();
    window.addEventListener("pagehide", flushSave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flushSave();
      window.removeEventListener("pagehide", flushSave);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [cloud, flushSave]);

  /** Mode TP : teste les critères sur la topologie de l'étudiant. */
  const check = async () => {
    if (!tp || !net) return;
    if (tp.remote) {
      // Hackathon : le serveur corrige, on n'affiche que réussi / raté pour chaque critère
      setChecking(true);
      setTpPanel(true);
      try {
        const r = await tp.remote(JSON.stringify(net.toJSON()));
        setResults(r.passed.map((ok, i) => ({ ok, label: `Critère ${i + 1}` })));
        setRemoteMsg(r.message);
      } catch (e) {
        setRemoteMsg(e instanceof Error ? e.message : "Vérification impossible.");
      } finally {
        setChecking(false);
      }
      return;
    }
    const original = Network.fromJSON(JSON.parse(tp.initial));
    const name = (id: string) => original.getDevice(id)?.hostname ?? net.getDevice(id)?.hostname ?? "?";
    const res = evaluate(net, tp.checks, name);
    setResults(res);
    setTpPanel(true);
    bump();
    tp.onResult?.(res.filter((r) => r.ok).length, res.length);
  };

  const restartTp = async () => {
    if (!tp || !(await askConfirm("Recommencer le TP ?", { message: "La topologie de départ sera rechargée et votre configuration actuelle sera effacée.", ok: "Recommencer" }))) return;
    setResults(null);
    resetLab(Network.fromJSON(JSON.parse(tp.initial)));
  };

  /** Copie le lab du navigateur dans le compte, puis l'ouvre en mode « en ligne ». */
  const saveOnline = async () => {
    if (!net) return;
    if (!user) return router.push("/connexion?next=/lab");
    const name = await askText("Enregistrer en ligne", { label: "Nom du lab", defaultValue: `Lab du ${new Date().toLocaleDateString("fr-FR")}`, ok: "Enregistrer" });
    if (!name?.trim()) return;
    try {
      const id = await createLab(user.uid, name.trim(), JSON.stringify(net.toJSON()));
      router.push(`/lab?id=${id}`);
    } catch (e) {
      console.error(e);
      notify("Enregistrement impossible pour le moment. Réessayez.");
    }
  };

  // Nœuds du canevas (on garde l'état de sélection de React Flow)
  useEffect(() => {
    if (!net) return;
    setNodes((prev) =>
      net.devices.map((d) => ({
        id: d.id,
        type: "device",
        position: { x: d.x, y: d.y },
        selected: prev.find((p) => p.id === d.id)?.selected,
        data: { kind: d.kind, hostname: d.hostname, model: d.model, picked: picked === d.id, cableMode: tool === "cable" } satisfies DeviceNodeData,
      }))
    );
  }, [ver, net, picked, tool]);

  const edges: Edge[] = useMemo(() => {
    if (!net) return [];
    return net.links.map((l) => {
      const a = net.getDevice(l.a.dev)!;
      const b = net.getDevice(l.b.dev)!;
      const ai = a.ifaces.find((i) => i.name === l.a.iface)!;
      const bi = b.ifaces.find((i) => i.name === l.b.iface)!;
      return {
        id: l.id,
        source: a.id,
        target: b.id,
        type: "link",
        data: { aLabel: shortIf(l.a.iface), bLabel: shortIf(l.b.iface), aUp: net.isUp(a, ai), bUp: net.isUp(b, bi) } satisfies LinkEdgeData,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, net]);

  const shellFor = (d: Device): Shell => {
    let s = shells.current.get(d.id);
    if (!s) {
      s = d.kind === "pc" ? new PcCli(net!, d) : new IosCli(net!, d);
      shells.current.set(d.id, s);
    }
    return s;
  };

  const openConsole = (id: string) => {
    const d = net?.getDevice(id);
    if (!d) return;
    if (!logs[id]) {
      const sh = shellFor(d);
      const intro = d.kind === "pc" ? [sh.banner(), ""] : [`${d.hostname} con0 is now available`, "", "Press RETURN to get started.", "", ...(sh.banner() ? [sh.banner(), ""] : [])];
      setLogs((l) => ({ ...l, [id]: intro }));
    }
    setOpen((o) => (o.includes(id) ? o : [...o, id]));
    setActive(id);
  };

  const closeConsole = (id: string) => {
    setOpen((o) => o.filter((x) => x !== id));
    setActive((a) => (a === id ? (open.filter((x) => x !== id).at(-1) ?? null) : a));
  };

  const addDevice = (kind: DeviceKind) => {
    if (!net) return;
    const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight * 0.32 });
    const d = net.addDevice(kind, Math.round(center.x - 56 + (Math.random() * 80 - 40)), Math.round(center.y - 40 + (Math.random() * 60 - 30)));
    bump();
    notify(`${d.hostname} ajouté. Utilisez l'outil Câble pour le relier.`);
  };

  const onNodeClick = (_: unknown, node: Node) => {
    if (!net) return;
    if (tool === "cable") {
      if (!picked) return setPicked(node.id);
      if (picked === node.id) return setPicked(null);
      const res = net.connect(picked, node.id);
      setPicked(null);
      if (typeof res === "string") notify(res);
      else {
        const a = net.getDevice(res.a.dev)!;
        const b = net.getDevice(res.b.dev)!;
        notify(`Câble : ${a.hostname} ${shortIf(res.a.iface)} ↔ ${b.hostname} ${shortIf(res.b.iface)}`);
      }
      bump();
      return;
    }
    openConsole(node.id);
  };

  const onNodesChange = (changes: NodeChange[]) => {
    if (!net) return;
    let dirty = false;
    for (const c of changes) {
      if (c.type === "position" && c.position) {
        const d = net.getDevice(c.id);
        if (d) ((d.x = Math.round(c.position.x)), (d.y = Math.round(c.position.y)));
        if (!c.dragging) dirty = true;
      }
      if (c.type === "remove") {
        net.removeDevice(c.id);
        shells.current.delete(c.id);
        setOpen((o) => o.filter((x) => x !== c.id));
        dirty = true;
      }
    }
    setNodes((n) => applyNodeChanges(changes, n));
    if (dirty) bump();
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    if (!net) return;
    const removed = changes.filter((c) => c.type === "remove");
    for (const c of removed) net.disconnect(c.id);
    if (removed.length) bump();
  };

  const deleteSelection = () => {
    const sel = nodes.filter((n) => n.selected).map((n) => n.id);
    if (!sel.length) return notify("Sélectionnez d'abord un équipement (clic sur le canevas avec l'outil Sélection), ou un câble.");
    onNodesChange(sel.map((id) => ({ type: "remove", id })));
  };

  const resetLab = (next: Network) => {
    netRef.current = next;
    shells.current.clear();
    setLogs({});
    setOpen([]);
    setActive(null);
    setPicked(null);
    bump();
    window.setTimeout(() => flow.fitView({ padding: 0.25 }), 50);
  };

  const exportLab = () => {
    if (!net) return;
    const blob = new Blob([JSON.stringify(net.toJSON(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "koralab-lab.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importLab = async (file: File) => {
    try {
      resetLab(Network.fromJSON(JSON.parse(await file.text())));
      notify(`Lab « ${file.name} » chargé.`);
    } catch {
      notify("Ce fichier n'est pas un lab KoraLab valide.");
    }
  };

  const activeDev = active ? net?.getDevice(active) : undefined;

  if (!ready || !net) return <div className="grid h-dvh place-items-center text-kora-200">Chargement du labo…</div>;

  return (
    <div className="flex h-dvh flex-col">
      {/* En-tête */}
      <header className="flex items-center gap-3 border-b border-white/8 bg-ink-900/80 px-4 py-2.5 backdrop-blur">
        <BackButton fallback={tp?.backHref ?? (tp ? "/tps" : cloud ? "/mes-labs" : "/")} />
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <KoraLogo size={28} />
        </Link>
        <span className="hidden rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 sm:inline">BÊTA</span>
        {tp ? (
          <span className="ml-2 flex min-w-0 items-center gap-2 text-sm">
            <BookOpen size={15} className="shrink-0 text-kora-300" />
            <span className="truncate font-semibold text-white">{tp.title}</span>
          </span>
        ) : cloud ? (
          <span className="ml-2 flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-semibold text-white">{cloud.name}</span>
            <span className={`flex shrink-0 items-center gap-1 text-xs ${saveState === "error" ? "text-ko" : "text-kora-200/60"}`}>
              {saveState === "saving" ? <Loader2 size={13} className="animate-spin" /> : saveState === "error" ? <CloudOff size={13} /> : <CloudCheck size={13} />}
              <span className="hidden sm:inline">{saveState === "saving" ? "Enregistrement…" : saveState === "error" ? "Non enregistré" : "Enregistré en ligne"}</span>
            </span>
          </span>
        ) : (
          <button onClick={saveOnline} className="ml-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-kora-300 ring-1 ring-kora-300/30 hover:bg-white/8 hover:text-white">
            <Cloud size={15} /> <span className="hidden sm:inline">Enregistrer en ligne</span>
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-sm">
          {tp ? (
            <>
              {tp.backHref && (
                <Link href={tp.backHref} className="rounded-lg px-2.5 py-1.5 text-kora-200 hover:bg-white/8 hover:text-white">
                  ← Hackathon
                </Link>
              )}
              <button onClick={check} disabled={checking} className="flex items-center gap-1.5 rounded-lg bg-ok/90 px-3 py-1.5 font-semibold text-ink-950 hover:bg-ok disabled:opacity-60">
                {checking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {tp.remote ? "Soumettre" : "Vérifier"}
              </button>
              <TopButton icon={BookOpen} label="Énoncé" onClick={() => setTpPanel((v) => !v)} />
              <TopButton icon={RotateCcw} label="Recommencer" onClick={restartTp} />
            </>
          ) : (
            <>
              <TopButton icon={FilePlus2} label="Nouveau" onClick={async () => (await askConfirm("Nouveau lab ?", { message: "Le lab actuel sera effacé et vous repartirez de zéro.", ok: "Effacer et recommencer", danger: true })) && resetLab(new Network())} />
              <TopButton icon={FlaskConical} label="TP 01" title="Charger la topologie de départ du TP 01" onClick={async () => (await askConfirm("Charger le TP 01 ?", { message: "Le lab actuel sera remplacé par la topologie de départ du TP 01.", ok: "Charger" })) && resetLab(starter())} />
            </>
          )}
          <TopButton icon={Download} label="Exporter" onClick={exportLab} />
          <TopButton icon={Upload} label="Importer" onClick={() => fileInput.current?.click()} />
          <TopButton icon={CircleHelp} label="Aide" onClick={() => setHelp(true)} />
          <AccountMenu />
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => (e.target.files?.[0] && importLab(e.target.files[0]), (e.target.value = ""))} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Barre d'outils */}
        <aside className="z-10 flex w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-white/8 bg-ink-900/70 py-3">
          <ToolButton icon={MousePointer2} label="Sélection" active={tool === "select"} onClick={() => (setTool("select"), setPicked(null))} />
          <ToolButton icon={Cable} label="Câble" active={tool === "cable"} onClick={() => (setTool("cable"), notify("Cliquez sur un premier équipement, puis sur le second."))} />
          <div className="my-1 h-px w-10 bg-white/10" />
          <ToolButton icon={Boxes} label="Équipements" active={library} onClick={() => setLibrary((v) => !v)} />
          <div className="my-1 h-px w-10 bg-white/10" />
          <ToolButton icon={Trash2} label="Supprimer" onClick={deleteSelection} />
        </aside>

        {/* Bibliothèque d'équipements par constructeur */}
        {library && (
          <div className="absolute bottom-0 left-[72px] top-0 z-20 w-64 overflow-y-auto border-r border-white/10 bg-ink-900/97 p-3 shadow-2xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Équipements</p>
              <button onClick={() => setLibrary(false)} aria-label="Fermer la bibliothèque" className="text-kora-200/70 hover:text-white">
                <X size={16} />
              </button>
            </div>
            {LIBRARY.map((cat) => (
              <div key={cat.vendor} className="mb-3">
                <p className={`mb-1.5 font-mono text-[11px] uppercase tracking-wider ${cat.color}`}>{cat.vendor}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {cat.items.map((it) => (
                    <button
                      key={it.label}
                      disabled={it.soon}
                      onClick={() => addDevice(it.kind)}
                      title={it.soon ? "Bientôt disponible" : `Ajouter : ${it.label}`}
                      className="relative flex flex-col items-center gap-1 rounded-xl bg-white/[.05] px-2 py-2.5 text-center text-[11px] leading-tight text-kora-50 ring-1 ring-white/8 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <it.icon size={20} strokeWidth={1.7} />
                      {it.label}
                      {it.soon && (
                        <span className="absolute right-1 top-1 flex items-center gap-0.5 text-[9px] text-kora-200">
                          <Lock size={9} /> bientôt
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="mt-2 text-[11px] leading-snug text-kora-200/50">
              Les équipements reproduisent les commandes de chaque constructeur. KoraLab n&apos;est affilié à aucun d&apos;eux.
            </p>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Canevas */}
          <div className={`relative min-h-0 flex-1 ${tool === "cable" ? "connecting" : ""}`}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={() => setPicked(null)}
              nodesConnectable={false}
              deleteKeyCode={["Delete", "Backspace"]}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.3}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#3a3a3c" />
              <Controls showInteractive={false} position="bottom-right" />
            </ReactFlow>
            {tool === "cable" && (
              <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-amber-400/15 px-4 py-1.5 text-sm text-amber-200 ring-1 ring-amber-300/30">
                Mode câble : {picked ? `cliquez sur le 2ᵉ équipement (${net.getDevice(picked)?.hostname} sélectionné)` : "cliquez sur le 1ᵉʳ équipement"}
              </div>
            )}
            {!net.devices.length && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-kora-200/70">
                <div>
                  <p className="text-lg font-semibold text-white">Votre labo est vide</p>
                  <p className="mt-1 text-sm">Ajoutez un routeur, un switch ou un PC avec la barre de gauche, ou chargez le TP 01.</p>
                </div>
              </div>
            )}
          </div>

          {/* Consoles */}
          {open.length > 0 && activeDev && (
            <section className="flex h-[44vh] min-h-[220px] flex-col border-t border-white/10 bg-[#0a0a0b]">
              <div className="flex items-center gap-1 overflow-x-auto border-b border-white/8 bg-ink-900 px-2 pt-1.5">
                {open.map((id) => {
                  const d = net.getDevice(id);
                  if (!d) return null;
                  return (
                    <div
                      key={id}
                      className={`flex items-center gap-2 rounded-t-lg px-3 py-1.5 text-sm ${id === active ? "bg-[#0a0a0b] text-white" : "text-kora-200/70 hover:text-white"}`}
                    >
                      <button onClick={() => setActive(id)}>{d.hostname}</button>
                      <button aria-label={`Fermer ${d.hostname}`} onClick={() => closeConsole(id)} className="opacity-60 hover:opacity-100">
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex min-h-0 flex-1">
                {activeDev.kind === "pc" && <PcConfig dev={activeDev} net={net} onChange={bump} />}
                <div className="min-w-0 flex-1">
                  <Terminal
                    key={activeDev.id}
                    shell={shellFor(activeDev)}
                    lines={logs[activeDev.id] ?? []}
                    onLines={(l) => setLogs((x) => ({ ...x, [activeDev.id]: l }))}
                    onChange={bump}
                  />
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Mode TP : énoncé et résultats de la vérification */}
        {tp && tpPanel && (
          <aside className="flex w-[22rem] shrink-0 flex-col border-l border-white/8 bg-ink-900/80">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
              <p className="font-semibold text-white">Énoncé</p>
              <button onClick={() => setTpPanel(false)} aria-label="Masquer l'énoncé" className="text-kora-200/70 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {remoteMsg && <p className="mb-3 rounded-xl bg-kora-500/15 px-3 py-2 text-sm text-kora-50 ring-1 ring-kora-300/30">{remoteMsg}</p>}
              {results && (
                <div className="mb-4 rounded-xl bg-ink-950 p-3 ring-1 ring-white/10">
                  <p className="font-semibold">
                    Score : {results.filter((r) => r.ok).length} / {results.length}
                    {results.every((r) => r.ok) && " 🎉 TP réussi !"}
                  </p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {results.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        {r.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-ko" />}
                        <span>
                          <span className={r.ok ? "text-kora-50" : "text-white"}>{r.label}</span>
                          {!r.ok && r.hint && <span className="block text-xs text-kora-200/60">{r.hint}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-kora-200">{tp.statement || "Aucun énoncé."}</div>
            </div>
            <div className="border-t border-white/8 p-3">
              <button onClick={check} disabled={checking} className="flex w-full items-center justify-center gap-2 rounded-xl bg-ok/90 py-2 font-semibold text-ink-950 hover:bg-ok disabled:opacity-60">
                {checking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {tp.remote ? "Soumettre ma solution" : "Vérifier mon TP"}
              </button>
            </div>
          </aside>
        )}

        {toast && <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-ink-800 px-4 py-2 text-sm text-white shadow-xl ring-1 ring-white/10">{toast}</div>}
      </div>

      <footer className="border-t border-white/8 bg-ink-900/80 px-4 py-1.5 text-center text-[11px] text-kora-200/50">
        KoraLab simule des commandes de style Cisco IOS à des fins pédagogiques. KoraLab n&apos;est affilié à aucun constructeur. {cloud ? "Votre lab est enregistré dans votre compte." : "Votre lab est enregistré dans ce navigateur."}
      </footer>

      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  );
}

function TopButton({ icon: Icon, label, title, onClick }: { icon: typeof X; label: string; title?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title ?? label} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-kora-200 hover:bg-white/8 hover:text-white">
      <Icon size={16} />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function ToolButton({ icon: Icon, label, active, onClick }: { icon: typeof X; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex w-[60px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] transition ${active ? "bg-kora-500 text-white" : "text-kora-200 hover:bg-white/8 hover:text-white"}`}
    >
      <Icon size={20} strokeWidth={1.7} />
      {label}
    </button>
  );
}

/** Configuration IP d'un PC (comme l'onglet « IP Configuration » d'un vrai simulateur). */
function PcConfig({ dev, net, onChange }: { dev: Device; net: Network; onChange: () => void }) {
  const nic = dev.ifaces[0];
  const [form, setForm] = useState({ ip: nic.ip ?? "", mask: nic.mask ?? "", gw: dev.gateway ?? "", dns: dev.dns ?? "" });
  const [msg, setMsg] = useState("");
  useEffect(() => setForm({ ip: nic.ip ?? "", mask: nic.mask ?? "", gw: dev.gateway ?? "", dns: dev.dns ?? "" }), [dev.id, nic.ip, nic.mask, dev.gateway, dev.dns]);

  const apply = () => {
    if ((form.ip && !isIp(form.ip)) || (form.mask && !isMask(form.mask)) || (form.gw && !isIp(form.gw)) || (form.dns && !isIp(form.dns)))
      return setMsg("Une valeur est invalide (format attendu : 192.168.1.10).");
    nic.ip = form.ip || undefined;
    nic.mask = form.mask || undefined;
    dev.gateway = form.gw || undefined;
    dev.dns = form.dns || undefined;
    net.clearDynamic();
    setMsg("Configuration appliquée ✓");
    onChange();
  };

  const field = (key: keyof typeof form, label: string, ph: string) => (
    <label className="block text-xs text-kora-200/80">
      {label}
      <input
        value={form[key]}
        placeholder={ph}
        onChange={(e) => setForm({ ...form, [key]: e.target.value.trim() })}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        className="mt-1 w-full rounded-lg bg-ink-800 px-2.5 py-1.5 font-mono text-sm text-white outline-none ring-1 ring-white/10 focus:ring-kora-300"
      />
    </label>
  );

  return (
    <div className="w-60 shrink-0 space-y-2.5 overflow-y-auto border-r border-white/8 bg-ink-900/60 p-3">
      <p className="text-sm font-semibold text-white">Configuration IP</p>
      {field("ip", "Adresse IPv4", "192.168.1.10")}
      {field("mask", "Masque", "255.255.255.0")}
      {field("gw", "Passerelle", "192.168.1.1")}
      {field("dns", "Serveur DNS", "facultatif")}
      <button onClick={apply} className="w-full rounded-lg bg-kora-500 py-1.5 text-sm font-semibold text-white hover:bg-kora-400">
        Appliquer
      </button>
      {msg && <p className="text-xs text-kora-200">{msg}</p>}
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["enable", "Passer en mode privilégié (#)"],
    ["configure terminal", "Mode configuration (abrégé : conf t)"],
    ["hostname R1", "Renommer l'équipement"],
    ["interface g0/0/0", "Configurer une interface"],
    ["ip address 192.168.1.1 255.255.255.0", "Adresse IP de l'interface"],
    ["no shutdown", "Activer l'interface (éteinte par défaut sur un routeur)"],
    ["ip route 10.0.0.0 255.0.0.0 192.168.1.2", "Route statique"],
    ["interface vlan 1 · ip default-gateway", "Gestion à distance d'un switch"],
    ["show ip interface brief", "État des interfaces (sh ip int br)"],
    ["show ip route · show arp · show mac address-table", "Tables de routage, ARP et MAC"],
    ["show running-config", "Configuration en cours"],
    ["ping · traceroute", "Tester la connectivité"],
    ["copy running-config startup-config", "Sauvegarder"],
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-ink-900 p-6 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Prise en main</h2>
          <button onClick={onClose} aria-label="Fermer">
            <X />
          </button>
        </div>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-kora-200">
          <li>Ajoutez des équipements avec la barre de gauche (Routeur, Switch, PC).</li>
          <li>
            Choisissez l&apos;outil <b>Câble</b>, cliquez sur deux équipements : le câble se branche sur les premiers ports libres. Les voyants sont verts quand le lien est actif.
          </li>
          <li>
            Avec l&apos;outil <b>Sélection</b>, cliquez sur un équipement pour ouvrir sa console. Pour un PC, renseignez l&apos;adresse IP à gauche ou tapez <code>ip 192.168.1.10/24 192.168.1.1</code>.
          </li>
          <li>
            Dans les consoles : <b>Tab</b> complète un mot, <b>?</b> affiche l&apos;aide, <b>↑ ↓</b> rappelle les commandes, <b>Ctrl+Z</b> revient au mode privilégié.
          </li>
          <li>Votre lab est enregistré automatiquement dans le navigateur. Exportez-le pour le partager.</li>
        </ol>
        <h3 className="mt-6 font-semibold">Commandes disponibles (routeurs et switchs)</h3>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {rows.map(([c, d]) => (
              <tr key={c} className="border-t border-white/8">
                <td className="py-1.5 pr-3 font-mono text-kora-300">{c}</td>
                <td className="py-1.5 text-kora-200/80">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-kora-200/50">
          Sécurité (enable secret, line, ssh…) : les commandes sont acceptées et apparaissent dans la configuration ; leur effet complet arrive dans une prochaine version.
        </p>
      </div>
    </div>
  );
}

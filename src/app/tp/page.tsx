"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Lab, starter, type TpMode } from "@/components/lab/Lab";
import type { Check } from "@/engine/checks";
import { catalogTp } from "@/lib/catalog";
import { getTp, recordProgress } from "@/lib/tps";

/** TP de démonstration, sans base de données : la topologie du TP 01 Kora Logistique. */
function demoTp(): Omit<TpMode, "onResult"> {
  const net = starter();
  const id = (h: string) => net.devices.find((d) => d.hostname === h)!.id;
  const checks: Check[] = [
    { type: "hostname", device: id("R1"), value: "R1-KORA" },
    { type: "ip", device: id("R1"), iface: "GigabitEthernet0/0/0", ip: "192.168.50.1", mask: "255.255.255.128" },
    { type: "ip", device: id("R1"), iface: "GigabitEthernet0/0/1", ip: "192.168.50.129", mask: "255.255.255.192" },
    { type: "up", device: id("R1"), iface: "GigabitEthernet0/0/1" },
    { type: "gateway", device: id("PC1"), value: "192.168.50.1" },
    { type: "ping", device: id("PC1"), to: "192.168.50.140" },
  ];
  return {
    id: "demo",
    title: "Démo — Kora Logistique : mise en service",
    checks,
    initial: JSON.stringify(net.toJSON()),
    statement: "",
    brief: {
      context: "Kora Logistique (entreprise fictive, Cotonou) emménage dans un nouveau bâtiment. Mettez le réseau en service.",
      objectives: `Nommez le routeur R1-KORA.
Configurez et activez G0/0/0 (LAN Opérations) et G0/0/1 (LAN Administration).
Configurez PC1 et PC3 selon la table d'adressage.
Vérifiez que PC1 réussit à pinguer PC3.`,
      addressing: [
        { device: "R1-KORA", iface: "G0/0/0", ip: "192.168.50.1", mask: "255.255.255.128", gw: "" },
        { device: "R1-KORA", iface: "G0/0/1", ip: "192.168.50.129", mask: "255.255.255.192", gw: "" },
        { device: "PC1", iface: "NIC", ip: "192.168.50.10", mask: "255.255.255.128", gw: "192.168.50.1" },
        { device: "PC3", iface: "NIC", ip: "192.168.50.140", mask: "255.255.255.192", gw: "192.168.50.129" },
      ],
      steps: [
        { title: "Nommer le routeur", body: "Sur R1, entrez en mode de configuration globale avec `configure terminal`, puis nommez-le `R1-KORA`.", checks: [0] },
        {
          title: "Configurer les interfaces du routeur",
          body: "1. Sur `G0/0/0`, configurez `192.168.50.1 255.255.255.128` (LAN Opérations).\n2. Sur `G0/0/1`, configurez `192.168.50.129 255.255.255.192` (LAN Administration).\n3. Activez les deux interfaces avec `no shutdown`.",
          checks: [1, 2, 3],
        },
        {
          title: "Configurer les PC",
          body: "Cliquez sur un PC, puis renseignez son adresse dans « Configuration IP » :\n• PC1 : `192.168.50.10` / `255.255.255.128`, passerelle `192.168.50.1`\n• PC3 : `192.168.50.140` / `255.255.255.192`, passerelle `192.168.50.129`",
          checks: [4],
        },
        { title: "Vérifier la connectivité", body: "Depuis PC1, lancez `ping 192.168.50.140`. Les premiers paquets peuvent être perdus le temps de la résolution ARP.", checks: [5] },
      ],
      commands: [
        { cmd: "enable", desc: "Passer en mode privilégié" },
        { cmd: "configure terminal", desc: "Entrer en mode de configuration globale" },
        { cmd: "hostname <nom>", desc: "Nommer l'équipement" },
        { cmd: "interface <nom>", desc: "Entrer dans la configuration d'une interface" },
        { cmd: "ip address <adresse> <masque>", desc: "Adresser une interface" },
        { cmd: "no shutdown", desc: "Activer l'interface" },
        { cmd: "show ip interface brief", desc: "Résumé des interfaces" },
        { cmd: "ping <adresse>", desc: "Tester la connectivité" },
      ],
      tips: `Les interfaces d'un routeur sont éteintes par défaut : pensez à « no shutdown ».
« show ip interface brief » résume l'état des interfaces.
Cliquez sur « Vérifier » à tout moment pour voir votre score.`,
    },
  };
}

function TpLoader() {
  const id = useSearchParams().get("id");
  const { user } = useAuth();
  const [tp, setTp] = useState<Omit<TpMode, "onResult"> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return setError("Aucun TP choisi.");
    if (id === "demo") return setTp(demoTp());
    const builtin = catalogTp(id);
    if (builtin) return setTp({ id: builtin.id, title: builtin.title, statement: builtin.statement, checks: builtin.checks, initial: builtin.topology, brief: builtin.brief });
    getTp(id)
      .then((t) => {
        if (!t || !t.topology) return setError("Ce TP n'existe pas ou n'est pas encore publié.");
        setTp({ id: t.id, title: t.title, statement: t.statement, checks: t.checks, initial: t.topology, brief: { image: t.image, context: t.context, objectives: t.objectives, addressing: t.addressing, tips: t.tips, steps: t.steps, commands: t.commands } });
      })
      .catch(() => setError("Ce TP n'est pas disponible."));
  }, [id]);

  if (error)
    return (
      <div className="grid h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-lg font-semibold">{error}</p>
          <Link href="/tps" className="mt-4 inline-block rounded-lg bg-kora-500 px-4 py-2 font-semibold text-white">
            Voir les TP
          </Link>
        </div>
      </div>
    );
  if (!tp) return <div className="grid h-dvh place-items-center text-kora-200">Chargement du TP…</div>;
  return (
    <Lab
      key={tp.id}
      tp={{
        ...tp,
        // La progression est enregistrée dans le compte (meilleur score conservé)
        onResult: (score, total) => {
          if (user && tp.id !== "demo") recordProgress(user.uid, tp.id, score, total).catch((e) => console.error("[tp] progression non enregistrée", e));
        },
      }}
    />
  );
}

export default function TpPage() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-kora-200">Chargement du TP…</div>}>
      <TpLoader />
    </Suspense>
  );
}

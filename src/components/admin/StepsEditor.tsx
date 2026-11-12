"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { describe, type Check } from "@/engine/checks";
import type { Device } from "@/engine/network";
import type { TpCommand, TpStep } from "@/lib/tps";

const input = "w-full rounded-xl bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-kora-300";

/** Commandes courantes proposées en un clic (avec leur explication). */
export const COMMON_COMMANDS: TpCommand[] = [
  { cmd: "enable", desc: "Passer en mode privilégié" },
  { cmd: "configure terminal", desc: "Entrer en mode de configuration globale" },
  { cmd: "hostname <nom>", desc: "Nommer l'équipement" },
  { cmd: "enable secret <mot de passe>", desc: "Mot de passe chiffré du mode privilégié" },
  { cmd: "service password-encryption", desc: "Chiffrer les mots de passe en clair de la configuration" },
  { cmd: "banner motd # <message> #", desc: "Message affiché à la connexion" },
  { cmd: "line console 0", desc: "Configurer la ligne console" },
  { cmd: "line vty 0 4", desc: "Configurer les accès à distance" },
  { cmd: "interface <nom>", desc: "Entrer dans la configuration d'une interface" },
  { cmd: "ip address <adresse> <masque>", desc: "Adresser une interface" },
  { cmd: "no shutdown", desc: "Activer l'interface" },
  { cmd: "ip default-gateway <adresse>", desc: "Passerelle d'un switch de couche 2" },
  { cmd: "ip domain-name <nom>", desc: "Nom de domaine (requis pour SSH)" },
  { cmd: "crypto key generate rsa modulus 2048", desc: "Générer les clés RSA pour SSH" },
  { cmd: "username <nom> secret <mot de passe>", desc: "Créer un compte local" },
  { cmd: "ip ssh version 2", desc: "Imposer SSH version 2" },
  { cmd: "transport input ssh", desc: "N'autoriser que SSH sur les lignes VTY" },
  { cmd: "login local", desc: "Authentifier avec les comptes locaux" },
  { cmd: "vlan <numéro>", desc: "Créer un VLAN" },
  { cmd: "switchport mode access", desc: "Port d'accès" },
  { cmd: "switchport access vlan <numéro>", desc: "Affecter le port à un VLAN" },
  { cmd: "switchport mode trunk", desc: "Port trunk 802.1Q" },
  { cmd: "encapsulation dot1Q <vlan>", desc: "VLAN d'une sous-interface (router-on-a-stick)" },
  { cmd: "ip dhcp pool <nom>", desc: "Créer un pool DHCP" },
  { cmd: "ip route <réseau> <masque> <saut suivant>", desc: "Route statique" },
  { cmd: "router ospf <processus>", desc: "Activer OSPF" },
  { cmd: "show ip interface brief", desc: "Résumé des interfaces" },
  { cmd: "show running-config", desc: "Configuration en cours" },
  { cmd: "show vlan brief", desc: "Liste des VLAN et de leurs ports" },
  { cmd: "show ip route", desc: "Table de routage" },
  { cmd: "copy running-config startup-config", desc: "Sauvegarder la configuration" },
  { cmd: "ping <adresse>", desc: "Tester la connectivité" },
];

/** Éditeur des étapes guidées : titre, consignes et critères qui valident chaque étape. */
export function StepsEditor({ steps, checks, devices, onChange }: { steps: TpStep[]; checks: Check[]; devices: Device[]; onChange: (s: TpStep[]) => void }) {
  const name = (id: string) => devices.find((d) => d.id === id)?.hostname ?? "?";
  const setAt = (i: number, patch: Partial<TpStep>) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const used = new Set(steps.flatMap((s) => s.checks));
  const orphan = checks.map((_, i) => i).filter((i) => !used.has(i));

  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="rounded-xl bg-ink-950/50 p-3 ring-1 ring-white/8">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-kora-500 text-xs font-semibold text-white">{i + 1}</span>
            <input value={s.title} onChange={(e) => setAt(i, { title: e.target.value })} placeholder="Titre de l'étape (ex. Configurer les adresses IP)" className={input} />
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter" className="rounded-md p-1.5 text-kora-200/60 hover:bg-white/8 hover:text-white disabled:opacity-30">
              <ArrowUp size={14} />
            </button>
            <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Descendre" className="rounded-md p-1.5 text-kora-200/60 hover:bg-white/8 hover:text-white disabled:opacity-30">
              <ArrowDown size={14} />
            </button>
            <button onClick={() => onChange(steps.filter((_, k) => k !== i))} aria-label="Supprimer l'étape" className="rounded-md p-1.5 text-kora-200/60 hover:bg-white/8 hover:text-ko">
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            value={s.body}
            onChange={(e) => setAt(i, { body: e.target.value })}
            rows={4}
            placeholder={"1. Sur R1, configurez `GigabitEthernet0/0/0` avec `192.168.10.1 255.255.255.0`.\n2. Activez l'interface avec `no shutdown`."}
            className={`${input} mt-2`}
          />
          {checks.length > 0 ? (
            <div className="mt-2">
              <p className="mb-1 text-xs text-kora-200/60">Critères qui valident cette étape (coche verte chez l&apos;étudiant) :</p>
              <div className="flex flex-wrap gap-1.5">
                {checks.map((c, k) => {
                  const on = s.checks.includes(k);
                  return (
                    <button
                      key={k}
                      onClick={() => setAt(i, { checks: on ? s.checks.filter((x) => x !== k) : [...s.checks, k].sort((a, b) => a - b) })}
                      className={`rounded-lg px-2 py-1 text-left text-xs ring-1 transition ${on ? "bg-ok/15 text-ok ring-ok/40" : "text-kora-200/70 ring-white/10 hover:text-white"}`}
                    >
                      {on ? "✓ " : ""}
                      {describe(c, name)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-kora-200/50">Ajoutez des critères (section 4) pour pouvoir valider cette étape automatiquement.</p>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => onChange([...steps, { title: "", body: "", checks: [] }])} className="flex items-center gap-1.5 rounded-xl bg-kora-500 px-3 py-2 text-sm font-semibold text-white hover:bg-kora-400">
          <Plus size={15} /> Ajouter une étape
        </button>
        <p className="text-xs text-kora-200/60">
          Astuce : entourez une valeur d&apos;accents graves (<code className="font-mono text-kora-100">`192.168.1.1`</code>) pour la surligner.
        </p>
      </div>
      {steps.length > 0 && orphan.length > 0 && <p className="text-xs text-amber-200">{orphan.length} critère(s) ne sont rattachés à aucune étape : ils comptent dans le score mais n&apos;apparaissent pas dans les étapes.</p>}
    </div>
  );
}

/** Éditeur du résumé des commandes, avec suggestions en un clic. */
export function CommandsEditor({ commands, onChange }: { commands: TpCommand[]; onChange: (c: TpCommand[]) => void }) {
  const setAt = (i: number, patch: Partial<TpCommand>) => onChange(commands.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const suggestions = COMMON_COMMANDS.filter((c) => !commands.some((x) => x.cmd === c.cmd));
  return (
    <div className="space-y-2">
      {commands.map((c, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-1.5">
          <input value={c.cmd} onChange={(e) => setAt(i, { cmd: e.target.value })} placeholder="commande" className={`${input} font-mono text-xs`} />
          <input value={c.desc} onChange={(e) => setAt(i, { desc: e.target.value })} placeholder="À quoi elle sert" className={`${input} text-xs`} />
          <button onClick={() => onChange(commands.filter((_, k) => k !== i))} aria-label="Retirer" className="px-1 text-kora-200/50 hover:text-ko">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...commands, { cmd: "", desc: "" }])} className="flex items-center gap-1 text-sm text-kora-300 hover:text-white">
        <Plus size={14} /> Ajouter une commande
      </button>
      <details className="rounded-xl bg-white/[.03] p-2.5 ring-1 ring-white/8">
        <summary className="cursor-pointer text-xs font-semibold text-kora-200">Suggestions ({suggestions.length}) : cliquez pour ajouter</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((c) => (
            <button key={c.cmd} onClick={() => onChange([...commands, c])} title={c.desc} className="rounded-md bg-ink-900 px-2 py-1 font-mono text-[11px] text-kora-100 ring-1 ring-white/10 hover:ring-kora-300/60">
              + {c.cmd}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

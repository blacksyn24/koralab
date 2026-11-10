import { ArrowRight, Boxes, Download, GraduationCap, Laptop, Terminal, Wifi } from "lucide-react";
import Link from "next/link";

const features = [
  { icon: Laptop, title: "Rien à installer", text: "Un navigateur suffit, même sur un petit PC. Pas d'images IOS à chercher, pas de machine virtuelle." },
  { icon: Terminal, title: "De vraies commandes", text: "enable, conf t, ip address, no shutdown, show ip route, ping… avec les abréviations, l'aide « ? » et la touche Tab." },
  { icon: Boxes, title: "Multi-constructeur", text: "Commandes de style Cisco IOS aujourd'hui. Huawei VRP et MikroTik arrivent ensuite." },
  { icon: GraduationCap, title: "Pensé pour les étudiants", text: "En français, gratuit, avec des TP de terrain guidés et des pannes à dépanner (bientôt)." },
  { icon: Download, title: "Vos labs vous suivent", text: "Enregistrement automatique dans le navigateur, export et import en un clic pour partager avec un camarade." },
  { icon: Wifi, title: "Léger", text: "Toute la simulation tourne sur votre appareil : rapide, même avec une petite connexion." },
];

export default function Home() {
  return (
    <main className="min-h-dvh bg-[radial-gradient(900px_600px_at_20%_0%,rgb(46_93_230/.35),transparent_70%),radial-gradient(700px_500px_at_100%_40%,rgb(110_146_242/.18),transparent_70%)]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 text-lg font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-kora-300 to-kora-500">K</span>
          KoraLab
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">BÊTA</span>
        </span>
        <div className="flex items-center gap-2">
          <Link href="/tps" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-kora-200 hover:text-white sm:inline">
            TP guidés
          </Link>
          <Link href="/connexion" className="rounded-full px-4 py-2 text-sm font-semibold text-kora-200 hover:text-white">
            Se connecter
          </Link>
          <Link href="/lab" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-kora-50">
            Ouvrir le labo
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 text-center sm:pt-20">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-kora-300">Labo réseau en ligne · gratuit</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Configurez des routeurs et des switchs <span className="text-kora-300">dans votre navigateur</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-kora-200/85">
          KoraLab simule des équipements réseau pour pratiquer le CCNA sans installer GNS3 ni chercher d&apos;images. Construisez votre topologie, câblez, configurez, testez.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/lab" className="inline-flex items-center gap-2 rounded-full bg-kora-500 px-6 py-3 font-semibold text-white shadow-lg shadow-kora-500/30 hover:bg-kora-400">
            Commencer un lab <ArrowRight size={18} />
          </Link>
          <Link href="/connexion" className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-kora-200 ring-1 ring-white/15 hover:text-white">
            Créer un compte gratuit
          </Link>
        </div>

        <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-2xl bg-[#03061a] text-left shadow-2xl ring-1 ring-white/10">
          <div className="flex gap-1.5 border-b border-white/8 bg-ink-900 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-ko/80" />
            <span className="h-3 w-3 rounded-full bg-amber-400/80" />
            <span className="h-3 w-3 rounded-full bg-ok/80" />
            <span className="ml-3 text-xs text-kora-200/60">R1 — console</span>
          </div>
          <pre className="term p-5 text-[#d6e2ff]">{`R1>enable
R1#conf t
R1(config)#int g0/0/0
R1(config-if)#ip add 192.168.1.1 255.255.255.0
R1(config-if)#no shut
%LINK-5-CHANGED: Interface GigabitEthernet0/0/0, changed state to up
R1(config-if)#do ping 192.168.1.10
Sending 5, 100-byte ICMP Echos to 192.168.1.10, timeout is 2 seconds:
.!!!!
Success rate is 80 percent (4/5)`}</pre>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl bg-white/[.04] p-6 ring-1 ring-white/8">
            <f.icon className="text-kora-300" />
            <h2 className="mt-3 font-semibold">{f.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-kora-200/75">{f.text}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-white/8 px-5 py-6 text-center text-xs text-kora-200/50">
        KoraLab — projet étudiant créé au Bénin par Urbain Sedami LANDJIDE. KoraLab simule des commandes de style Cisco IOS à des fins pédagogiques et n&apos;est
        affilié à aucun constructeur. Cisco et IOS sont des marques de leurs propriétaires respectifs.
      </footer>
    </main>
  );
}

import {
  ArrowRight,
  BookOpenCheck,
  Cable,
  CheckCircle2,
  GraduationCap,
  Layers,
  Lock,
  MousePointerClick,
  Network,
  Router,
  ShieldCheck,
  Terminal,
  Trophy,
  Wifi,
  Workflow,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/LegalPage";
import { KoraLogo } from "@/components/Logo";

/** Domaines du CCNA couverts par le simulateur (liste vérifiée dans le moteur et ses tests). */
const DOMAINS = [
  {
    icon: Network,
    title: "Commutation",
    items: [
      "VLAN, trunks 802.1Q, VLAN natif",
      "Spanning Tree PVST+ et Rapid",
      "EtherChannel (LACP, PAgP)",
      "Sécurité des ports, BPDU guard",
    ],
  },
  {
    icon: Router,
    title: "Routage",
    items: [
      "Routes statiques et flottantes",
      "OSPF (DR/BDR, partage de charge)",
      "Inter-VLAN : router-on-a-stick et SVI",
      "HSRP, switchs de couche 3",
    ],
  },
  {
    icon: Workflow,
    title: "Services IP",
    items: [
      "DHCP serveur, relais et client",
      "NAT et PAT",
      "ACL standard et étendues",
      "NTP, SNMP, Syslog, CDP, LLDP",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Sécurité",
    items: [
      "SSH, comptes locaux, lignes VTY",
      "Mots de passe chiffrés, bannières",
      "DHCP snooping, inspection ARP",
      "RADIUS pour le Wi-Fi Entreprise",
    ],
  },
  {
    icon: Layers,
    title: "IPv6",
    items: [
      "Adressage, EUI-64, lien local",
      "SLAAC, découverte de voisins",
      "Routes statiques IPv6",
      "ping et traceroute IPv6",
    ],
  },
  {
    icon: Wifi,
    title: "Wi-Fi",
    items: [
      "Contrôleur avec interface web",
      "Points d'accès légers, option 43",
      "WPA2 et WPA3, Personnel et Entreprise",
      "Portables et téléphones",
    ],
  },
];

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Construisez",
    text: "Glissez routeurs, switchs, PC, serveurs et équipements Wi-Fi, puis câblez-les port par port.",
  },
  {
    icon: Terminal,
    title: "Configurez",
    text: "Ouvrez la console et tapez les vraies commandes, avec l'aide « ? », la touche Tab et les abréviations.",
  },
  {
    icon: CheckCircle2,
    title: "Vérifiez",
    text: "Ping, traceroute, show… et dans les TP, une correction automatique qui dit ce qui manque.",
  },
];

const FAQ = [
  [
    "C'est vraiment gratuit ?",
    "Oui. Le labo, les TP et les hackathons sont gratuits. Un compte (gratuit) sert seulement à enregistrer vos labs en ligne et à suivre votre progression.",
  ],
  [
    "Faut-il installer quelque chose ?",
    "Non. Tout fonctionne dans le navigateur, sur votre appareil : pas d'image IOS, pas de machine virtuelle, pas de serveur à démarrer.",
  ],
  [
    "Est-ce que ça remplace du vrai matériel ?",
    "C'est un simulateur pédagogique : il reproduit le comportement attendu au CCNA pour s'entraîner sans matériel. Les commandes qu'il ne connaît pas sont refusées avec un message.",
  ],
  [
    "Ça marche sur téléphone ?",
    "On peut consulter les TP sur téléphone, mais le labo est pensé pour un ordinateur (clavier, écran large).",
  ],
  [
    "KoraLab est-il lié à Cisco ?",
    "Non. KoraLab est un projet étudiant indépendant, créé au Bénin. Il simule des commandes de style Cisco IOS à des fins d'apprentissage.",
  ],
];

function Shot({
  src,
  alt,
  priority,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-ink-900 shadow-2xl shadow-kora-500/10 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 border-b border-white/8 px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-ko/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-ok/80" />
        <span className="ml-3 truncate font-mono text-[11px] text-kora-200/60">
          koralab.vercel.app
        </span>
      </div>
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={956}
        priority={priority}
        className="h-auto w-full"
      />
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[radial-gradient(1000px_620px_at_15%_-5%,rgb(0_122_255/.32),transparent_70%),radial-gradient(800px_520px_at_100%_30%,rgb(77_163_255/.14),transparent_70%)]">
      {/* Navigation */}
      <nav className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <KoraLogo size={30} />
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
              BÊTA
            </span>
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <a
              href="#fonctions"
              className="hidden rounded-full px-3 py-2 font-medium text-kora-200 hover:text-white md:inline"
            >
              Fonctions
            </a>
            <Link
              href="/tps"
              className="hidden rounded-full px-3 py-2 font-medium text-kora-200 hover:text-white sm:inline"
            >
              TP guidés
            </Link>
            <Link
              href="/hackathons"
              className="hidden rounded-full px-3 py-2 font-medium text-kora-200 hover:text-white sm:inline"
            >
              Hackathons
            </Link>
            <Link
              href="/connexion"
              className="whitespace-nowrap rounded-full px-3 py-2 font-medium text-kora-200 hover:text-white"
            >
              Connexion
            </Link>
            <Link
              href="/lab"
              className="ml-1 whitespace-nowrap rounded-full bg-white px-4 py-2 font-semibold text-ink-950 hover:bg-kora-50"
            >
              <span className="sm:hidden">Labo</span>
              <span className="hidden sm:inline">Ouvrir le labo</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Héros */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-14 text-center sm:pt-20">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/[.06] px-3 py-1 text-xs font-medium text-kora-200 ring-1 ring-white/10">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Gratuit · Sans
          installation · En français
        </p>
        <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
          Le labo réseau du CCNA,{" "}
          <span className="bg-gradient-to-r from-kora-300 to-sky-300 bg-clip-text text-transparent">
            directement dans votre navigateur
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-kora-200/85">
          Construisez une topologie, câblez, configurez routeurs, switchs et
          Wi-Fi avec de vraies commandes, puis faites corriger votre travail
          automatiquement. Sans GNS3, sans image IOS, même sur un petit PC.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/lab"
            className="inline-flex items-center gap-2 rounded-full bg-kora-500 px-6 py-3 font-semibold text-white shadow-lg shadow-kora-500/30 transition hover:bg-kora-400"
          >
            Ouvrir le labo <ArrowRight size={18} />
          </Link>
          <Link
            href="/tp?id=demo"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/5"
          >
            <BookOpenCheck size={18} /> Essayer un TP guidé
          </Link>
        </div>
        <p className="mt-3 text-xs text-kora-200/50">
          Aucun compte nécessaire pour commencer.
        </p>

        <div className="relative mx-auto mt-12 max-w-5xl">
          <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[3rem] bg-kora-500/15 blur-3xl" />
          <Shot
            src="/images/apercu-labo.webp"
            alt="Le labo KoraLab : topologie avec routeur, switch de couche 3, switchs, contrôleur Wi-Fi, point d'accès et console"
            priority
          />
        </div>
      </section>

      {/* Chiffres */}
      <section className="mx-auto max-w-5xl px-5 py-10">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["20", "TP guidés CCNA 1 · 2 · 3"],
            ["250+", "commandes IOS simulées"],
            ["11", "modèles d'équipements"],
            ["0", "logiciel à installer"],
          ].map(([v, l]) => (
            <div
              key={l}
              className="rounded-2xl bg-white/[.04] p-5 text-center ring-1 ring-white/8"
            >
              <dt className="text-3xl font-bold tracking-tight text-white">
                {v}
              </dt>
              <dd className="mt-1 text-sm text-kora-200/70">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Comment ça marche (bande claire) */}
      <div className="bg-[#f5f5f7] text-ink-950">
        <section className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-kora-500">
            Comment ça marche
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Trois étapes, comme sur du vrai matériel
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                className="relative rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5"
              >
                <span className="absolute right-5 top-5 font-mono text-4xl font-bold text-black/[.06]">
                  0{i + 1}
                </span>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-kora-500 text-white">
                  <s.icon size={21} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* TP guidés */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-kora-300">
            20 TP guidés
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Du CCNA 1 au CCNA 3, étape par étape
          </h2>
          <p className="mt-4 leading-relaxed text-kora-200/80">
            Configuration de base, VLSM, SSH, IPv6, VLAN, inter-VLAN, Spanning
            Tree, EtherChannel, DHCP, HSRP, Wi-Fi, OSPF, ACL, NAT… Chaque TP
            donne le contexte, la topologie, la table d&apos;adressage et les
            étapes à suivre. Cliquez sur « Vérifier » : chaque étape réussie
            passe au vert, et ce qui manque est indiqué clairement.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-kora-100">
            {[
              "Étapes avec les valeurs à taper surlignées",
              "Correction sur l'état réel du réseau, pas sur du texte",
              "Résumé des commandes utiles pour chaque TP",
              "Progression enregistrée dans votre compte",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <CheckCircle2 size={18} className="shrink-0 text-ok" /> {t}
              </li>
            ))}
          </ul>
          <Link
            href="/tps"
            className="mt-6 inline-flex items-center gap-2 font-semibold text-kora-300 hover:text-white"
          >
            Voir les TP <ArrowRight size={16} />
          </Link>
        </div>
        <Shot
          src="/images/apercu-tp.webp"
          alt="Un TP guidé : étapes avec coche verte, contexte et console"
        />
      </section>

      {/* Wi-Fi */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div className="order-2 lg:order-1">
          <Shot
            src="/images/apercu-wifi.webp"
            alt="L'interface web du contrôleur Wi-Fi ouverte dans le navigateur d'un PC du labo"
          />
        </div>
        <div className="order-1 lg:order-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-kora-300">
            Wi-Fi d&apos;entreprise
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Un contrôleur Wi-Fi à configurer en interface web
          </h2>
          <p className="mt-4 leading-relaxed text-kora-200/80">
            Ouvrez le navigateur d&apos;un PC du labo, connectez-vous au
            contrôleur et créez vos réseaux Wi-Fi. Les points d&apos;accès
            s&apos;enregistrent, les portables et téléphones se connectent…
            seulement si votre réseau est bien configuré.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-kora-100">
            {[
              "Réseaux par VLAN, WPA2 et WPA3",
              "Wi-Fi Entreprise avec un serveur RADIUS",
              "Points d'accès découverts par l'option 43 du DHCP",
              "Messages d'erreur réalistes pour apprendre à dépanner",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <CheckCircle2 size={18} className="shrink-0 text-ok" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Domaines (bande claire) */}
      <div className="bg-white text-ink-950">
        <section
          id="fonctions"
          className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20"
        >
          <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-kora-500">
            Ce que vous pouvez pratiquer
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Tout le programme CCNA, sur un seul canevas
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DOMAINS.map((d) => (
              <div
                key={d.title}
                className="rounded-2xl bg-[#f5f5f7] p-6 ring-1 ring-black/5 transition hover:bg-white hover:shadow-lg hover:ring-kora-500/30"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-kora-500 text-white">
                    <d.icon size={20} />
                  </span>
                  <h3 className="text-lg font-semibold">{d.title}</h3>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {d.items.map((it) => (
                    <li key={it} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-kora-500" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Enseignants */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-8 rounded-3xl bg-gradient-to-br from-kora-500/20 via-white/[.03] to-transparent p-8 ring-1 ring-kora-300/20 md:grid-cols-2 md:p-12">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-kora-300">
              Pour les enseignants et les écoles
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Créez vos TP et organisez des hackathons
            </h2>
            <p className="mt-4 leading-relaxed text-kora-200/80">
              Un éditeur simple pour préparer un TP en quelques minutes, et des
              hackathons notés côté serveur pour évaluer une classe entière.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [
                GraduationCap,
                "Éditeur de TP",
                "Photo de la topologie, équipements, étapes et critères de correction.",
              ],
              [
                Cable,
                "Topologie prête",
                "Les équipements et câbles de départ sont posés pour l'étudiant.",
              ],
              [
                Trophy,
                "Hackathons",
                "Critères secrets, correction sur le serveur, classement.",
              ],
              [
                Lock,
                "Suivi",
                "Tableau de bord avec la progression et les scores de chacun.",
              ],
            ].map(([Icon, t, x]) => {
              const I = Icon as typeof Trophy;
              return (
                <div
                  key={t as string}
                  className="rounded-2xl bg-ink-950/60 p-4 ring-1 ring-white/8"
                >
                  <I size={19} className="text-kora-300" />
                  <p className="mt-2 font-semibold">{t as string}</p>
                  <p className="mt-1 text-xs leading-relaxed text-kora-200/70">
                    {x as string}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ (bande claire) */}
      <div className="bg-[#f5f5f7] text-ink-950">
        <section className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Questions fréquentes
          </h2>
          <div className="mt-8 divide-y divide-slate-200 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-950">
                  {q}
                  <span className="text-xl leading-none text-kora-500 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>

      {/* Appel final */}
      <section className="mx-auto max-w-6xl px-5 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Prêt à configurer votre premier réseau ?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-kora-200/80">
          Ouvrez le labo et commencez tout de suite. Créez un compte plus tard
          si vous voulez enregistrer vos labs en ligne.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/lab"
            className="inline-flex items-center gap-2 rounded-full bg-kora-500 px-6 py-3 font-semibold text-white shadow-lg shadow-kora-500/30 hover:bg-kora-400"
          >
            Ouvrir le labo <ArrowRight size={18} />
          </Link>
          <Link
            href="/connexion"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-kora-200 ring-1 ring-white/15 hover:text-white"
          >
            Créer un compte gratuit
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

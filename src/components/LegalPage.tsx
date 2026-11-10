import Link from "next/link";

/** Mise en page commune des pages légales. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh">
      <header className="border-b border-white/8 bg-ink-900/80 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-kora-300 to-kora-500 text-sm">K</span>
          KoraLab
        </Link>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10 leading-relaxed text-kora-200 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        <p className="text-sm text-kora-200/60">Dernière mise à jour : {updated}</p>
        {children}
      </article>
      <SiteFooter />
    </main>
  );
}

/** Pied de page avec les liens légaux. */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/8 px-5 py-6 text-center text-xs text-kora-200/50">
      <nav className="mb-2 flex flex-wrap justify-center gap-x-5 gap-y-1">
        <Link href="/tps" className="hover:text-white">
          TP guidés
        </Link>
        <Link href="/hackathons" className="hover:text-white">
          Hackathons
        </Link>
        <Link href="/confidentialite" className="hover:text-white">
          Confidentialité
        </Link>
        <Link href="/conditions" className="hover:text-white">
          Conditions d&apos;utilisation
        </Link>
        <a href="https://portfolio-urbain.vercel.app/contact" target="_blank" rel="noopener" className="hover:text-white">
          Contact
        </a>
      </nav>
      KoraLab — projet étudiant créé au Bénin par Urbain Sedami LANDJIDE. KoraLab simule des commandes de style Cisco IOS à des fins pédagogiques et n&apos;est
      affilié à aucun constructeur. Cisco et IOS sont des marques de leurs propriétaires respectifs.
    </footer>
  );
}

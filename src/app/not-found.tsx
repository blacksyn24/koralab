import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="font-mono text-6xl font-bold text-kora-300">404</p>
        <p className="mt-3 text-xl font-semibold">Cette page n&apos;existe pas</p>
        <p className="mt-1 text-kora-200/70">Destination host unreachable… 😉</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="rounded-full bg-kora-500 px-5 py-2.5 font-semibold text-white hover:bg-kora-400">
            Accueil
          </Link>
          <Link href="/lab" className="rounded-full px-5 py-2.5 font-semibold text-kora-200 ring-1 ring-white/15 hover:text-white">
            Ouvrir le labo
          </Link>
        </div>
      </div>
    </main>
  );
}

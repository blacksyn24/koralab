"use client";

import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { auth } from "@/lib/firebase";

import { KoraLogo } from "@/components/Logo";

/** Messages d'erreur Firebase traduits en français. */
function message(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/invalid-email": "Adresse email invalide.",
    "auth/user-not-found": "Aucun compte avec cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet email. Connectez-vous.",
    "auth/weak-password": "Mot de passe trop faible (6 caractères minimum).",
    "auth/too-many-requests": "Trop de tentatives. Réessayez dans quelques minutes.",
    "auth/popup-closed-by-user": "Fenêtre Google fermée avant la fin.",
    "auth/popup-blocked": "Le navigateur a bloqué la fenêtre Google. Autorisez les fenêtres pop-up.",
    "auth/unauthorized-domain": "Ce site n'est pas encore autorisé dans Firebase (Authentication → Domaines autorisés).",
    "auth/operation-not-allowed": "Ce mode de connexion n'est pas activé dans Firebase.",
    "auth/network-request-failed": "Problème de connexion internet.",
  };
  return map[code] ?? "Une erreur est survenue. Réessayez.";
}

function ConnexionForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/tableau-de-bord";
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "signup" && name.trim().length < 2) return setError("Indiquez votre nom (2 caractères minimum).");
    run(async () => {
      if (tab === "login") await signInWithEmailAndPassword(auth, email.trim(), password);
      else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
      }
    });
  };

  const google = () => run(() => signInWithPopup(auth, new GoogleAuthProvider()));

  const forgot = () => {
    if (!email.trim()) return setError("Tapez d'abord votre adresse email, puis cliquez sur « Mot de passe oublié ».");
    run(async () => {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé. Pensez à vérifier les spams.");
    });
  };

  const google_icon = (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink-950 p-4">
      {/* Fond : halo bleu discret */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_500px_at_15%_0%,rgb(0_122_255/.22),transparent_70%),radial-gradient(700px_500px_at_100%_100%,rgb(0_122_255/.14),transparent_70%)]" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2.25rem] bg-ink-900/80 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl md:grid-cols-[1fr_1.05fr]">
        {/* Formulaire */}
        <div className="flex flex-col px-6 py-8 sm:px-12 sm:py-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="text-lg">
              <KoraLogo size={30} />
            </Link>
            <div className="flex gap-5 text-sm">
              {(["login", "signup"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => (setTab(t), setError(""), setInfo(""))}
                  className={`border-b-2 pb-1.5 transition ${tab === t ? "border-kora-500 font-semibold text-white" : "border-transparent text-kora-200/60 hover:text-white"}`}
                >
                  {t === "login" ? "Connexion" : "Inscription"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-10 sm:mt-12">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{tab === "login" ? "Content de vous revoir\u00a0!" : "Bienvenue sur KoraLab"}</h1>
            <p className="mt-2 text-sm text-kora-200/80">
              {tab === "login" ? "Connectez-vous pour retrouver vos labs, vos TP et vos hackathons." : "Créez votre compte gratuit et commencez à pratiquer le réseau."}
            </p>
          </div>

          <button
            onClick={google}
            disabled={busy}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3 font-semibold text-ink-950 transition hover:bg-kora-50 disabled:opacity-60"
          >
            {google_icon} Continuer avec Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-kora-200/50">
            <span className="h-px flex-1 bg-white/10" /> ou avec votre email <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            {tab === "signup" && <Field label="Nom complet" value={name} onChange={setName} autoComplete="name" placeholder="Votre nom et prénom" />}
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="vous@email.com" />
            <Field label="Mot de passe" type="password" value={password} onChange={setPassword} autoComplete={tab === "login" ? "current-password" : "new-password"} placeholder="••••••••••" />

            {tab === "login" && (
              <div className="flex justify-end">
                <button type="button" onClick={forgot} className="text-sm text-kora-300 hover:text-white">
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            {error && <p className="rounded-xl bg-ko/10 px-3 py-2 text-sm text-ko">{error}</p>}
            {info && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{info}</p>}

            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-kora-500 py-3 font-semibold text-white shadow-lg shadow-kora-500/25 hover:bg-kora-400 disabled:opacity-60 sm:w-56">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {tab === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          {tab === "signup" && (
            <p className="mt-4 text-xs text-kora-200/60">
              En créant un compte, vous acceptez les{" "}
              <Link href="/conditions" className="underline hover:text-white">
                conditions d&apos;utilisation
              </Link>{" "}
              et la{" "}
              <Link href="/confidentialite" className="underline hover:text-white">
                politique de confidentialité
              </Link>
              .
            </p>
          )}

          <p className="mt-auto pt-10 text-xs text-kora-200/60">
            Pas envie de créer un compte ?{" "}
            <Link href="/lab" className="text-kora-300 underline hover:text-white">
              Utiliser le labo sans compte
            </Link>{" "}
            · <Link href="/" className="underline hover:text-white">Retour au site</Link>
          </p>
        </div>

        {/* Photo */}
        <div className="relative hidden min-h-[640px] md:block">
          <Image src="/images/connexion-datacenter.jpg" alt="" fill priority sizes="(min-width: 768px) 520px, 0px" className="object-cover object-[50%_40%]" />
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950/10 via-transparent to-ink-950/90" />
          <div className="absolute bottom-8 left-8 right-8">
            <p className="text-xl font-semibold text-white">Le labo réseau dans votre navigateur</p>
            <p className="mt-1 text-sm text-kora-300">Routeurs, switchs et PC · TP guidés · Hackathons</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const isPwd = type === "password";
  return (
    <label className="block rounded-xl border-l-[3px] border-transparent bg-ink-950/60 px-4 pb-2.5 pt-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/.08)] transition-colors focus-within:border-kora-500">
      <span className="block text-[0.7rem] text-kora-200/70">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type={isPwd && show ? "text" : type}
          value={value}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-[0.95rem] text-white outline-none placeholder:text-white/30"
        />
        {isPwd && (
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="text-kora-200/70 hover:text-white">
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </span>
    </label>
  );
}

export default function ConnexionPage() {
  return (
    <Suspense>
      <ConnexionForm />
    </Suspense>
  );
}

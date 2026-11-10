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
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { auth } from "@/lib/firebase";

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

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(900px_600px_at_20%_0%,rgb(46_93_230/.35),transparent_70%)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-kora-300 to-kora-500">K</span>
          KoraLab
        </Link>
        <div className="rounded-2xl bg-ink-900/90 p-6 shadow-2xl ring-1 ring-white/10 sm:p-8">
          <div className="mb-6 grid grid-cols-2 rounded-xl bg-ink-950 p-1 text-sm">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => (setTab(t), setError(""), setInfo(""))}
                className={`rounded-lg py-2 font-semibold transition ${tab === t ? "bg-kora-500 text-white" : "text-kora-200 hover:text-white"}`}
              >
                {t === "login" ? "Se connecter" : "Créer un compte"}
              </button>
            ))}
          </div>

          <button
            onClick={google}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-2.5 font-semibold text-ink-950 transition hover:bg-kora-50 disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continuer avec Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-kora-200/50">
            <span className="h-px flex-1 bg-white/10" /> ou avec votre email <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {tab === "signup" && <Field label="Nom complet" value={name} onChange={setName} autoComplete="name" />}
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label="Mot de passe" type="password" value={password} onChange={setPassword} autoComplete={tab === "login" ? "current-password" : "new-password"} />
            {error && <p className="rounded-lg bg-ko/10 px-3 py-2 text-sm text-ko">{error}</p>}
            {info && <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{info}</p>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-kora-500 py-2.5 font-semibold text-white hover:bg-kora-400 disabled:opacity-60">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {tab === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          {tab === "signup" && (
            <p className="mt-3 text-center text-xs text-kora-200/60">
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
          {tab === "login" && (
            <button onClick={forgot} className="mt-3 w-full text-center text-sm text-kora-300 hover:text-white">
              Mot de passe oublié ?
            </button>
          )}
        </div>
        <p className="mt-5 text-center text-sm text-kora-200/60">
          Vous pouvez aussi{" "}
          <Link href="/lab" className="text-kora-300 underline">
            utiliser le labo sans compte
          </Link>{" "}
          (vos labs restent alors dans ce navigateur).
        </p>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string }) {
  return (
    <label className="block text-sm text-kora-200/80">
      {label}
      <input
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-ink-950 px-3 py-2.5 text-white outline-none ring-1 ring-white/10 focus:ring-kora-300"
      />
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

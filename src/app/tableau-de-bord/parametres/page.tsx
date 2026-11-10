"use client";

import { deleteUser, updateProfile } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { Check, Loader2, LogIn, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar, Card, CardTitle } from "@/components/dash/ui";
import { auth, db } from "@/lib/firebase";
import { getParticipant, leaveHackathon, listPublishedHackathons } from "@/lib/hackathons";

export default function Parametres() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(profile?.displayName || user?.displayName || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  if (!user) return null;
  const created = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;
  const provider = user.providerData[0]?.providerId === "google.com" ? "Google" : "Email et mot de passe";
  // Firebase exige une connexion récente pour supprimer un compte
  const recent = Date.now() - new Date(user.metadata.lastSignInTime ?? 0).getTime() < 4 * 60 * 1000;

  const saveName = async () => {
    const n = name.trim().slice(0, 60);
    if (!n) return;
    setSaving(true);
    try {
      await updateProfile(auth.currentUser!, { displayName: n });
      await updateDoc(doc(db, "users", user.uid), { displayName: n });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error(e);
      setMsg("Impossible d'enregistrer le nom pour le moment.");
    } finally {
      setSaving(false);
    }
  };

  const reconnect = async () => {
    await signOut();
    router.replace("/connexion?next=/tableau-de-bord/parametres");
  };

  const removeAccount = async () => {
    setDeleting(true);
    setMsg("");
    try {
      // 1. Labs
      const labs = await getDocs(query(collection(db, "labs"), where("ownerId", "==", user.uid)));
      await Promise.all(labs.docs.map((d) => deleteDoc(d.ref)));
      // 2. Inscriptions aux hackathons
      const hks = await listPublishedHackathons().catch(() => []);
      await Promise.all(hks.map(async (h) => (await getParticipant(h.id, user.uid).catch(() => null)) && leaveHackathon(h.id, user.uid).catch(() => {})));
      // 3. Profil puis compte de connexion
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(auth.currentUser!);
      router.replace("/?compte=supprime");
    } catch (e) {
      console.error(e);
      setMsg((e as { code?: string }).code === "auth/requires-recent-login" ? "Par sécurité, reconnectez-vous puis recommencez." : "La suppression a échoué. Réessayez ou contactez-nous.");
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight text-white">Paramètres</h1>
      <p className="mt-1 text-kora-200/70">Gérez votre profil et votre compte KoraLab.</p>

      <Card className="mt-6">
        <CardTitle>Mon profil</CardTitle>
        <div className="mt-5 flex items-center gap-4">
          <Avatar name={name || user.email || "?"} photo={user.photoURL ?? undefined} size={64} />
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold text-white">{user.email}</p>
            <p className="text-kora-200/60">Connexion : {provider}</p>
            {created && <p className="text-kora-200/60">Membre depuis le {created.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>}
          </div>
        </div>
        <label className="mt-6 block text-sm font-medium text-kora-50">Nom affiché (visible dans les classements)</label>
        <div className="mt-2 flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/5 px-3 ring-1 ring-white/10 focus-within:ring-kora-400">
            <UserRound size={16} className="text-kora-200/60" />
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" />
          </div>
          <button onClick={saveName} disabled={saving || !name.trim()} className="flex items-center gap-2 rounded-xl bg-kora-500 px-4 text-sm font-semibold text-white hover:bg-kora-400 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null} {saved ? "Enregistré" : "Enregistrer"}
          </button>
        </div>
      </Card>

      <Card className="mt-4 ring-ko/25">
        <CardTitle>Supprimer mon compte</CardTitle>
        <p className="mt-3 text-sm text-kora-200/80">
          Votre compte, vos labs, votre progression dans les TP et vos inscriptions aux hackathons seront <b className="text-white">définitivement supprimés</b>. Cette action est
          irréversible.
        </p>
        {!recent ? (
          <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-kora-200">
            Par sécurité, il faut vous être connecté il y a moins de 5 minutes pour supprimer votre compte.
            <button onClick={reconnect} className="mt-3 flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-white ring-1 ring-white/20 hover:bg-white/5">
              <LogIn size={15} /> Me reconnecter
            </button>
          </div>
        ) : (
          <>
            <label className="mt-4 block text-sm text-kora-200">
              Tapez <b className="font-mono text-white">SUPPRIMER</b> pour confirmer :
            </label>
            <div className="mt-2 flex gap-2">
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="flex-1 rounded-xl bg-white/5 px-3 py-2.5 font-mono text-sm text-white outline-none ring-1 ring-white/10 focus:ring-ko" />
              <button
                onClick={removeAccount}
                disabled={confirm !== "SUPPRIMER" || deleting}
                className="flex items-center gap-2 rounded-xl bg-ko px-4 text-sm font-semibold text-white hover:bg-ko/85 disabled:opacity-40"
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Supprimer
              </button>
            </div>
          </>
        )}
        {msg && <p className="mt-3 text-sm text-ko">{msg}</p>}
      </Card>
    </div>
  );
}

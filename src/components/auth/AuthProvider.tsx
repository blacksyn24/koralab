"use client";

import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";

export type Profile = {
  email: string;
  displayName: string;
  photoURL: string;
  role: "student" | "admin";
  disabled?: boolean;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({ user: null, profile: null, loading: true, isAdmin: false, signOut: async () => {} });

/** Suit la connexion de l'utilisateur et crée son profil (rôle « étudiant ») à la première connexion. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setUser(u);
        if (!u) {
          setProfile(null);
          setLoading(false);
          return;
        }
        try {
          const ref = doc(db, "users", u.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            setProfile(snap.data() as Profile);
            updateDoc(ref, { lastLogin: serverTimestamp(), displayName: u.displayName ?? snap.data().displayName ?? "", photoURL: u.photoURL ?? "" }).catch(() => {});
          } else {
            const p: Profile = { email: u.email ?? "", displayName: u.displayName ?? "", photoURL: u.photoURL ?? "", role: "student", disabled: false };
            await setDoc(ref, { ...p, createdAt: serverTimestamp(), lastLogin: serverTimestamp() });
            setProfile(p);
          }
        } catch (e) {
          console.error("[auth] profil indisponible", e);
          setProfile(null);
        } finally {
          setLoading(false);
        }
      }),
    []
  );

  return (
    <Ctx.Provider value={{ user, profile, loading, isAdmin: profile?.role === "admin", signOut: () => fbSignOut(auth) }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

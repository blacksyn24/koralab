// TP guidés (collection Firestore « tps ») et administration des utilisateurs.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import type { Check } from "@/engine/checks";
import { db } from "./firebase";

export const LEVELS = ["CCNA 1", "CCNA 2", "CCNA 3", "Autre"] as const;

export type Tp = {
  id: string;
  title: string;
  level: string;
  summary: string;
  statement: string;
  /** Topologie de départ (JSON d'un lab) */
  topology: string;
  checks: Check[];
  published: boolean;
  position: number;
  updatedAt: Date | null;
};

const tps = collection(db, "tps");

function toTp(id: string, d: Record<string, unknown>): Tp {
  return {
    id,
    title: (d.title as string) ?? "",
    level: (d.level as string) ?? "Autre",
    summary: (d.summary as string) ?? "",
    statement: (d.statement as string) ?? "",
    topology: (d.topology as string) ?? "",
    checks: (d.checks as Check[]) ?? [],
    published: !!d.published,
    position: (d.position as number) ?? 0,
    updatedAt: (d.updatedAt as Timestamp | null)?.toDate() ?? null,
  };
}

const byOrder = (a: Tp, b: Tp) => a.position - b.position || a.title.localeCompare(b.title);

/** TP publiés (visibles par tous). */
export async function listPublishedTps(): Promise<Tp[]> {
  const snap = await getDocs(query(tps, where("published", "==", true)));
  return snap.docs.map((d) => toTp(d.id, d.data())).sort(byOrder);
}

/** Tous les TP, brouillons compris (administrateur). */
export async function listAllTps(): Promise<Tp[]> {
  const snap = await getDocs(tps);
  return snap.docs.map((d) => toTp(d.id, d.data())).sort(byOrder);
}

export async function getTp(id: string): Promise<Tp | null> {
  const snap = await getDoc(doc(db, "tps", id));
  return snap.exists() ? toTp(snap.id, snap.data()) : null;
}

export async function saveTp(tp: Omit<Tp, "id" | "updatedAt">, id?: string): Promise<string> {
  const data = { ...tp, updatedAt: serverTimestamp() };
  if (id) {
    await updateDoc(doc(db, "tps", id), data);
    return id;
  }
  return (await addDoc(tps, { ...data, createdAt: serverTimestamp() })).id;
}

export async function deleteTp(id: string) {
  await deleteDoc(doc(db, "tps", id));
}

// ---------- Progression de l'étudiant (dans son profil : users/{uid}.progress) ----------

export type Progress = Record<string, { score: number; total: number; done: boolean; at: Timestamp | null }>;

export async function recordProgress(uid: string, tpId: string, score: number, total: number) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const prev = (snap.data()?.progress as Progress | undefined)?.[tpId];
  if (prev && prev.score >= score) return; // on garde le meilleur score
  await updateDoc(ref, { [`progress.${tpId}`]: { score, total, done: score === total, at: serverTimestamp() } });
}

export async function getProgress(uid: string): Promise<Progress> {
  const snap = await getDoc(doc(db, "users", uid));
  return (snap.data()?.progress as Progress | undefined) ?? {};
}

// ---------- Administration des utilisateurs ----------

export type UserRow = {
  uid: string;
  email: string;
  displayName: string;
  role: "student" | "admin";
  disabled: boolean;
  createdAt: Date | null;
  lastLogin: Date | null;
  tpsDone: number;
};

export async function listUsers(): Promise<UserRow[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        uid: d.id,
        email: x.email ?? "",
        displayName: x.displayName ?? "",
        role: x.role === "admin" ? "admin" : "student",
        disabled: !!x.disabled,
        createdAt: (x.createdAt as Timestamp | null)?.toDate() ?? null,
        lastLogin: (x.lastLogin as Timestamp | null)?.toDate() ?? null,
        tpsDone: Object.values((x.progress ?? {}) as Progress).filter((p) => p.done).length,
      } satisfies UserRow;
    })
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export async function updateUser(uid: string, patch: Partial<Pick<UserRow, "role" | "disabled">>) {
  await updateDoc(doc(db, "users", uid), patch);
}

/** Supprime le profil et les labs d'un utilisateur (le compte de connexion reste dans Firebase Authentication). */
export async function deleteUserData(uid: string) {
  const labs = await getDocs(query(collection(db, "labs"), where("ownerId", "==", uid)));
  await Promise.all(labs.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "users", uid));
}

export async function countLabs(): Promise<number> {
  return (await getDocs(collection(db, "labs"))).size;
}


/** Sauvegarde complète (comptes, labs, TP) au format JSON, pour l'administrateur. */
export async function exportBackup(): Promise<string> {
  const plain = (v: unknown): unknown => {
    if (v && typeof v === "object" && "toDate" in (v as object)) return (v as Timestamp).toDate().toISOString();
    if (Array.isArray(v)) return v.map(plain);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
    return v;
  };
  const dump = async (name: string) => (await getDocs(collection(db, name))).docs.map((d) => ({ id: d.id, ...(plain(d.data()) as object) }));
  const [users, labs, tps, hackathons, hackathonSecrets] = await Promise.all([dump("users"), dump("labs"), dump("tps"), dump("hackathons"), dump("hackathonSecrets")]);
  return JSON.stringify({ exportedAt: new Date().toISOString(), users, labs, tps, hackathons, hackathonSecrets }, null, 2);
}

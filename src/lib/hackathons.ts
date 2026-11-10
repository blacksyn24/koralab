// Hackathons réseau : épreuves chronométrées, correction sur le serveur, classement en direct.
//
// Données Firestore :
//   hackathons/{hid}                     infos publiques + épreuves (énoncé, topologie, points) — sans les critères
//   hackathonSecrets/{hid}               critères de correction (lisibles par les admins uniquement)
//   hackathons/{hid}/participants/{uid}  inscription + scores (scores écrits uniquement par le serveur)

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import type { Check } from "@/engine/checks";
import { db } from "./firebase";

export type Challenge = { id: string; title: string; statement: string; points: number; topology: string };

export type Hackathon = {
  id: string;
  title: string;
  summary: string;
  description: string;
  rules: string;
  startAt: Date;
  endAt: Date;
  published: boolean;
  challenges: Challenge[];
};

export type Participant = {
  uid: string;
  name: string;
  photoURL: string;
  joinedAt: Date | null;
  score: number;
  solved: Record<string, number>;
  attempts: Record<string, number>;
  lastScoreAt: Date | null;
};

export type HackathonStatus = "upcoming" | "live" | "ended";

export function statusOf(h: Pick<Hackathon, "startAt" | "endAt">, now = Date.now()): HackathonStatus {
  if (now < h.startAt.getTime()) return "upcoming";
  if (now > h.endAt.getTime()) return "ended";
  return "live";
}

export const STATUS_LABEL: Record<HackathonStatus, string> = { upcoming: "À venir", live: "En cours", ended: "Terminé" };

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : null);

function toHackathon(id: string, d: Record<string, unknown>): Hackathon {
  return {
    id,
    title: (d.title as string) ?? "",
    summary: (d.summary as string) ?? "",
    description: (d.description as string) ?? "",
    rules: (d.rules as string) ?? "",
    startAt: toDate(d.startAt) ?? new Date(),
    endAt: toDate(d.endAt) ?? new Date(),
    published: !!d.published,
    challenges: (d.challenges as Challenge[]) ?? [],
  };
}

function toParticipant(uid: string, d: Record<string, unknown>): Participant {
  return {
    uid,
    name: (d.name as string) ?? "Participant",
    photoURL: (d.photoURL as string) ?? "",
    joinedAt: toDate(d.joinedAt),
    score: (d.score as number) ?? 0,
    solved: (d.solved as Record<string, number>) ?? {},
    attempts: (d.attempts as Record<string, number>) ?? {},
    lastScoreAt: toDate(d.lastScoreAt),
  };
}

/** Classement : score décroissant, puis le premier à avoir atteint son score passe devant. */
export function rank(list: Participant[]): Participant[] {
  return [...list].sort((a, b) => b.score - a.score || (a.lastScoreAt?.getTime() ?? Infinity) - (b.lastScoreAt?.getTime() ?? Infinity) || a.name.localeCompare(b.name));
}

const col = collection(db, "hackathons");

export async function listPublishedHackathons(): Promise<Hackathon[]> {
  const snap = await getDocs(query(col, where("published", "==", true)));
  return snap.docs.map((d) => toHackathon(d.id, d.data())).sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
}

export async function listAllHackathons(): Promise<Hackathon[]> {
  const snap = await getDocs(col);
  return snap.docs.map((d) => toHackathon(d.id, d.data())).sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
}

export async function getHackathon(id: string): Promise<Hackathon | null> {
  const snap = await getDoc(doc(db, "hackathons", id));
  return snap.exists() ? toHackathon(snap.id, snap.data()) : null;
}

/** Enregistre un hackathon (admin) : les critères vont dans un document séparé, invisible des participants. */
export async function saveHackathon(h: Omit<Hackathon, "id">, checks: Record<string, Check[]>, id?: string): Promise<string> {
  const data = { ...h, startAt: Timestamp.fromDate(h.startAt), endAt: Timestamp.fromDate(h.endAt), updatedAt: serverTimestamp() };
  const hid = id ?? (await addDoc(col, { ...data, createdAt: serverTimestamp() })).id;
  if (id) await updateDoc(doc(db, "hackathons", id), data);
  await setDoc(doc(db, "hackathonSecrets", hid), { challenges: checks, updatedAt: serverTimestamp() });
  return hid;
}

export async function getSecrets(id: string): Promise<Record<string, Check[]>> {
  const snap = await getDoc(doc(db, "hackathonSecrets", id));
  return (snap.data()?.challenges as Record<string, Check[]>) ?? {};
}

export async function deleteHackathon(id: string) {
  const parts = await getDocs(collection(db, "hackathons", id, "participants"));
  await Promise.all(parts.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "hackathonSecrets", id)).catch(() => {});
  await deleteDoc(doc(db, "hackathons", id));
}

// ---------- Participants ----------

export async function join(hid: string, uid: string, name: string, photoURL: string) {
  await setDoc(doc(db, "hackathons", hid, "participants", uid), { name: name.slice(0, 60) || "Participant", photoURL, joinedAt: serverTimestamp(), score: 0, solved: {}, attempts: {} });
}

export async function getParticipant(hid: string, uid: string): Promise<Participant | null> {
  const snap = await getDoc(doc(db, "hackathons", hid, "participants", uid));
  return snap.exists() ? toParticipant(snap.id, snap.data()) : null;
}

/** Classement en direct : la fonction est rappelée à chaque changement de score. */
export function watchLeaderboard(hid: string, cb: (list: Participant[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    collection(db, "hackathons", hid, "participants"),
    (snap) => cb(rank(snap.docs.map((d) => toParticipant(d.id, d.data())))),
    (e) => onError?.(e)
  );
}

export async function removeParticipant(hid: string, uid: string) {
  await deleteDoc(doc(db, "hackathons", hid, "participants", uid));
}

/** Classement au format CSV (export admin). */
export function leaderboardCsv(h: Hackathon, list: Participant[]): string {
  const head = ["Rang", "Nom", "Score", ...h.challenges.map((c) => c.title), "Dernier point"];
  const rows = rank(list).map((p, i) => [i + 1, p.name, p.score, ...h.challenges.map((c) => p.solved[c.id] ?? 0), p.lastScoreAt?.toISOString() ?? ""]);
  return [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
}

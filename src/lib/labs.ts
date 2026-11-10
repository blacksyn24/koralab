// Labs enregistrés en ligne (collection Firestore « labs »). Chaque lab appartient à un étudiant.

import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";

export type LabMeta = { id: string; name: string; devices: number; updatedAt: Date | null };

const labs = collection(db, "labs");

/** Nombre d'équipements, pour l'affichage dans « Mes labs ». */
function countDevices(json: string) {
  try {
    return (JSON.parse(json).devices ?? []).length as number;
  } catch {
    return 0;
  }
}

export async function listLabs(uid: string): Promise<LabMeta[]> {
  // Tri côté client : évite d'avoir à créer un index composite dans Firestore
  const snap = await getDocs(query(labs, where("ownerId", "==", uid)));
  const list = snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name as string,
    devices: (d.data().devices as number) ?? 0,
    updatedAt: (d.data().updatedAt as Timestamp | null)?.toDate() ?? null,
  }));
  return list.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

export async function getLab(id: string): Promise<{ name: string; data: string; ownerId: string } | null> {
  const snap = await getDoc(doc(db, "labs", id));
  return snap.exists() ? (snap.data() as { name: string; data: string; ownerId: string }) : null;
}

export async function createLab(uid: string, name: string, data: string): Promise<string> {
  const ref = await addDoc(labs, { ownerId: uid, name: name.slice(0, 80), data, devices: countDevices(data), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function saveLab(id: string, data: string) {
  await updateDoc(doc(db, "labs", id), { data, devices: countDevices(data), updatedAt: serverTimestamp() });
}

export async function renameLab(id: string, name: string) {
  await updateDoc(doc(db, "labs", id), { name: name.slice(0, 80), updatedAt: serverTimestamp() });
}

export async function deleteLab(id: string) {
  await deleteDoc(doc(db, "labs", id));
}

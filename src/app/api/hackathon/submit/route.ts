import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { evaluate, type Check } from "@/engine/checks";
import { Network } from "@/engine/network";
import { adminApp, adminDb, verifyIdToken } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 10_000; // une soumission toutes les 10 s maximum par épreuve

/**
 * Correction d'une épreuve de hackathon, faite sur le serveur :
 * le participant envoie sa topologie, le serveur la teste avec les critères secrets et met à jour son score.
 */
export async function POST(req: Request) {
  if (!adminApp()) return NextResponse.json({ error: "La correction des hackathons n'est pas encore configurée sur le serveur." }, { status: 503 });

  // 1. Qui envoie ?
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Connectez-vous pour participer." }, { status: 401 });
  let uid: string;
  try {
    uid = await verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Session expirée, reconnectez-vous." }, { status: 401 });
  }

  // 2. Données envoyées
  const body = (await req.json().catch(() => null)) as { hid?: string; cid?: string; lab?: string } | null;
  if (!body?.hid || !body.cid || typeof body.lab !== "string" || body.lab.length > 900_000)
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  let net: Network;
  try {
    net = Network.fromJSON(JSON.parse(body.lab));
  } catch {
    return NextResponse.json({ error: "Topologie illisible." }, { status: 400 });
  }

  const db = adminDb();
  const hRef = db.collection("hackathons").doc(body.hid);
  const [hSnap, secretSnap, userSnap] = await Promise.all([hRef.get(), db.collection("hackathonSecrets").doc(body.hid).get(), db.collection("users").doc(uid).get()]);
  const h = hSnap.data();
  if (!h || !h.published) return NextResponse.json({ error: "Hackathon introuvable." }, { status: 404 });
  if (userSnap.data()?.disabled) return NextResponse.json({ error: "Compte bloqué." }, { status: 403 });

  // 3. Fenêtre de temps
  const now = Date.now();
  if (now < (h.startAt as Timestamp).toMillis()) return NextResponse.json({ error: "Le hackathon n'a pas encore commencé." }, { status: 403 });
  if (now > (h.endAt as Timestamp).toMillis()) return NextResponse.json({ error: "Le hackathon est terminé : les soumissions sont fermées." }, { status: 403 });

  const challenge = (h.challenges as { id: string; title: string; points: number; topology: string }[]).find((c) => c.id === body.cid);
  const checks = (secretSnap.data()?.challenges?.[body.cid] ?? []) as Check[];
  if (!challenge || !checks.length) return NextResponse.json({ error: "Épreuve introuvable." }, { status: 404 });

  // 4. Correction avec les critères secrets
  const original = Network.fromJSON(JSON.parse(challenge.topology));
  const results = evaluate(net, checks, (id) => original.getDevice(id)?.hostname ?? "?");
  const passed = results.map((r) => r.ok);
  const ok = passed.filter(Boolean).length;
  const earned = Math.round((challenge.points * ok) / checks.length);

  // 5. Mise à jour du score (transaction : meilleur score conservé, anti-spam)
  const pRef = hRef.collection("participants").doc(uid);
  try {
    const out = await db.runTransaction(async (tx) => {
      const p = await tx.get(pRef);
      if (!p.exists) throw new Error("not-joined");
      const d = p.data()!;
      const last = (d.lastSubmit?.[body.cid!] as Timestamp | undefined)?.toMillis() ?? 0;
      if (now - last < MIN_INTERVAL_MS) throw new Error("too-fast");
      const solved = { ...(d.solved ?? {}) } as Record<string, number>;
      const improved = earned > (solved[body.cid!] ?? 0);
      if (improved) solved[body.cid!] = earned;
      const score = Object.values(solved).reduce((a, b) => a + b, 0);
      tx.update(pRef, {
        solved,
        score,
        [`attempts.${body.cid}`]: FieldValue.increment(1),
        [`lastSubmit.${body.cid}`]: Timestamp.fromMillis(now),
        ...(improved ? { lastScoreAt: Timestamp.fromMillis(now) } : {}),
      });
      return { score, best: solved[body.cid!] ?? 0 };
    });
    return NextResponse.json({ passed, earned, points: challenge.points, best: out.best, score: out.score });
  } catch (e) {
    const code = (e as Error).message;
    if (code === "not-joined") return NextResponse.json({ error: "Inscrivez-vous d'abord au hackathon." }, { status: 403 });
    if (code === "too-fast") return NextResponse.json({ error: "Patientez quelques secondes entre deux vérifications." }, { status: 429 });
    console.error("[hackathon] soumission", e);
    return NextResponse.json({ error: "Erreur serveur, réessayez." }, { status: 500 });
  }
}

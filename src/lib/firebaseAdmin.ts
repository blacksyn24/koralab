// Accès « serveur » à Firebase (contourne les règles de sécurité) : utilisé uniquement par les routes API.
// La clé de service est fournie par la variable d'environnement FIREBASE_SERVICE_ACCOUNT (JSON) sur Vercel.

import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getFirestore } from "firebase-admin/firestore";

let app: App | null = null;

export function adminApp(): App | null {
  if (app) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const json = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    app = getApps()[0] ?? initializeApp({ credential: cert(json) });
    return app;
  } catch (e) {
    console.error("[firebase-admin] clé de service invalide", e);
    return null;
  }
}

const PROJECT_ID = "koralab-5ba19";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

/** Vérifie un jeton de connexion Firebase et renvoie l'identifiant de l'utilisateur. */
export async function verifyIdToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${PROJECT_ID}`, audience: PROJECT_ID, algorithms: ["RS256"] });
  if (!payload.sub) throw new Error("jeton sans utilisateur");
  return payload.sub;
}
export const adminDb = () => getFirestore(adminApp()!);

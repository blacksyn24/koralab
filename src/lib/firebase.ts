// Connexion à Firebase (comptes + base Firestore).
// Cette configuration n'est pas secrète : la sécurité est assurée par les règles Firestore (firestore.rules).

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyB2uz6nF-2QZNx4ku9IjAaGWaOESRIfbbM",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "koralab-5ba19.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "koralab-5ba19",
  storageBucket: "koralab-5ba19.firebasestorage.app",
  messagingSenderId: "809022418453",
  appId: "1:809022418453:web:ce6db4369cde18e954a81c",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

'use client';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, type Auth } from 'firebase/auth';

/** The ONLY place the browser touches Firebase: exchanging an email/password
 *  for an ID token, which is immediately swapped for an httpOnly session
 *  cookie server-side. The browser never reads or writes Firestore. */
let app: FirebaseApp | undefined;

function clientApp(): FirebaseApp {
  if (app) return app;
  const existing = getApps();
  if (existing.length) { app = existing[0]; return app; }
  app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  });
  return app;
}

export function clientAuth(): Auth { return getAuth(clientApp()); }
export { signInWithEmailAndPassword };

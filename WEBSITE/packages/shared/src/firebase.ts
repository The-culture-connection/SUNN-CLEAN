/**
 * Firebase Admin SDK singleton.
 *
 * All server code goes through this. The client SDK is used only for the admin
 * login screen; no browser ever reads or writes Firestore directly.
 */

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

let app: App | undefined;

function readPrivateKey(): string {
  const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (raw) return raw.replace(/\\n/g, '\n');
  throw new Error(
    'Missing FIREBASE_PRIVATE_KEY_BASE64. Base64-encode the private_key from your ' +
    'service account JSON — raw newlines do not survive most env var editors.',
  );
}

export function getApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length) { app = existing[0]; return app; }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  if (!projectId || !clientEmail) {
    throw new Error('Missing FIREBASE_PROJECT_ID or FIREBASE_CLIENT_EMAIL.');
  }

  app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: readPrivateKey() }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  return app;
}

let _db: Firestore | undefined;
export function db(): Firestore {
  if (!_db) {
    _db = getFirestore(getApp());
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export function auth(): Auth { return getAuth(getApp()); }
export function bucket() { return getStorage(getApp()).bucket(); }

/** Time-limited download URL for a private object (invoices, job photos). */
export async function signedUrl(path: string, minutes = 15): Promise<string> {
  const [url] = await bucket().file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + minutes * 60_000,
  });
  return url;
}

export const COL = {
  settings: 'settings',
  catalog: 'catalogItems',
  propertyTypes: 'propertyTypes',
  surcharges: 'surcharges',
  crews: 'crews',
  crewDays: 'crewDays',
  blackouts: 'blackouts',
  bookings: 'bookings',
  invoices: 'invoices',
  reviews: 'reviews',
  gallery: 'galleryPairs',
  certifications: 'certifications',
  notifications: 'notifications',
  contact: 'contactMessages',
  audit: 'auditLog',
  counters: 'counters',
} as const;

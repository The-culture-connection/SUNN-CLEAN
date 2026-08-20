"use strict";
/**
 * Firebase Admin SDK singleton.
 *
 * All server code goes through this. The client SDK is used only for the admin
 * login screen; no browser ever reads or writes Firestore directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COL = void 0;
exports.getApp = getApp;
exports.db = db;
exports.auth = auth;
exports.bucket = bucket;
exports.signedUrl = signedUrl;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
let app;
function readPrivateKey() {
    const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
    if (b64)
        return Buffer.from(b64, 'base64').toString('utf8');
    const raw = process.env.FIREBASE_PRIVATE_KEY;
    if (raw)
        return raw.replace(/\\n/g, '\n');
    throw new Error('Missing FIREBASE_PRIVATE_KEY_BASE64. Base64-encode the private_key from your ' +
        'service account JSON — raw newlines do not survive most env var editors.');
}
function getApp() {
    if (app)
        return app;
    const existing = (0, app_1.getApps)();
    if (existing.length) {
        app = existing[0];
        return app;
    }
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    if (!projectId || !clientEmail) {
        throw new Error('Missing FIREBASE_PROJECT_ID or FIREBASE_CLIENT_EMAIL.');
    }
    app = (0, app_1.initializeApp)({
        credential: (0, app_1.cert)({ projectId, clientEmail, privateKey: readPrivateKey() }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    return app;
}
let _db;
function db() {
    if (!_db) {
        _db = (0, firestore_1.getFirestore)(getApp());
        _db.settings({ ignoreUndefinedProperties: true });
    }
    return _db;
}
function auth() { return (0, auth_1.getAuth)(getApp()); }
function bucket() { return (0, storage_1.getStorage)(getApp()).bucket(); }
/** Time-limited download URL for a private object (invoices, job photos). */
async function signedUrl(path, minutes = 15) {
    const [url] = await bucket().file(path).getSignedUrl({
        action: 'read',
        expires: Date.now() + minutes * 60_000,
    });
    return url;
}
exports.COL = {
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
};

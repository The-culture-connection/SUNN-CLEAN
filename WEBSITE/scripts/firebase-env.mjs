/**
 * Turn a Firebase service-account JSON into the env vars Railway needs, and
 * prove the key actually works before you paste it in.
 *
 *   node scripts/firebase-env.mjs ~/Downloads/sunn-cleaning-xxxx.json
 *
 * Writes railway-vars-FIREBASE.txt (gitignored). The private key is never
 * printed to the terminal.
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/firebase-env.mjs <service-account.json>');
  process.exit(1);
}

let sa;
try {
  sa = JSON.parse(fs.readFileSync(src, 'utf8'));
} catch (e) {
  console.error(`Could not read ${src}: ${e.message}`);
  process.exit(1);
}

const missing = ['project_id', 'client_email', 'private_key'].filter((k) => !sa[k]);
if (missing.length) {
  console.error(`Not a service-account key — missing: ${missing.join(', ')}`);
  process.exit(1);
}
if (!sa.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
  console.error('private_key is not a PEM block. Re-download the key from Firebase.');
  process.exit(1);
}

console.log('project_id     :', sa.project_id);
console.log('client_email   :', sa.client_email);
console.log('private_key_id :', sa.private_key_id ?? '(none)');

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

process.stdout.write('\nChecking the key against Firestore... ');
try {
  const app = initializeApp({ credential: cert(sa) });
  await getFirestore(app).collection('settings').limit(1).get();
  console.log('OK');
} catch (e) {
  console.log('FAILED');
  console.error(`\n  ${e.code === 16 || e.code === 'UNAUTHENTICATED'
    ? 'Google rejected this key. It has been deleted or disabled —\n  generate a new one in Firebase Console > Project settings >\n  Service accounts > Generate new private key.'
    : String(e.message).split('\n')[0]}`);
  process.exit(1);
}

const out = [
  `FIREBASE_PROJECT_ID=${sa.project_id}`,
  `FIREBASE_CLIENT_EMAIL=${sa.client_email}`,
  `FIREBASE_PRIVATE_KEY_BASE64=${Buffer.from(sa.private_key, 'utf8').toString('base64')}`,
  `FIREBASE_STORAGE_BUCKET=${process.env.FIREBASE_STORAGE_BUCKET ?? `${sa.project_id}.firebasestorage.app`}`,
  '',
].join('\n');

const dest = path.join(process.cwd(), 'railway-vars-FIREBASE.txt');
fs.writeFileSync(dest, out, 'utf8');
console.log(`\nWrote ${dest}`);
console.log('Paste those 4 lines into Railway > Variables on BOTH services.');
console.log('The file is gitignored. Delete it when you are done.');
process.exit(0);

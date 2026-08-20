/**
 * Seed the database.
 *
 * Safe to re-run: it only writes documents that do not already exist, so it
 * will never overwrite prices or settings you have edited in the portal.
 *
 *   npm run seed
 *
 * What it creates:
 *   - settings/app, with Grace's real mission statement and a 60-minute buffer
 *   - one crew ("Crew A") with default operating hours
 *   - property types, all at x1.00 so they are effectively switched off
 *   - surcharges, all INACTIVE with zero value, ready to be switched on
 *
 * What it deliberately does NOT create: services and add-on prices. Those are
 * Grace's real numbers and inventing plausible-looking ones would be worse than
 * an empty catalog, because a wrong number that looks right never gets checked.
 */

import {
  db, COL, defaultSettings, defaultCrew, DEFAULT_PROPERTY_TYPES, DEFAULT_SURCHARGES,
} from '../packages/shared/dist/index.js';

const TZ = process.env.BUSINESS_TIMEZONE || 'America/New_York';

async function main() {
  const store = db();
  let created = 0;
  let skipped = 0;

  /* ---------------- settings ---------------- */
  const settingsRef = store.collection(COL.settings).doc('app');
  if ((await settingsRef.get()).exists) {
    console.log('  · settings/app already exists — left untouched');
    skipped++;
  } else {
    await settingsRef.set({ ...defaultSettings(TZ), updatedAt: Date.now() });
    console.log('  ✓ settings/app created (mission statement, 60-minute travel buffer)');
    created++;
  }

  /* ---------------- crew ---------------- */
  const crews = await store.collection(COL.crews).limit(1).get();
  if (!crews.empty) {
    console.log('  · crews already exist — left untouched');
    skipped++;
  } else {
    const crew = defaultCrew(0);
    await store.collection(COL.crews).add({ ...crew, createdAt: Date.now(), updatedAt: Date.now() });
    console.log(`  ✓ ${crew.name} created (${crew.headcount} cleaners, Mon–Sat)`);
    created++;
  }

  /* ---------------- property types ---------------- */
  const types = await store.collection(COL.propertyTypes).limit(1).get();
  if (!types.empty) {
    console.log('  · property types already exist — left untouched');
    skipped++;
  } else {
    const batch = store.batch();
    for (const t of DEFAULT_PROPERTY_TYPES) {
      batch.set(store.collection(COL.propertyTypes).doc(), t);
    }
    await batch.commit();
    console.log(`  ✓ ${DEFAULT_PROPERTY_TYPES.length} property types created (all at x1.00)`);
    created++;
  }

  /* ---------------- surcharges ---------------- */
  const surcharges = await store.collection(COL.surcharges).limit(1).get();
  if (!surcharges.empty) {
    console.log('  · surcharges already exist — left untouched');
    skipped++;
  } else {
    const batch = store.batch();
    for (const s of DEFAULT_SURCHARGES) {
      batch.set(store.collection(COL.surcharges).doc(), s);
    }
    await batch.commit();
    console.log(`  ✓ ${DEFAULT_SURCHARGES.length} surcharges created (all switched OFF)`);
    created++;
  }

  console.log(`\nDone — ${created} group(s) created, ${skipped} left as they were.\n`);
  console.log('NEXT STEPS');
  console.log('  1. npm run grant-admin your@email.com      (make yourself an admin)');
  console.log('  2. Start the admin portal and open Services & Add-ons');
  console.log('  3. Add your real services, prices and job durations');
  console.log('  4. Set your crew hours and hourly cost on the Crews page');
  console.log('');
  console.log('Until at least one service and one crew exist, the booking page will');
  console.log('tell visitors to call you instead of showing an empty form.\n');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('\nSeed failed:', err.message);
  console.error('\nCheck that .env has FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and');
  console.error('FIREBASE_PRIVATE_KEY_BASE64 set correctly.\n');
  process.exit(1);
});

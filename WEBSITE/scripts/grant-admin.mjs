/**
 * Grant admin access.
 *
 *   npm run grant-admin grace-s@the-culture-connection.com
 *
 * Creates the Firebase Auth user if it doesn't exist (printing a temporary
 * password once) and sets the `admin: true` custom claim the portal requires.
 * Admin access is deliberately NOT self-serve — there is no signup screen.
 */

import { auth } from '../packages/shared/dist/index.js';
import crypto from 'node:crypto';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('\nUsage: npm run grant-admin your@email.com\n');
  process.exit(1);
}

async function main() {
  const a = auth();
  let user;
  let tempPassword = null;

  try {
    user = await a.getUserByEmail(email);
    console.log(`  · Found existing user ${email}`);
  } catch {
    tempPassword = crypto.randomBytes(9).toString('base64url');
    user = await a.createUser({ email, password: tempPassword, emailVerified: true });
    console.log(`  ✓ Created user ${email}`);
  }

  await a.setCustomUserClaims(user.uid, { admin: true });
  console.log('  ✓ Admin claim granted');

  if (tempPassword) {
    console.log('\n  TEMPORARY PASSWORD (shown once — save it now):\n');
    console.log(`      ${tempPassword}\n`);
    console.log('  Sign in with it, then change it in the Firebase console under');
    console.log('  Authentication → Users. Anyone with this password has full access');
    console.log('  to customer addresses and alarm codes, so treat it accordingly.\n');
  } else {
    console.log('\n  Existing password unchanged.\n');
  }

  console.log('  Also add this address to ADMIN_ALLOWED_EMAILS in your environment');
  console.log('  variables — it is the second gate in front of the portal.\n');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('\nFailed:', err.message, '\n');
  process.exit(1);
});

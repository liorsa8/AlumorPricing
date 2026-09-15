// One-time (or per-new-admin) bootstrap: grants the `admin: true` custom claim to a user's
// Firebase Auth account. This is the ONLY path in the whole system that can ever grant admin —
// it's what firestore.rules checks (`request.auth.token.admin == true`) to gate writes to the
// global catalog_* collections. The user must sign out/in once afterwards for the new claim to
// appear in their ID token.
//
// Usage:
//   node setAdminClaim.js you@gmail.com                 (real project, needs service-account.json)
//   node setAdminClaim.js you@gmail.com --key path.json  (real project, explicit key path)
//   node setAdminClaim.js you@gmail.com --emulator       (local emulator, no credentials needed)
const { initAdmin } = require('./initAdmin');

async function main() {
  const email = process.argv[2];
  if (!email || email.startsWith('--')) {
    console.error('Usage: node setAdminClaim.js <email> [--emulator] [--key <path>]');
    process.exit(1);
  }

  const admin = initAdmin();
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`Granted admin claim to ${email} (uid ${user.uid}). They must sign out and back in for it to take effect.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Shared bootstrap for both scripts. Two modes:
//   --emulator            talk to the local Firestore/Auth emulators (see ../../firebase.json)
//                         — no credentials needed, matches .firebaserc's "demo-alumor-pricing".
//   (default)             talk to a real Firebase project using a downloaded service-account
//                         key — never commit that file (see ../../.gitignore).
function initAdmin() {
  const args = process.argv.slice(2);
  const useEmulator = args.includes('--emulator');
  const keyArgIndex = args.indexOf('--key');
  const keyPath = keyArgIndex !== -1 ? args[keyArgIndex + 1] : path.join(__dirname, 'service-account.json');

  if (useEmulator) {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
    admin.initializeApp({ projectId: 'demo-alumor-pricing' });
    console.log(`Using local emulators (Firestore ${process.env.FIRESTORE_EMULATOR_HOST}, Auth ${process.env.FIREBASE_AUTH_EMULATOR_HOST}), project demo-alumor-pricing.`);
    return admin;
  }

  if (!fs.existsSync(keyPath)) {
    console.error(
      `No service account key found at ${keyPath}.\n` +
        'Download one from Firebase console → Project settings → Service accounts → Generate new private key,\n' +
        'save it there (git-ignored), or pass --key <path>. Or run with --emulator to test against the local emulator.'
    );
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log(`Using real project ${serviceAccount.project_id}.`);
  return admin;
}

module.exports = { initAdmin };

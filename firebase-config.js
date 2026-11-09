/* Stacy Chess · Multiplayer backend configuration.
   This is the ONLY file to edit when Multiplayer goes live. Until the Web API key is pasted the app shows
   "Multiplayer not set up yet" and everything else works offline as before.
   A Firebase web config is a public identifier, not a password or credential; access is enforced by the
   Firestore rules. Never put a service-account key or any password in the app.

   mode: 'free'   (default) Firebase Spark plan, no billing, no Cloud Functions. Players' apps write to
                  Firestore directly and firestore.rules from stacy-multiplayer-free-setup.zip referee.
                  Setup: README in that ZIP (phone-only console steps).
   mode: 'strict' optional, needs the Blaze plan: the Cloud Functions backend from
                  stacy-multiplayer-backend.zip decides every move; set backendDeployed: true after deploy. */
window.STACY_FIREBASE = {
  mode: 'free',
  // ▼▼▼ PLACEHOLDER: paste the exact Web API key from Firebase console → Project settings → General → Your apps (Web app) ▼▼▼
  apiKey: 'AIzaSyDpz_I1nvNXlrRKssJdjIFck8_ItFTGWk8',
  // ▲▲▲ the only placeholder in the app ▲▲▲
  authDomain: 'stacy-chess.firebaseapp.com',
  projectId: 'stacy-chess',
  storageBucket: 'stacy-chess.firebasestorage.app',
  messagingSenderId: '498167277855',
  appId: '1:498167277855:web:1aa03f1a31f592299ca82a',
  syntheticDomain: 'users.stacy-chess.invalid', // free mode: hidden sign-in address <username>@this; must match firestore.rules emailDomain()
  functionsRegion: 'europe-west1',   // strict mode only: must match functions/src/config.js REGION
  backendDeployed: false,            // strict mode only: true after `firebase deploy` of rules + functions succeeded
  emulator: null                     // local testing only, e.g. { host: '127.0.0.1' } with projectId 'demo-stacy'
};

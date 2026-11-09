# Firebase JavaScript SDK 13.2.0 (compat builds), bundled unmodified

Copyright Google LLC. Licensed under the Apache License, Version 2.0 (`LICENSE-Apache-2.0.txt`).
Source: https://github.com/firebase/firebase-js-sdk , npm package `firebase@13.2.0`, files `firebase-{app,auth,firestore,functions}-compat.js`.

| File | sha256 |
|---|---|
| firebase-app-compat.js | 4a172d0406017a1abbf238a3cc88a7bcb9bd4a15955719077109f745a8ab0d25 |
| firebase-auth-compat.js | 45c2c21c087cfa7f687ba34885af19c21fd5d22e61ae9960f46c97fedb5da916 |
| firebase-firestore-compat.js | 4401097a720e85a7409fbbb71002be27bdd96159a72db02e19b23e62d5f4e17b |
| firebase-functions-compat.js | 90bad510e9f3d886e9f404b5b341cef01c2cfe27ff61bac1be417196f0d3ba40 |

Loaded only when the Multiplayer screen opens and the backend is configured (never at app start, never from a CDN).
Stacy signs in with custom tokens only. `firebase-auth-compat.js` contains URLs for Google's sign-in popup
(apis.google.com) and reCAPTCHA (phone sign-in); those code paths are never used by Stacy, so no script is
fetched from them. Network requests go only to the Firebase project endpoints (Auth, Firestore, Cloud Functions).

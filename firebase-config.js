// ---------------------------------------------------------------------------
// Glideways Staff Portal — Firebase configuration
//
// Replace the values below with the config snippet from your own Firebase
// project (Project settings → General → Your apps → SDK setup and
// configuration). These values are meant to be public in client-side code —
// they identify your project, they are not secret keys. Access is protected
// by Firebase Authentication + Firebase's authorized-domains setting, not by
// hiding this file.
//
// See README.md for step-by-step setup instructions.
// ---------------------------------------------------------------------------

const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

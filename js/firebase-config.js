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
  apiKey: "AIzaSyBzJC1YcFRundUm07eS9RhnXeh2GOczqeM",
  authDomain: "glideways-staff-portal.firebaseapp.com",
  projectId: "glideways-staff-portal",
  storageBucket: "glideways-staff-portal.firebasestorage.app",
  messagingSenderId: "1058047341460",
  appId: "1:1058047341460:web:44953a3bf7f8aa0d715581"
};

firebase.initializeApp(firebaseConfig);

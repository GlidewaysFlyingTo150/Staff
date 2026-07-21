// ---------------------------------------------------------------------------
// Glideways Staff Portal — login logic
// ---------------------------------------------------------------------------

const auth = firebase.auth();

// If already signed in, skip straight to the portal.
auth.onAuthStateChanged((user) => {
  if (user) window.location.href = "portal.html";
});

const form = document.getElementById("login-form");
const errorText = document.getElementById("error-text");
const submitBtn = document.getElementById("submit-btn");

function friendlyError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error — check your connection and try again.";
    default:
      return "Sign in failed. Please try again.";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  errorText.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      window.location.href = "portal.html";
    })
    .catch((err) => {
      errorText.textContent = friendlyError(err.code);
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in";
    });
});

// Simple live UTC (Zulu) clock — the time format aviation ops runs on.
const clockEl = document.getElementById("clock");
function tickClock() {
  if (!clockEl) return;
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  clockEl.textContent = `${hh}:${mm}Z`;
}
tickClock();
setInterval(tickClock, 1000 * 15);

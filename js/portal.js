// ---------------------------------------------------------------------------
// Glideways Staff Portal — portal logic
// ---------------------------------------------------------------------------

const auth = firebase.auth();

const USERNAME_DOMAIN = "glideways-staff.internal";

function emailToUsername(email) {
  return email.endsWith(`@${USERNAME_DOMAIN}`)
    ? email.slice(0, -1 * (USERNAME_DOMAIN.length + 1))
    : email;
}

// Auth guard: bounce back to login if not signed in.
auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    const label = document.getElementById("user-email");
    if (label) label.textContent = emailToUsername(user.email);
  }
});

document.getElementById("signout-btn").addEventListener("click", () => {
  auth.signOut().then(() => {
    window.location.href = "index.html";
  });
});

// ---- Tabs -------------------------------------------------------------

const tabButtons = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".tab-panel");

function activateTab(name) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${name}`);
  });
  window.location.hash = name;
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// Deep-link support: portal.html#updates opens straight to that tab.
const initialTab = window.location.hash.replace("#", "");
if (["documents", "updates", "contact"].includes(initialTab)) {
  activateTab(initialTab);
}

// ---- Clock --------------------------------------------------------------

const clockEl = document.getElementById("portal-clock");
function tickClock() {
  if (!clockEl) return;
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  clockEl.textContent = `${hh}:${mm}Z`;
}
tickClock();
setInterval(tickClock, 1000 * 15);

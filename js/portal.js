// ---------------------------------------------------------------------------
// Glideways Staff Portal — portal logic
// ---------------------------------------------------------------------------

const auth = firebase.auth();

// Must match USERNAME_DOMAIN in js/auth.js.
const USERNAME_DOMAIN = "glideways-staff.internal";
const LAST_SEEN_KEY = "gw-updates-last-seen";

function emailToUsername(email) {
  return email && email.endsWith(`@${USERNAME_DOMAIN}`)
    ? email.slice(0, -1 * (USERNAME_DOMAIN.length + 1))
    : email;
}

let currentUser = null;
let currentUsername = "";
let canPost = false;

// ---- Documents (rendered from js/documents-data.js) ------------------------

const docGrid = document.getElementById("doc-grid");
if (docGrid && typeof GLIDEWAYS_DOCS !== "undefined") {
  GLIDEWAYS_DOCS.forEach((doc) => {
    const card = document.createElement("a");
    card.className = "doc-card";
    card.innerHTML = `
      <span class="doc-tag">${doc.tag}</span>
      <h3>${doc.title}</h3>
      <p>${doc.description}</p>
    `;
    if (doc.type === "link") {
      card.href = doc.href;
      card.target = "_blank";
      card.rel = "noopener";
    } else {
      card.href = `doc.html?id=${encodeURIComponent(doc.id)}`;
    }
    docGrid.appendChild(card);
  });
}

// ---- Announcements (Firestore) ---------------------------------------------

const updateList = document.getElementById("update-list");
const homePreview = document.getElementById("home-updates-preview");
const notifyDot = document.getElementById("notify-dot");

function timeAgoLabel(date) {
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function renderAnnouncement(a) {
  const date = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : null;
  return `
    <article class="update-item">
      <span class="update-date">${timeAgoLabel(date)}</span>
      <div>
        <span class="update-tag">${a.tag || "Notice"}</span>
        <h3>${a.title}</h3>
        <p>${a.body}</p>
        ${a.authorUsername ? `<p class="update-author">— ${a.authorUsername}</p>` : ""}
      </div>
    </article>
  `;
}

function loadAnnouncements() {
  db.collection("announcements")
    .orderBy("createdAt", "desc")
    .limit(30)
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        const emptyMsg = '<p class="empty-state">No updates yet.</p>';
        if (updateList) updateList.innerHTML = emptyMsg;
        if (homePreview) homePreview.innerHTML = emptyMsg;
        return;
      }

      const items = snapshot.docs.map((d) => d.data());

      if (updateList) updateList.innerHTML = items.map(renderAnnouncement).join("");
      if (homePreview) homePreview.innerHTML = items.slice(0, 2).map(renderAnnouncement).join("");

      checkForUnseenUpdates(snapshot.docs[0]);
    }, (err) => {
      console.error("Couldn't load announcements:", err);
      const errMsg = '<p class="empty-state">Couldn\'t load updates. Check your Firestore setup in README.md.</p>';
      if (updateList) updateList.innerHTML = errMsg;
      if (homePreview) homePreview.innerHTML = errMsg;
    });
}

function checkForUnseenUpdates(latestDoc) {
  if (!notifyDot || !latestDoc) return;
  const latestData = latestDoc.data();
  const latestMillis = latestData.createdAt && latestData.createdAt.toMillis
    ? latestData.createdAt.toMillis()
    : 0;
  const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
  notifyDot.hidden = !(latestMillis > lastSeen);
}

function markUpdatesSeen() {
  localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  if (notifyDot) notifyDot.hidden = true;
}

// ---- New announcement modal --------------------------------------------

const modal = document.getElementById("announcement-modal");
const newBtn = document.getElementById("new-announcement-btn");
const cancelBtn = document.getElementById("cancel-announcement-btn");
const announcementForm = document.getElementById("announcement-form");
const announcementError = document.getElementById("announcement-error");
const postBtn = document.getElementById("post-announcement-btn");

if (newBtn) newBtn.addEventListener("click", () => { modal.classList.add("is-open"); });
if (cancelBtn) cancelBtn.addEventListener("click", () => { modal.classList.remove("is-open"); });
if (modal) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("is-open");
  });
}

if (announcementForm) {
  announcementForm.addEventListener("submit", (e) => {
    e.preventDefault();
    announcementError.textContent = "";

    const title = document.getElementById("announcement-title").value.trim();
    const tag = document.getElementById("announcement-tag").value;
    const body = document.getElementById("announcement-body").value.trim();

    postBtn.disabled = true;
    postBtn.textContent = "Posting…";

    db.collection("announcements").add({
      title,
      tag,
      body,
      authorUsername: currentUsername,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
      .then(() => {
        announcementForm.reset();
        modal.classList.remove("is-open");
      })
      .catch((err) => {
        console.error(err);
        announcementError.textContent = "Couldn't post — check your Firestore security rules in README.md.";
      })
      .finally(() => {
        postBtn.disabled = false;
        postBtn.textContent = "Post";
      });
  });
}

// ---- Auth guard + load this staff member's role ----------------------------

auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  currentUsername = emailToUsername(user.email);

  const label = document.getElementById("user-email");
  if (label) label.textContent = currentUsername;

  const greeting = document.getElementById("home-greeting");
  if (greeting) greeting.textContent = `Welcome, ${currentUsername}`;

  // Look up this user's role/posting permission from Firestore.
  // See README.md for how to create this "staff" document for each user.
  db.collection("staff").doc(user.uid).get()
    .then((doc) => {
      const roleBadge = document.getElementById("role-badge");
      if (doc.exists) {
        const data = doc.data();
        canPost = data.canPost === true;
        if (roleBadge && data.role) {
          roleBadge.textContent = data.role;
          roleBadge.hidden = false;
        }
      }
      if (newBtn) newBtn.hidden = !canPost;
    })
    .catch((err) => {
      console.error("Couldn't load staff role:", err);
    });

  loadAnnouncements();
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

  if (name === "updates") markUpdatesSeen();
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// Home tiles also switch tabs.
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.goto));
});

// Deep-link support: portal.html#updates opens straight to that tab.
const initialTab = window.location.hash.replace("#", "");
if (["home", "documents", "updates", "contact"].includes(initialTab)) {
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

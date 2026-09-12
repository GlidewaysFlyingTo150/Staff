// ---------------------------------------------------------------------------
// Glideways Staff Portal — Leave of Absence (LOA)
//
// This file checks canReviewLOA itself (a fresh Firestore read on load),
// rather than relying on a global set elsewhere in portal.js — keeps this
// feature self-contained so it doesn't depend on editing portal.js's
// internals correctly every time.
// ---------------------------------------------------------------------------

const loaForm = document.getElementById("loa-form");
const loaDeptContainer = document.getElementById("loa-departments");
const loaErrorText = document.getElementById("loa-form-error");
const loaSubmitBtn = document.getElementById("loa-submit-btn");
const loaResult = document.getElementById("loa-result");

const loaYourStatus = document.getElementById("loa-your-status");
const loaReviewSection = document.getElementById("loa-review-section");
const loaReviewList = document.getElementById("loa-review-list");

// ---- Populate department checkboxes ---------------------------------------

if (loaDeptContainer && typeof GLIDEWAYS_DEPARTMENTS !== "undefined") {
  GLIDEWAYS_DEPARTMENTS.forEach((dept, i) => {
    const id = `loa-dept-${i}`;
    const wrap = document.createElement("label");
    wrap.className = "checkbox-option";
    wrap.innerHTML = `<input type="checkbox" id="${id}" value="${dept}"> ${dept}`;
    loaDeptContainer.appendChild(wrap);
  });
}

function showLoaResult(kind, html) {
  if (!loaResult) return;
  loaResult.className = `host-result ${kind}`;
  loaResult.innerHTML = html;
  loaResult.hidden = false;
}

// ---- Submit a new LOA request ----------------------------------------------

if (loaForm) {
  loaForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loaErrorText.textContent = "";
    loaResult.hidden = true;

    const departments = Array.from(loaDeptContainer.querySelectorAll("input[type=checkbox]:checked")).map((cb) => cb.value);
    const startDate = document.getElementById("loa-start-date").value;
    const endDate = document.getElementById("loa-end-date").value;
    const reason = document.getElementById("loa-reason").value.trim();

    if (departments.length === 0 || !startDate || !endDate || !reason) {
      loaErrorText.textContent = "Please select at least one department and fill out every field.";
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      loaErrorText.textContent = "End date can't be before the start date.";
      return;
    }

    loaSubmitBtn.disabled = true;
    loaSubmitBtn.textContent = "Submitting…";

    try {
      await db.collection("loaRequests").add({
        requestedByUid: currentUser.uid,
        requestedByUsername: currentUsername,
        departments,
        startDate,
        endDate,
        reason,
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showLoaResult("success", `
        <h3>LOA request submitted</h3>
        <p>${departments.join(", ")} · ${startDate} to ${endDate}</p>
        <p>You'll see the decision on your Home tab once it's reviewed.</p>
      `);
      loaForm.reset();
      loadYourLoaStatus();
    } catch (err) {
      console.error("LOA submission failed:", err);
      showLoaResult("failure", `<h3>Couldn't submit</h3><p>Please try again.</p>`);
    } finally {
      loaSubmitBtn.disabled = false;
      loaSubmitBtn.textContent = "Submit request";
    }
  });
}

// ---- Home tab: your own LOA status -----------------------------------------

function renderLoaStatusCard(req) {
  if (req.status === "pending") {
    return `<div class="loa-status-card pending"><strong>Pending</strong> — ${req.departments.join(", ")} · ${req.startDate} to ${req.endDate}</div>`;
  }
  if (req.status === "approved") {
    return `<div class="loa-status-card approved"><strong>Approved</strong> — ${req.departments.join(", ")} · ${req.startDate} to ${req.endDate}</div>`;
  }
  return `<div class="loa-status-card denied"><strong>Denied</strong> — ${req.departments.join(", ")} · ${req.startDate} to ${req.endDate}<br>Reason: ${req.denialReason || "—"}</div>`;
}

function loadYourLoaStatus() {
  if (!loaYourStatus || !currentUser) return;
  db.collection("loaRequests")
    .where("requestedByUid", "==", currentUser.uid)
    .orderBy("createdAt", "desc")
    .limit(5)
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        loaYourStatus.innerHTML = '<p class="empty-state">No LOA requests on file.</p>';
        return;
      }
      loaYourStatus.innerHTML = snapshot.docs.map((d) => renderLoaStatusCard(d.data())).join("");
    }, (err) => {
      console.error("Couldn't load your LOA status:", err);
    });
}

// ---- Home tab / dashboard: review queue for canReviewLOA staff ------------

function renderReviewItem(id, req) {
  return `
    <div class="loa-review-card" data-id="${id}">
      <p><strong>${req.requestedByUsername}</strong> — ${req.departments.join(", ")}</p>
      <p>${req.startDate} to ${req.endDate}</p>
      <p class="loa-reason">"${req.reason}"</p>
      <div class="loa-review-actions">
        <button class="submit-btn small-btn loa-approve-btn" data-id="${id}">Approve</button>
        <button class="signout-btn loa-deny-btn" data-id="${id}">Deny</button>
      </div>
    </div>
  `;
}

function loadReviewQueue() {
  if (!loaReviewList) return;
  db.collection("loaRequests")
    .where("status", "==", "pending")
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        loaReviewList.innerHTML = '<p class="empty-state">No pending LOA requests.</p>';
        return;
      }
      loaReviewList.innerHTML = snapshot.docs.map((d) => renderReviewItem(d.id, d.data())).join("");
    }, (err) => {
      console.error("Couldn't load LOA review queue:", err);
      loaReviewList.innerHTML = '<p class="empty-state">Couldn\'t load requests — check canReviewLOA and Firestore rules.</p>';
    });
}

if (loaReviewList) {
  loaReviewList.addEventListener("click", async (e) => {
    const approveBtn = e.target.closest(".loa-approve-btn");
    const denyBtn = e.target.closest(".loa-deny-btn");
    if (!approveBtn && !denyBtn) return;

    const id = (approveBtn || denyBtn).dataset.id;
    const ref = db.collection("loaRequests").doc(id);

    if (approveBtn) {
      approveBtn.disabled = true;
      try {
        await ref.update({
          status: "approved",
          reviewedByUid: currentUser.uid,
          reviewedByUsername: currentUsername,
          reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.error("Approve failed:", err);
        alert("Couldn't approve — check that one of your roles has LOA-review permission.");
        approveBtn.disabled = false;
      }
      return;
    }

    if (denyBtn) {
      const reason = prompt("Reason for denial (required):");
      if (!reason || !reason.trim()) return; // required — abort if empty/cancelled
      denyBtn.disabled = true;
      try {
        await ref.update({
          status: "denied",
          denialReason: reason.trim(),
          reviewedByUid: currentUser.uid,
          reviewedByUsername: currentUsername,
          reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.error("Deny failed:", err);
        alert("Couldn't deny — check that one of your roles has LOA-review permission.");
        denyBtn.disabled = false;
      }
    }
  });
}

// ---- Wire up once signed in -------------------------------------------------

auth.onAuthStateChanged(async (user) => {
  if (!user) return;

  loadYourLoaStatus();

  // Independent check of LOA-review permission, so this feature doesn't
  // depend on portal.js's role-loading code being edited correctly too.
  // Permission comes from roleCanViewLOA() in js/roles-data.js — true if
  // ANY role this person holds is flagged canViewLOA: true there, not
  // from a flag on this specific person.
  try {
    const staffDoc = await db.collection("staff").doc(user.uid).get();
    const roles = staffDoc.exists ? staffDoc.data().roles : [];
    const canReviewLOA = typeof roleCanViewLOA === "function" && roleCanViewLOA(roles);
    if (loaReviewSection) loaReviewSection.hidden = !canReviewLOA;
    if (canReviewLOA) loadReviewQueue();
  } catch (err) {
    console.error("Couldn't check LOA-review permission:", err);
  }
});

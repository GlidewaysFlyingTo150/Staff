// ---------------------------------------------------------------------------
// Glideways Staff Portal — Host a Flight
//
// Relies on globals from portal.js (currentUsername, db) and
// airports-data.js (GLIDEWAYS_AIRPORTS, GWY_ROUTES) and
// discord-config.js (DISCORD_WEBHOOK_URL), all loaded before this file.
// ---------------------------------------------------------------------------

const hostForm = document.getElementById("host-flight-form");
const hostDepartureSelect = document.getElementById("host-departure");
const hostArrivalSelect = document.getElementById("host-arrival-airport");
const hostErrorText = document.getElementById("host-form-error");
const hostSubmitBtn = document.getElementById("host-submit-btn");
const hostResult = document.getElementById("host-result");

const MIN_LEAD_DAYS = 7;
const MIN_FLIGHT_NUMBER = 1000;
const MAX_FLIGHT_NUMBER = 9999;
const MAX_NUMBER_ATTEMPTS = 12;

// ---- Populate airport dropdowns ---------------------------------------

if (hostDepartureSelect && typeof GLIDEWAYS_AIRPORTS !== "undefined") {
  GLIDEWAYS_AIRPORTS.forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code;
    hostDepartureSelect.appendChild(opt);
  });

  hostDepartureSelect.addEventListener("change", () => {
    const departure = hostDepartureSelect.value;
    hostArrivalSelect.innerHTML = '<option value="" disabled selected>Select arrival</option>';
    GLIDEWAYS_AIRPORTS.filter((code) => code !== departure).forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      hostArrivalSelect.appendChild(opt);
    });
  });
}

// ---- Helpers -------------------------------------------------------------

function randomFlightNumber() {
  return Math.floor(Math.random() * (MAX_FLIGHT_NUMBER - MIN_FLIGHT_NUMBER + 1)) + MIN_FLIGHT_NUMBER;
}

// Finds a flight number not already in use by reading (not guessing) —
// there's a small theoretical race if two people submit in the same
// instant, but that's extremely unlikely for this scale of use.
async function findAvailableFlightNumber() {
  for (let i = 0; i < MAX_NUMBER_ATTEMPTS; i++) {
    const candidate = String(randomFlightNumber());
    const doc = await db.collection("flights").doc(candidate).get();
    if (!doc.exists) return candidate;
  }
  throw new Error("Couldn't find an available flight number — please try again.");
}

function buildEmbedDescription(f) {
  const hostLine = f.secondaryHost
    ? `${f.primaryHost} and ${f.secondaryHost}`
    : f.primaryHost;

  return [
    `**🌿| Glideways Flight ${f.flightNumber} ${f.departureAirport} -> ${f.arrivalAirport}**`,
    `-# *"Making our skies greener"*`,
    ``,
    `Flight ${f.flightNumber} will be departing from ${f.departureAirport} and arriving at ${f.arrivalAirport}. The flight is hosted by ${hostLine}. This flight will have announcements in English. We can't wait to see you there!`,
    ``,
    `**Flight Information**`,
    `*Check-in Open:* ***${f.checkInOpen}***`,
    `*Check In Close:* ***${f.checkInClose}***`,
    `*Boarding Opens:* ***${f.boardingOpen}***`,
    `*Boarding Closes/Pushback:* ***${f.boardingClose}***`,
    `*Estimated Arrival Time:* ***${f.arrivalTime}***`,
    `***Links will be shared 10 minutes before Check-In opens***`
  ].join("\n");
}

async function postToDiscord(f) {
  if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.startsWith("REPLACE_")) {
    throw new Error("Discord webhook URL isn't configured yet (js/discord-config.js).");
  }
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        description: buildEmbedDescription(f),
        color: 3066993 // Glideways Green, #2ECC71
      }]
    })
  });
  if (!res.ok) throw new Error(`Discord webhook returned ${res.status}`);
}

function showResult(kind, html) {
  hostResult.className = `host-result ${kind}`;
  hostResult.innerHTML = html;
  hostResult.hidden = false;
}

// ---- Submit ----------------------------------------------------------------

if (hostForm) {
  hostForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hostErrorText.textContent = "";
    hostResult.hidden = true;

    const flightDateStr = document.getElementById("host-flight-date").value;
    const primaryHost = document.getElementById("host-primary").value.trim();
    const secondaryHost = document.getElementById("host-secondary").value.trim();
    const staffing = document.getElementById("host-staffing").value;
    const checkInOpen = document.getElementById("host-checkin-open").value.trim();
    const checkInClose = document.getElementById("host-checkin-close").value.trim();
    const boardingOpen = document.getElementById("host-boarding-open").value.trim();
    const boardingClose = document.getElementById("host-boarding-close").value.trim();
    const arrivalTime = document.getElementById("host-arrival-time").value.trim();
    const departureAirport = hostDepartureSelect.value;
    const arrivalAirport = hostArrivalSelect.value;
    const accessCode = document.getElementById("host-access-code").value;

    // ---- Client-side validation (fast feedback; Firestore rules are the
    // real authority and will reject anything that slips past this) ----

    if (!flightDateStr || !primaryHost || !staffing || !checkInOpen || !checkInClose ||
        !boardingOpen || !boardingClose || !arrivalTime || !departureAirport ||
        !arrivalAirport || !accessCode) {
      hostErrorText.textContent = "Please fill out every field before submitting.";
      return;
    }

    if (departureAirport === arrivalAirport) {
      hostErrorText.textContent = "Departure and arrival airports can't be the same.";
      return;
    }

    const flightDate = new Date(`${flightDateStr}T00:00:00`);
    const minAllowedDate = new Date(Date.now() + MIN_LEAD_DAYS * 24 * 60 * 60 * 1000);
    if (flightDate < minAllowedDate) {
      hostErrorText.textContent = `Flights must be submitted at least ${MIN_LEAD_DAYS} days in advance.`;
      return;
    }

    hostSubmitBtn.disabled = true;
    hostSubmitBtn.textContent = "Submitting…";

    try {
      const flightNumber = await findAvailableFlightNumber();
      const routeCode = (GWY_ROUTES[departureAirport] && GWY_ROUTES[departureAirport][arrivalAirport]) || null;

      const flightData = {
        flightNumber,
        flightDate: firebase.firestore.Timestamp.fromDate(flightDate),
        primaryHost,
        secondaryHost: secondaryHost || null,
        staffingConfirmed: staffing,
        checkInOpen,
        checkInClose,
        boardingOpen,
        boardingClose,
        arrivalTime,
        departureAirport,
        arrivalAirport,
        routeCode,
        accessCode,
        submittedBy: currentUsername,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      // The Firestore security rules are what actually decide whether this
      // is "approved" — they check canHost, required fields, the 7-day
      // lead time, and that accessCode matches the primary host's code on
      // file. If any of that fails, this write is rejected and nothing
      // gets posted to Discord.
      await db.collection("flights").doc(flightNumber).set(flightData);

      let webhookWarning = "";
      try {
        await postToDiscord(flightData);
      } catch (webhookErr) {
        console.error("Webhook post failed:", webhookErr);
        webhookWarning = `<p>⚠️ The flight was approved and saved, but the Discord announcement couldn't be sent automatically. Check js/discord-config.js and post it manually if needed.</p>`;
      }

      showResult("success", `
        <h3>Flight approved</h3>
        <div class="flight-number">#${flightNumber}</div>
        <p>${departureAirport} → ${arrivalAirport}${routeCode ? ` · Route ${routeCode}` : ""}</p>
        ${webhookWarning}
      `);
      hostForm.reset();
      hostArrivalSelect.innerHTML = '<option value="" disabled selected>Select departure first</option>';

    } catch (err) {
      console.error(err);
      showResult("failure", `
        <h3>Submission failed</h3>
        <p>This usually means the access code doesn't match the primary host on file, the flight isn't at least ${MIN_LEAD_DAYS} days out, or you don't have hosting permission. Double-check the details and try again.</p>
      `);
    } finally {
      hostSubmitBtn.disabled = false;
      hostSubmitBtn.textContent = "Submit flight";
    }
  });
}

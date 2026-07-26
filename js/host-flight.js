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

// Formula for everything downstream of check-in opening — in minutes.
const CHECKIN_CLOSE_OFFSET_MIN = 30;   // 30 min after check-in opens
const BOARDING_OPEN_OFFSET_MIN = 25;   // 25 min after check-in closes
const BOARDING_CLOSE_OFFSET_MIN = 45;  // 45 min after boarding opens
const ARRIVAL_OFFSET_MIN = 90;         // 1.5 hrs after boarding closes/pushback

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

// Parses a pasted Discord timestamp like <t:1737907200:F> into its unix
// seconds and format flag. Returns null if it doesn't look like one.
function parseDiscordTimestamp(str) {
  const match = String(str).trim().match(/^<t:(\d+):([tTdDfFR])>$/);
  if (!match) return null;
  return { unix: parseInt(match[1], 10), flag: match[2] };
}

function formatDiscordTimestamp(unix, flag) {
  return `<t:${unix}:${flag}>`;
}

// Builds the four downstream timestamps from a single check-in-open
// timestamp, per the fixed formula:
//   check-in close   = +30 min after check-in open
//   boarding open     = +25 min after check-in close
//   boarding close    = +45 min after boarding open
//   arrival           = +90 min after boarding close
function computeScheduleFromCheckInOpen(parsed) {
  const MIN = 60;
  const checkInCloseUnix = parsed.unix + CHECKIN_CLOSE_OFFSET_MIN * MIN;
  const boardingOpenUnix = checkInCloseUnix + BOARDING_OPEN_OFFSET_MIN * MIN;
  const boardingCloseUnix = boardingOpenUnix + BOARDING_CLOSE_OFFSET_MIN * MIN;
  const arrivalUnix = boardingCloseUnix + ARRIVAL_OFFSET_MIN * MIN;

  return {
    checkInOpen: formatDiscordTimestamp(parsed.unix, parsed.flag),
    checkInClose: formatDiscordTimestamp(checkInCloseUnix, parsed.flag),
    boardingOpen: formatDiscordTimestamp(boardingOpenUnix, parsed.flag),
    boardingClose: formatDiscordTimestamp(boardingCloseUnix, parsed.flag),
    arrivalTime: formatDiscordTimestamp(arrivalUnix, parsed.flag)
  };
}

// Looks up a host's Discord user ID from their staff record, by username,
// so the announcement can ping them. Returns null if not found — the
// announcement still sends, just without that ping.
async function findDiscordUserId(username) {
  try {
    const snapshot = await db.collection("staff")
      .where("username", "==", username)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const data = snapshot.docs[0].data();
    return data.discordUserId || null;
  } catch (err) {
    console.error("Couldn't look up host's Discord ID:", err);
    return null;
  }
}

function buildMessageContent(f, primaryDiscordUserId, secondaryDiscordUserId) {
  const primaryMention = primaryDiscordUserId ? `<@${primaryDiscordUserId}>` : f.primaryHost;
  const secondaryMention = f.secondaryHost
    ? (secondaryDiscordUserId ? `<@${secondaryDiscordUserId}>` : f.secondaryHost)
    : null;
  const hostLine = secondaryMention ? `${primaryMention} and ${secondaryMention}` : primaryMention;

  const lines = [];
  lines.push(
    `**🌿| Glideways Flight ${f.flightNumber} ${f.departureAirport} -> ${f.arrivalAirport}**`,
    `-# *"Making our skies greener"*`,
    `-# @everyone`,
    ``,
    `Flight ${f.flightNumber} will be departing from ${f.departureAirport} and arriving at ${f.arrivalAirport}. The flight is hosted by ${hostLine}. We can't wait to see you there!`,
    ``,
    `**Flight Information**`,
    `*Check-in Open:* ***${f.checkInOpen}***`,
    `*Check In Close:* ***${f.checkInClose}***`,
    `*Boarding Opens:* ***${f.boardingOpen}***`,
    `*Boarding Closes/Pushback:* ***${f.boardingClose}***`,
    `*Estimated Arrival Time:* ***${f.arrivalTime}***`,
    `***We recommend you join 10 minutes prior to check-in.***`
  );
  return lines.join("\n");
}

async function postToDiscord(f, primaryDiscordUserId, secondaryDiscordUserId) {
  if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.startsWith("REPLACE_")) {
    throw new Error("Discord webhook URL isn't configured yet (js/discord-config.js).");
  }
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: buildMessageContent(f, primaryDiscordUserId, secondaryDiscordUserId)
      // No allowed_mentions restriction — @everyone and the host ping are
      // meant to actually notify people here.
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
    const checkInOpenRaw = document.getElementById("host-checkin-open").value.trim();
    const departureAirport = hostDepartureSelect.value;
    const arrivalAirport = hostArrivalSelect.value;
    const accessCode = document.getElementById("host-access-code").value;

    // ---- Client-side validation (fast feedback; Firestore rules are the
    // real authority and will reject anything that slips past this) ----

    if (!flightDateStr || !primaryHost || !staffing || !checkInOpenRaw ||
        !departureAirport || !arrivalAirport || !accessCode) {
      hostErrorText.textContent = "Please fill out every field before submitting.";
      return;
    }

    if (departureAirport === arrivalAirport) {
      hostErrorText.textContent = "Departure and arrival airports can't be the same.";
      return;
    }

    const parsedCheckIn = parseDiscordTimestamp(checkInOpenRaw);
    if (!parsedCheckIn) {
      hostErrorText.textContent = 'Check-in opening time needs to be a pasted Discord timestamp, like <t:1737907200:F>, from sesh.fyi/timestamp.';
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
      let flightNumber;
      try {
        flightNumber = await findAvailableFlightNumber();
      } catch (readErr) {
        console.error("Failed while checking for an available flight number (reading /flights):", readErr);
        throw readErr;
      }

      const routeCode = (GWY_ROUTES[departureAirport] && GWY_ROUTES[departureAirport][arrivalAirport]) || null;
      const schedule = computeScheduleFromCheckInOpen(parsedCheckIn);

      const flightData = {
        flightNumber,
        flightDate: firebase.firestore.Timestamp.fromDate(flightDate),
        primaryHost,
        secondaryHost: secondaryHost || null,
        staffingConfirmed: staffing,
        checkInOpen: schedule.checkInOpen,
        checkInClose: schedule.checkInClose,
        boardingOpen: schedule.boardingOpen,
        boardingClose: schedule.boardingClose,
        arrivalTime: schedule.arrivalTime,
        departureAirport,
        arrivalAirport,
        routeCode,
        accessCode,
        submittedBy: currentUsername,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      // The Firestore security rules are what actually decide whether this
      // is "approved" — they check canHost, that the date and check-in
      // time are present, the 7-day lead time, and that accessCode
      // matches the primary host's code on file. If any of that fails,
      // this write is rejected and nothing gets posted to Discord.
      try {
        await db.collection("flights").doc(flightNumber).set(flightData);
      } catch (writeErr) {
        console.error("Failed while saving the flight (writing to /flights) — check canHost, the flight date, check-in time, the 7-day lead time, and the access code:", writeErr);
        throw writeErr;
      }

      const primaryDiscordUserId = await findDiscordUserId(primaryHost);
      const secondaryDiscordUserId = secondaryHost ? await findDiscordUserId(secondaryHost) : null;

      let webhookWarning = "";
      try {
        await postToDiscord(flightData, primaryDiscordUserId, secondaryDiscordUserId);
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

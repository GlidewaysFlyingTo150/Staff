// ---------------------------------------------------------------------------
// Glideways Staff Portal — Host a Flight
//
// Relies on globals from portal.js (currentUsername, db) and
// airports-data.js (GLIDEWAYS_AIRPORTS, GWY_ROUTES, AIRCRAFT_TYPES,
// eligibleAircraftNames) and discord-config.js (NEW_FLIGHT_WEBHOOK_URL),
// all loaded before this file.
//
// Only the "New Flight" staffing-call message is sent from here, right
// after submission. The detailed flight-info message goes out 2 days
// before check-in opens (not 2 days after submission) — a browser tab can't reliably wait 2 days, so that one is sent
// by a scheduled GitHub Action instead (see scripts/send-flight-details.js
// and the README). This file just marks each flight with when that
// message is due.
// ---------------------------------------------------------------------------

const hostForm = document.getElementById("host-flight-form");
const hostDepartureSelect = document.getElementById("host-departure");
const hostArrivalSelect = document.getElementById("host-arrival-airport");
const hostFlightTypeSelect = document.getElementById("host-flight-type");
const hostAircraftSelect = document.getElementById("host-aircraft");
const hostErrorText = document.getElementById("host-form-error");
const hostSubmitBtn = document.getElementById("host-submit-btn");
const hostResult = document.getElementById("host-result");

const MIN_LEAD_DAYS = 7;
const MIN_FLIGHT_NUMBER = 1000;
const MAX_FLIGHT_NUMBER = 9999;
const MAX_NUMBER_ATTEMPTS = 12;
const DETAILS_DELAY_DAYS = 2; // sent this many days BEFORE check-in opens

// Formula for everything downstream of check-in opening — in minutes.
const CHECKIN_CLOSE_OFFSET_MIN = 15;   // 30 min after check-in opens
const BOARDING_OPEN_OFFSET_MIN = 10;   // 25 min after check-in closes
const BOARDING_CLOSE_OFFSET_MIN = 20;  // 45 min after boarding opens
const ARRIVAL_OFFSET_MIN = 70;         // 1.5 hrs after boarding closes/pushback

// ---- Populate airport + aircraft dropdowns ---------------------------------

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
    updatePrivateOptionAvailability();
    refreshAircraftOptions();
  });
}

// Sindal only operates the ATR42-600, so private flights simply can't
// depart from there — disable that option in the dropdown rather than
// letting someone pick an impossible combination.
function updatePrivateOptionAvailability() {
  if (!hostFlightTypeSelect) return;
  const departure = hostDepartureSelect.value;
  const privateOption = Array.from(hostFlightTypeSelect.options).find((o) => o.value === "Private");
  if (!privateOption) return;

  const blocked = departure === "EKSN";
  privateOption.disabled = blocked;
  if (blocked && hostFlightTypeSelect.value === "Private") {
    hostFlightTypeSelect.value = "";
    hostErrorText.textContent = "Private flights can't depart from Sindal (EKSN only operates the ATR42-600) — flight type has been reset.";
  }
}

if (hostFlightTypeSelect) {
  hostFlightTypeSelect.addEventListener("change", refreshAircraftOptions);
}

function refreshAircraftOptions() {
  if (!hostAircraftSelect) return;
  const departure = hostDepartureSelect.value;
  const flightType = hostFlightTypeSelect.value;

  if (!departure || !flightType) {
    hostAircraftSelect.innerHTML = '<option value="" disabled selected>Select departure and flight type first</option>';
    return;
  }

  const names = eligibleAircraftNames(departure, flightType);
  hostAircraftSelect.innerHTML = '<option value="" disabled selected>Select aircraft</option>';
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} (${AIRCRAFT_TYPES[name]})`;
    hostAircraftSelect.appendChild(opt);
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
// so messages can ping them. Returns null if not found — messages still
// send, just with a plain "@username" instead of a real ping.
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

// A real ping if we have their Discord ID, otherwise a plain "@name" —
// note the plain form is just text and won't actually notify them in
// Discord, only <@id> does that.
function mentionFor(name, discordUserId) {
  return discordUserId ? `<@${discordUserId}>` : `@${name}`;
}

// Full label for staff (Normal / Private / Emergency / Private Emergency).
// During an emergency, "Normal" is dropped and it's just "Emergency" —
// but "Private" is kept, so it reads "Private Emergency".
function staffFlightTypeLabel(flightType, isEmergency) {
  if (isEmergency) return flightType === "Private" ? "Private Emergency" : "Emergency";
  return flightType;
}

function buildNewFlightMessage(f, primaryDiscordUserId, secondaryDiscordUserId) {
  const primaryMention = mentionFor(f.primaryHost, primaryDiscordUserId);
  const secondaryMention = f.secondaryHost ? mentionFor(f.secondaryHost, secondaryDiscordUserId) : null;

  const hostedByLine = secondaryMention ? `${primaryMention} and ${secondaryMention}` : primaryMention;
  const signatureHosts = secondaryMention ? `${primaryMention} & ${secondaryMention}` : primaryMention;
  const dispatcherLabel = secondaryMention ? "Flight Dispatchers" : "Flight Dispatcher";
  const typeLabel = staffFlightTypeLabel(f.flightType, f.isEmergency);
  const aircraftLine = `${f.aircraft} (${AIRCRAFT_TYPES[f.aircraft] || f.aircraftType})`;

  return [
    `# 🌿 | New Flight`,
    `-# *"Making our skies greener."*`,
    `-# @everyone`,
    ``,
    `Greetings staff,`,
    `A ${typeLabel} flight will be hosted by ${hostedByLine} at ${f.checkInOpen}, flown on a ${aircraftLine}. If you would like to claim a role, please send a message with the role you would like, ex: "Captain," to ${f.primaryHost}`,
    `***Signed,***`,
    `***${signatureHosts}, ${dispatcherLabel}***`
  ].join("\n");
}

async function postNewFlightMessage(f, primaryDiscordUserId, secondaryDiscordUserId) {
  if (!NEW_FLIGHT_WEBHOOK_URL || NEW_FLIGHT_WEBHOOK_URL.startsWith("REPLACE_")) {
    throw new Error("New Flight webhook URL isn't configured yet (js/discord-config.js).");
  }
  const res = await fetch(NEW_FLIGHT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: buildNewFlightMessage(f, primaryDiscordUserId, secondaryDiscordUserId)
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
    const flightType = hostFlightTypeSelect.value;
    const isEmergency = document.getElementById("host-emergency").value === "yes";
    const checkInOpenRaw = document.getElementById("host-checkin-open").value.trim();
    const departureAirport = hostDepartureSelect.value;
    const arrivalAirport = hostArrivalSelect.value;
    const aircraft = hostAircraftSelect.value;
    const accessCode = document.getElementById("host-access-code").value;

    // ---- Client-side validation (fast feedback; Firestore rules are the
    // real authority and will reject anything that slips past this) ----

    if (!flightDateStr || !primaryHost || !flightType ||
        !document.getElementById("host-emergency").value || !checkInOpenRaw ||
        !departureAirport || !arrivalAirport || !aircraft || !accessCode) {
      hostErrorText.textContent = "Please fill out every field before submitting.";
      return;
    }

    if (departureAirport === arrivalAirport) {
      hostErrorText.textContent = "Departure and arrival airports can't be the same.";
      return;
    }

    if (isDepartureFlightTypeBlocked(departureAirport, flightType)) {
      hostErrorText.textContent = "Private flights can't depart from Sindal (EKSN only operates the ATR42-600).";
      return;
    }

    // Re-check aircraft eligibility server-side-equivalent, in case the
    // dropdown got out of sync (e.g. flight type changed after picking).
    const validAircraft = eligibleAircraftNames(departureAirport, flightType);
    if (!validAircraft.includes(aircraft)) {
      hostErrorText.textContent = `That aircraft isn't valid for this departure/flight type. Valid options: ${validAircraft.join(", ")}.`;
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
      // The 2-day delay is measured from check-in opening time, not from
      // submission time — details go out 2 days BEFORE check-in opens,
      // for every flight, regardless of when it was submitted.
      const detailsSendAt = new Date((parsedCheckIn.unix - DETAILS_DELAY_DAYS * 24 * 60 * 60) * 1000);

      const flightData = {
        flightNumber,
        flightDate: firebase.firestore.Timestamp.fromDate(flightDate),
        primaryHost,
        secondaryHost: secondaryHost || null,
        flightType,
        isEmergency,
        aircraft,
        aircraftType: AIRCRAFT_TYPES[aircraft] || null,
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
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        // The scheduled GitHub Action (see scripts/send-flight-details.js)
        // watches for detailsSendAt <= now && detailsMessageSent == false.
        detailsSendAt: firebase.firestore.Timestamp.fromDate(detailsSendAt),
        detailsMessageSent: false
      };

      // The Firestore security rules are what actually decide whether this
      // is "approved" — they check canHost, that required fields are
      // present, the 7-day lead time, and that accessCode matches the
      // primary host's code on file. If any of that fails, this write is
      // rejected and nothing gets posted to Discord.
      try {
        await db.collection("flights").doc(flightNumber).set(flightData);
      } catch (writeErr) {
        console.error("Failed while saving the flight (writing to /flights) — check canHost, required fields, the 7-day lead time, and the access code:", writeErr);
        throw writeErr;
      }

      const primaryDiscordUserId = await findDiscordUserId(primaryHost);
      const secondaryDiscordUserId = secondaryHost ? await findDiscordUserId(secondaryHost) : null;

      let webhookWarning = "";
      try {
        await postNewFlightMessage(flightData, primaryDiscordUserId, secondaryDiscordUserId);
      } catch (webhookErr) {
        console.error("New Flight webhook post failed:", webhookErr);
        webhookWarning = `<p>⚠️ The flight was approved and saved, but the "New Flight" announcement couldn't be sent automatically. Check js/discord-config.js and post it manually if needed.</p>`;
      }

      showResult("success", `
        <h3>Flight approved</h3>
        <div class="flight-number">#${flightNumber}</div>
        <p>${departureAirport} → ${arrivalAirport}${routeCode ? ` · Route ${routeCode}` : ""}</p>
        <p>${staffFlightTypeLabel(flightType, isEmergency)} · ${aircraft} (${AIRCRAFT_TYPES[aircraft]})</p>
        <p>The flight-details announcement will go out automatically ${DETAILS_DELAY_DAYS} days before check-in opens.</p>
        ${webhookWarning}
      `);
      hostForm.reset();
      hostArrivalSelect.innerHTML = '<option value="" disabled selected>Select departure first</option>';
      refreshAircraftOptions();

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

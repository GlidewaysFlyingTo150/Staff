// ---------------------------------------------------------------------------
// Glideways Staff Portal — scheduled flight-details sender
//
// Run by the GitHub Action in .github/workflows/send-flight-details.yml on
// a timer (not by the browser — browsers can't reliably wait 2 days). Uses
// the Firebase Admin SDK, which authenticates with a service account and
// bypasses Firestore security rules entirely — that's expected and fine,
// since this only ever runs in your own GitHub Actions environment, not in
// anyone's browser.
//
// This now lives in the SAME repo as the staff portal site, which is fine
// because that repo is PRIVATE — hosting moved from GitHub Pages (which
// requires a public repo on the free plan) to Netlify, which can deploy a
// static site from a private repo. Actions logs on a private repo are
// only visible to people with access to the repo, not the public.
//
// What it does, each run:
//   1. Find flights where detailsSendAt <= now and detailsMessageSent is
//      still false.
//   2. For each one, look up the host(s)' Discord IDs, build the detailed
//      flight-info message, and POST it to the flight-details webhook.
//   3. Mark that flight's detailsMessageSent as true so it's never sent
//      twice.
//
// This is a PUBLIC-facing message: unlike the "New Flight" staff message,
// it only ever mentions the flight type when it's Private — "Normal" and
// "Emergency" are staff-only info and never appear here.
//
// Setup:
//   - FLIGHT_DETAILS_WEBHOOK_URL is hardcoded below (safe here since the
//     repo is private — see the note by that constant).
//   - FIREBASE_SERVICE_ACCOUNT stays a GitHub secret regardless of repo
//     visibility (full JSON content of a Firebase service account key,
//     as a single-line string) — it's a much more sensitive credential
//     than a webhook, so it stays extra-compartmentalized.
// ---------------------------------------------------------------------------

const admin = require("firebase-admin");

const HUB_LINK = "https://www.roblox.com/share?code=723d546eee6bd14eab475c55febc3753&type=ExperienceDetails&stamp=1786233553972";

// ---------------------------------------------------------------------------
// Flight-details webhook — hardcoded directly, since this script now lives
// in a PRIVATE repo. Only safe because of that; if this repo is ever made
// public again, move this back to a secret (see git history for that
// version) before doing so.
//
// The Firebase service account, below, stays as an env var / GitHub secret
// regardless of repo visibility — it grants full database access, not
// just posting to one channel, so it stays extra-compartmentalized.
// ---------------------------------------------------------------------------
const FLIGHT_DETAILS_WEBHOOK_URL = "https://discord.com/api/webhooks/1546113202570666114/fg1HSzjMeOy1OXzyX598JmAohhal_Lv1-AmuoxC8onqEP0tqviFjzp-d0css293mfHOz";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const serviceAccountJson = requireEnv("FIREBASE_SERVICE_ACCOUNT");
const webhookUrl = FLIGHT_DETAILS_WEBHOOK_URL;

if (!webhookUrl || webhookUrl.startsWith("REPLACE_")) {
  console.error("Set FLIGHT_DETAILS_WEBHOOK_URL near the top of this file.");
  process.exit(1);
}

try {
  // eslint-disable-next-line no-new
  new URL(webhookUrl);
} catch {
  console.error("FLIGHT_DETAILS_WEBHOOK_URL doesn't look like a valid URL — check for typos.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(serviceAccountJson))
});
const db = admin.firestore();

// A real ping if we have their Discord ID, otherwise a plain "@name" (just
// text — it won't actually notify them, only <@id> does that).
function mentionFor(name, discordUserId) {
  return discordUserId ? `<@${discordUserId}>` : `@${name}`;
}

async function findDiscordUserId(username) {
  if (!username) return null;
  const snapshot = await db.collection("staff")
    .where("username", "==", username)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data().discordUserId || null;
}

function buildDetailsMessage(f, primaryDiscordUserId, secondaryDiscordUserId) {
  const primaryMention = mentionFor(f.primaryHost, primaryDiscordUserId);
  const secondaryMention = f.secondaryHost ? mentionFor(f.secondaryHost, secondaryDiscordUserId) : null;
  const hostLine = secondaryMention ? `${primaryMention} and ${secondaryMention}` : primaryMention;

  // Public-facing: only ever shows "Private" — never "Normal" or
  // "Emergency", those are staff-only.
  const privateTag = f.flightType === "Private" ? `\n-# Private Flight` : ``;
  const aircraftLine = f.aircraft ? `${f.aircraft} (${f.aircraftType || ""})`.trim() : null;

  const lines = [];
  if (primaryDiscordUserId) {
    lines.push(`<@${primaryDiscordUserId}>`, ``);
  }
 lines.push(
    `**🌿| Glideways ${f.privateTag} Flight ${f.flightNumber} ${f.departureAirport} -> ${f.arrivalAirport}**`,
    `-# *"Making our skies greener"*`,
    `-# @everyone`,
    ``,
    `Flight ${f.flightNumber} will be departing from ${f.departureAirport} and arriving at ${f.arrivalAirport}. The flight is hosted by ${hostLine}. We can't wait to see you there!`,
    ``,
    `**Flight Information**`,
    ...(aircraftLine ? [`*Aircraft:* ***${aircraftLine}***`] : []),
    `*Check-in Open:* ***${f.checkInOpen}***`,
    `*Check In Close:* ***${f.checkInClose}***`,
    `*Boarding Opens:* ***${f.boardingOpen}***`,
    `*Boarding Closes/Pushback:* ***${f.boardingClose}***`,
    `*Estimated Arrival Time:* ***${f.arrivalTime}***`,
    ``,
    `***We recommend you join via our [Hub](${HUB_LINK}) 10 minutes prior to check-in.***`
  );
  return lines.join("\n");
}

async function postToDiscord(content) {
  let res;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  } catch (networkErr) {
    // Deliberately NOT rethrowing networkErr as-is: some runtime fetch
    // failures embed the request URL in their own error message. If the
    // secret was ever cleaned/trimmed to a form that differs even
    // slightly from the exact value GitHub has on file, GitHub's log
    // masking (which matches the literal registered string) can fail to
    // redact that embedded copy — printing the real webhook URL in plain
    // text in the log. Always throw a message that can't contain it.
    throw new Error("Network error while posting to the flight-details webhook — check FLIGHT_DETAILS_WEBHOOK_URL.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord webhook returned ${res.status}: ${body}`);
  }
}

async function main() {
  const now = admin.firestore.Timestamp.now();

  const snapshot = await db.collection("flights")
    .where("detailsMessageSent", "==", false)
    .where("detailsSendAt", "<=", now)
    .get();

  if (snapshot.empty) {
    console.log("No flights due for their details announcement right now.");
    return;
  }

  console.log(`${snapshot.size} flight(s) due — sending...`);

  for (const doc of snapshot.docs) {
    const flight = doc.data();
    try {
      const [primaryDiscordUserId, secondaryDiscordUserId] = await Promise.all([
        findDiscordUserId(flight.primaryHost),
        flight.secondaryHost ? findDiscordUserId(flight.secondaryHost) : Promise.resolve(null)
      ]);

      const content = buildDetailsMessage(flight, primaryDiscordUserId, secondaryDiscordUserId);
      await postToDiscord(content);

      await doc.ref.update({
        detailsMessageSent: true,
        detailsSentAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Sent details for flight #${flight.flightNumber}.`);
    } catch (err) {
      // One bad flight shouldn't block the rest — log and move on. It'll
      // be retried on the next scheduled run since detailsMessageSent is
      // still false.
      console.error(`Failed to send details for flight #${flight.flightNumber}:`, err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

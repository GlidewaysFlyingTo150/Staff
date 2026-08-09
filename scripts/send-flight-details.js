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
// Required environment variables (set as GitHub secrets — see README):
//   FIREBASE_SERVICE_ACCOUNT      full JSON content of a Firebase service
//                                   account key, as a single-line string
//   FLIGHT_DETAILS_WEBHOOK_URL     the Discord webhook for this message
// ---------------------------------------------------------------------------

const admin = require("firebase-admin");

const HUB_LINK = "https://www.roblox.com/share?code=723d546eee6bd14eab475c55febc3753&type=ExperienceDetails&stamp=1786233553972";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// Cleans up common copy/paste mistakes: surrounding quotes, and leading/
// trailing whitespace or line breaks — any of which makes new URL() throw
// "Invalid URL" even though the secret "looks" set.
function cleanWebhookUrl(raw) {
  let cleaned = raw.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

const serviceAccountJson = requireEnv("FIREBASE_SERVICE_ACCOUNT");
const webhookUrl = cleanWebhookUrl(requireEnv("FLIGHT_DETAILS_WEBHOOK_URL"));

try {
  // eslint-disable-next-line no-new
  new URL(webhookUrl);
} catch {
  console.error(
    "FLIGHT_DETAILS_WEBHOOK_URL doesn't look like a valid URL even after " +
    "cleanup. Check the GitHub secret for stray characters, and make sure " +
    "it's the full URL starting with https://discord.com/api/webhooks/..."
  );
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
  lines.push(
    `**🌿| Glideways ${privateTag} Flight ${f.flightNumber} ${f.departureAirport} -> ${f.arrivalAirport}**`,
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
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
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

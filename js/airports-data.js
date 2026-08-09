// ---------------------------------------------------------------------------
// Glideways Staff Portal — airports, routes, and aircraft
// ---------------------------------------------------------------------------

// Every airport served, in the fixed order used throughout the portal.
const GLIDEWAYS_AIRPORTS = [
  "EDDL", "EGPH", "EKSN", "KCOD", "KLGB", "LFPG", "LTBS", "TNCM", "WSSS"
];

// Route/flight-code lookup: GWY_ROUTES[departure][arrival] = route code.
// Computed and stored on every flight submission for reference, even
// though it's not currently in either Discord message.
const GWY_ROUTES = {
  EDDL: { EGPH: "GWY101", EKSN: "GWY102", KCOD: "GWY103", KLGB: "GWY104", LFPG: "GWY105", LTBS: "GWY106", TNCM: "GWY107", WSSS: "GWY108" },
  EGPH: { EDDL: "GWY201", EKSN: "GWY202", KCOD: "GWY203", KLGB: "GWY204", LFPG: "GWY205", LTBS: "GWY206", TNCM: "GWY207", WSSS: "GWY208" },
  EKSN: { EDDL: "GWY301", EGPH: "GWY302", KCOD: "GWY303", KLGB: "GWY304", LFPG: "GWY305", LTBS: "GWY306", TNCM: "GWY307", WSSS: "GWY308" },
  KCOD: { EDDL: "GWY401", EGPH: "GWY402", EKSN: "GWY403", KLGB: "GWY404", LFPG: "GWY405", LTBS: "GWY406", TNCM: "GWY407", WSSS: "GWY408" },
  KLGB: { EDDL: "GWY501", EGPH: "GWY502", EKSN: "GWY503", KCOD: "GWY504", LFPG: "GWY505", LTBS: "GWY506", TNCM: "GWY507", WSSS: "GWY508" },
  LFPG: { EDDL: "GWY601", EGPH: "GWY602", EKSN: "GWY603", KCOD: "GWY604", KLGB: "GWY605", LTBS: "GWY606", TNCM: "GWY607", WSSS: "GWY608" },
  LTBS: { EDDL: "GWY701", EGPH: "GWY702", EKSN: "GWY703", KCOD: "GWY704", KLGB: "GWY705", LFPG: "GWY706", TNCM: "GWY707", WSSS: "GWY708" },
  TNCM: { EDDL: "GWY801", EGPH: "GWY802", EKSN: "GWY803", KCOD: "GWY804", KLGB: "GWY805", LFPG: "GWY806", LTBS: "GWY807", WSSS: "GWY808" },
  WSSS: { EDDL: "GWY901", EGPH: "GWY902", EKSN: "GWY903", KCOD: "GWY904", KLGB: "GWY905", LFPG: "GWY906", LTBS: "GWY907", TNCM: "GWY908" }
};

// ---------------------------------------------------------------------------
// Aircraft: named airframe -> type. Staff pick a name (e.g. "Tundra"); the
// type is looked up from this map.
// ---------------------------------------------------------------------------
const AIRCRAFT_TYPES = {
  "Tundra": "A321-NEO",
  "Executive": "A321-NEO",
  "Malava": "A220-100",
  "Aurora": "A220-100",
  "Rora": "A220-100",
  "Enzo": "A350-900",
  "Spring": "ATR42-600"
};

// ---------------------------------------------------------------------------
// Aircraft eligibility rules:
//   - Sindal (EKSN) only operates the ATR42-600 ("Spring") — and this
//     overrides everything else: private flights simply cannot be hosted
//     from Sindal at all, since private requires the A321-NEO.
//   - Private flights can only use the A321-NEO "Executive" specifically
//     (not "Tundra").
// ---------------------------------------------------------------------------
function eligibleAircraftNames(departureAirport, flightType) {
  if (departureAirport === "EKSN") return ["Spring"]; // Sindal: ATR42-600 only
  if (flightType === "Private") return ["Executive"]; // Private: A321-NEO "Executive" only
  return Object.keys(AIRCRAFT_TYPES);
}

// True if this departure/flight-type combination is simply not allowed
// (rather than just narrowing the aircraft choices) — right now that's
// only private flights departing Sindal.
function isDepartureFlightTypeBlocked(departureAirport, flightType) {
  return departureAirport === "EKSN" && flightType === "Private";
}

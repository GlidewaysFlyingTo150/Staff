// ---------------------------------------------------------------------------
// Glideways Staff Portal — airports, routes, and aircraft
// ---------------------------------------------------------------------------

// Every airport served, in the fixed order used throughout the portal.
// Display names — NOTE: "Sindal" here must exactly match the string used
// in eligibleAircraftNames() and isDepartureFlightTypeBlocked() below, and
// in host-flight.js's updatePrivateOptionAvailability(). If you rename an
// airport again later, all three spots need to change together, or the
// Sindal-specific rules will silently stop applying.
const GLIDEWAYS_AIRPORTS = [
  "Düsseldorf", "Edinburgh", "Sindal", "Yellowstone", "Long Beach", "Charles de Gaulle", "Dalaman", "Princess Juliana", "Changi"
];

// Route/flight-code lookup: GWY_ROUTES[departure][arrival] = route code.
// Computed and stored on every flight submission for reference, even
// though it's not currently in either Discord message.
const GWY_ROUTES = {
  "Düsseldorf": { "Edinburgh": "GWY101", "Sindal": "GWY102", "Yellowstone": "GWY103", "Long Beach": "GWY104", "Charles de Gaulle": "GWY105", "Dalaman": "GWY106", "Princess Juliana": "GWY107", "Changi": "GWY108" },
  "Edinburgh": { "Düsseldorf": "GWY201", "Sindal": "GWY202", "Yellowstone": "GWY203", "Long Beach": "GWY204", "Charles de Gaulle": "GWY205", "Dalaman": "GWY206", "Princess Juliana": "GWY207", "Changi": "GWY208" },
  "Sindal": { "Düsseldorf": "GWY301", "Edinburgh": "GWY302", "Yellowstone": "GWY303", "Long Beach": "GWY304", "Charles de Gaulle": "GWY305", "Dalaman": "GWY306", "Princess Juliana": "GWY307", "Changi": "GWY308" },
  "Yellowstone": { "Düsseldorf": "GWY401", "Edinburgh": "GWY402", "Sindal": "GWY403", "Long Beach": "GWY404", "Charles de Gaulle": "GWY405", "Dalaman": "GWY406", "Princess Juliana": "GWY407", "Changi": "GWY408" },
  "Long Beach": { "Düsseldorf": "GWY501", "Edinburgh": "GWY502", "Sindal": "GWY503", "Yellowstone": "GWY504", "Charles de Gaulle": "GWY505", "Dalaman": "GWY506", "Princess Juliana": "GWY507", "Changi": "GWY508" },
  "Charles de Gaulle": { "Düsseldorf": "GWY601", "Edinburgh": "GWY602", "Sindal": "GWY603", "Yellowstone": "GWY604", "Long Beach": "GWY605", "Dalaman": "GWY606", "Princess Juliana": "GWY607", "Changi": "GWY608" },
  "Dalaman": { "Düsseldorf": "GWY701", "Edinburgh": "GWY702", "Sindal": "GWY703", "Yellowstone": "GWY704", "Long Beach": "GWY705", "Charles de Gaulle": "GWY706", "Princess Juliana": "GWY707", "Changi": "GWY708" },
  "Princess Juliana": { "Düsseldorf": "GWY801", "Edinburgh": "GWY802", "Sindal": "GWY803", "Yellowstone": "GWY804", "Long Beach": "GWY805", "Charles de Gaulle": "GWY806", "Dalaman": "GWY807", "Changi": "GWY808" },
  "Changi": { "Düsseldorf": "GWY901", "Edinburgh": "GWY902", "Sindal": "GWY903", "Yellowstone": "GWY904", "Long Beach": "GWY905", "Charles de Gaulle": "GWY906", "Dalaman": "GWY907", "Princess Juliana": "GWY908" }
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
//   - Sindal only operates the ATR42-600 ("Spring") — and this overrides
//     everything else: private flights simply cannot be hosted from
//     Sindal at all, since private requires the A321-NEO.
//   - Private flights can only use the A321-NEO "Executive" specifically
//     (not "Tundra").
// ---------------------------------------------------------------------------
function eligibleAircraftNames(departureAirport, flightType) {
  if (departureAirport === "Sindal") return ["Spring"]; // Sindal: ATR42-600 only
  if (flightType === "Private") return ["Executive"]; // Private: A321-NEO "Executive" only
  return Object.keys(AIRCRAFT_TYPES);
}

// True if this departure/flight-type combination is simply not allowed
// (rather than just narrowing the aircraft choices) — right now that's
// only private flights departing Sindal.
function isDepartureFlightTypeBlocked(departureAirport, flightType) {
  return departureAirport === "Sindal" && flightType === "Private";
}

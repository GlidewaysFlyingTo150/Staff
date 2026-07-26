// ---------------------------------------------------------------------------
// Glideways Staff Portal — airports, routes, and languages
// ---------------------------------------------------------------------------

// Every airport served, in the fixed order used throughout the portal.
const GLIDEWAYS_AIRPORTS = [
  "EDDL", "EGPH", "EKSN", "KCOD", "KLGB", "LFPG", "LTBS", "TNCM", "WSSS"
];

// Route/flight-code lookup: GWY_ROUTES[departure][arrival] = route code.
// This mirrors the fixed table you provided (prefix digit per origin,
// suffix per destination in alphabetical order, origin skipped). It's not
// currently inserted into the Discord message (see note in the chat reply),
// but it's computed and stored on every flight submission in case you want
// to surface it later — e.g. as a "Route" line in the embed.
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

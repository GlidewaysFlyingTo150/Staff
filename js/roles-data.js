// ---------------------------------------------------------------------------
// Glideways Staff Portal — roles
//
// PLACEHOLDER DATA — replace with your real roles per department.
//
// `level` sets the hierarchy for "show their highest role" (higher number
// = higher rank) — this needs to be consistent across ALL departments if
// someone could hold roles in more than one (so the comparison is
// meaningful), not just within one department.
//
// `canViewLOA` is what this message is about: any staff member holding a
// role with canViewLOA: true can see and act on LOA requests — no more
// setting a flag per person.
//
// Each staff member's Firestore doc gets a `roles` array of role NAMES
// they hold, e.g. roles: ["HR Associate", "Ops Trainee"] — matched
// against the `name` keys below.
// ---------------------------------------------------------------------------

const GLIDEWAYS_ROLES = {
  "Human Resources": [
    { name: "HR Trainee", level: 1, canViewLOA: false },
    { name: "Vice President", level: 2, canViewLOA: false },
    { name: "Managing Director", level: 3, canViewLOA: true }
  ],
  "Public Relations": [
    { name: "PR Trainee", level: 1, canViewLOA: false },
     { name: "Vice President", level: 2, canViewLOA: false },
    { name: "Managing Director", level: 3, canViewLOA: true }
  ],
  "Networking": [
    { name: "Networking Trainee", level: 1, canViewLOA: false },
    { name: "Vice President", level: 2, canViewLOA: false },
    { name: "Managing Director", level: 3, canViewLOA: true }
  ],
  "Operations": [
    { name: "Operations Trainee", level: 1, canViewLOA: false },
    { name: "Vice President", level: 2, canViewLOA: false },
    { name: "Managing Director", level: 3, canViewLOA: true }
  ],
  "Technical Operations": [
    { name: "TechOps Trainee", level: 1, canViewLOA: false },
    { name: "Vice President", level: 2, canViewLOA: false },
    { name: "Managing Director", level: 3, canViewLOA: true }
  ],
   "Corportate": [
    { name: "Executive Vice President", level: 1, canViewLOA: false },
    { name: "Executive Vice President", level: 2, canViewLOA: false },
    { name: "President", level: 3, canViewLOA: true },
    { name: "Supervisor", level: 4, canViewLOA: true }
  ]
};

// Flattened lookup: role name -> its full info, regardless of department.
const ROLE_LOOKUP = Object.values(GLIDEWAYS_ROLES).flat().reduce((acc, role) => {
  acc[role.name] = role;
  return acc;
}, {});

function roleCanViewLOA(roleNames) {
  return (roleNames || []).some((name) => ROLE_LOOKUP[name] && ROLE_LOOKUP[name].canViewLOA === true);
}

// Highest-ranked role a staff member holds, by `level` — for the sidebar
// badge (not wired up yet, waiting on the real role list to finish this).
function highestRole(roleNames) {
  const held = (roleNames || []).map((name) => ROLE_LOOKUP[name]).filter(Boolean);
  if (held.length === 0) return null;
  return held.reduce((highest, r) => (r.level > highest.level ? r : highest), held[0]);
}

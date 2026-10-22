// Release-managed FY27 cash entries. Return only after the dashboard's access check;
// do not import this module into client code or publish its values in static assets.
export const UNRESTRICTED_GOAL_CONFIG = Object.freeze({
  label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30", cents: 650000000,
  fixedContributions: Object.freeze([
    Object.freeze({ key: "parmelee", label: "Parmelee Estate", cents: 230000000 }),
    Object.freeze({ key: "lovett", label: "Lovett Trust", cents: 23000000 }),
    Object.freeze({ key: "line", label: "LINE Funding", cents: 50000000 }),
  ]),
});

import { FIELD_BY_KEY } from "./importFieldDefinitions";
import { customFieldWrite } from "./importCustomFields";

export const IMPORT_PRACTICE_SCENARIOS = [
  { id: "new", label: "New people with contacts", description: "Check contact choices and hold a possible duplicate before creating anyone." },
  { id: "updates", label: "Update existing contacts", description: "Keep identities fixed, skip an existing value, and verify an uncertain result instead of sending again." },
  { id: "custom", label: "Add custom fields", description: "Add one category, skip an exact duplicate, and hold a conflicting value without overwriting." },
];

const category = { name: "Practice Interest", dataType: "Text" };
const names = ["Avery Example", "Jordan Sample", "Morgan Fictional"];
const contactKeys = ["firstName", "lastName", "email", "emailType", "emailMakePrimary"];
const customKeys = ["blackbaudConstituentId", "firstName", "lastName", "customFieldValue", "customFieldDate", "customFieldComment"];

// These fixtures never use numeric NXT IDs and cannot accept a user's upload.
export function importPracticeFixture(scenarioId) {
  if (!IMPORT_PRACTICE_SCENARIOS.some(({ id }) => id === scenarioId)) return null;
  const keys = scenarioId === "custom" ? customKeys : scenarioId === "new" ? contactKeys : ["blackbaudConstituentId", ...contactKeys];
  const fields = keys.map((key) => FIELD_BY_KEY[key]);
  const mappings = Object.fromEntries(fields.map(({ key, header }) => [key, header]));
  const rows = names.map((name, i) => {
    const values = { blackbaudConstituentId: `PRACTICE-${i + 1}`, firstName: name.split(" ")[0], lastName: name.split(" ")[1],
      email: `${name.split(" ")[0].toLowerCase()}@example.test`, emailType: "Personal", emailMakePrimary: "Yes",
      customFieldValue: "Campus events", customFieldDate: "2026-11-01", customFieldComment: "Fictional training example" };
    return Object.fromEntries(keys.map((key) => [mappings[key], values[key]]));
  });
  return { fields, mappings, rows, headers: fields.map(({ header }) => header), category };
}

export function newImportPractice(scenarioId = "new") {
  const fixture = importPracticeFixture(scenarioId);
  if (!fixture) throw new Error("Choose a supported practice example.");
  return { scenarioId, stage: "setup", mappings: { ...fixture.mappings }, includeContacts: null, confirmed: false, rows: [] };
}

export function importPracticeBlockers(state) {
  const fixture = importPracticeFixture(state.scenarioId);
  if (!fixture) return ["Choose a supported practice example."];
  const errors = fixture.fields.filter(({ key }) => state.mappings[key] !== fixture.mappings[key])
    .map(({ label, key }) => `For this example, map ${label} to ${fixture.mappings[key]}.`);
  if (state.scenarioId !== "custom" && typeof state.includeContacts !== "boolean") errors.push("Choose whether to include the sample email addresses.");
  return errors;
}

function practiceRows(state) {
  return names.map((name, i) => {
    const row = { id: `practice-row-${i + 1}`, name, targetId: state.scenarioId === "new" ? null : `PRACTICE-${i + 1}`, state: "ready", selected: false, fields: [] };
    if (state.scenarioId === "custom") {
      const input = { category: category.name, value: "Campus events", date: "2026-11-01", comment: "Fictional training example" };
      const existing = i === 0 ? [] : [{ category: category.name, value: i === 1 ? input.value : "Scholarships", date: input.date, comment: input.comment }];
      const write = customFieldWrite(input, category, [], existing);
      return { ...row, state: write.requiresReview ? "held" : write.action === "skip_existing" ? "unchanged" : "ready",
        message: write.requiresReview ? "A different value already exists in this sample category. It will not be overwritten. In a real import, resolve it in NXT or skip this row."
          : write.action === "skip_existing" ? "The sample already has this exact category, value, date, and comment. No addition is needed."
          : "Add the sample custom field to the existing fictional person.",
        fields: [`${category.name}: ${input.value}`, `Date: ${input.date}`, `Comment: ${input.comment}`] };
    }
    const fields = state.includeContacts ? [`Email: ${name.split(" ")[0].toLowerCase()}@example.test`, "Type: Personal", "Make primary: Yes"] : ["Email excluded; contact details stay unchanged."];
    if (state.scenarioId === "new") return { ...row, fields: ["Create fictional identity", ...fields], state: i === 1 ? "held" : "ready",
      message: i === 1 ? "A possible duplicate was found in the sample. Compare the identities before creating anyone. This example stays held."
        : "The simulated duplicate check found no match. Creation still needs your approval." };
    return { ...row, fields, state: !state.includeContacts || i === 1 ? "unchanged" : "ready", uncertainExample: i === 2,
      message: !state.includeContacts ? "No contact update requested. This example changes nothing."
        : i === 1 ? "The exact email, type, and primary setting already exist in the sample. No addition is needed."
        : "Add the email to the exact fictional system ID. Do not create a new person." };
  });
}

export function importPracticeReducer(state, action) {
  if (action.type === "restart") return newImportPractice(state.scenarioId);
  if (action.type === "scenario") return importPracticeFixture(action.id) ? newImportPractice(action.id) : state;
  if (action.type === "back" && state.stage === "review") return { ...state, stage: "setup", rows: [], confirmed: false };
  if (state.stage === "setup") {
    if (action.type === "mapping" && Object.hasOwn(state.mappings, action.key)) return { ...state, mappings: { ...state.mappings, [action.key]: action.value }, confirmed: false };
    if (action.type === "contacts" && typeof action.value === "boolean") return { ...state, includeContacts: action.value, confirmed: false };
    if (action.type === "review" && !importPracticeBlockers(state).length) return { ...state, stage: "review", rows: practiceRows(state), confirmed: false };
  }
  if (state.stage === "review") {
    if (action.type === "finish-unchanged" && state.rows.length > 0 && state.rows.every((row) => row.state === "unchanged")) return { ...state, stage: "results", confirmed: false };
    if (action.type === "select") return { ...state, confirmed: false, rows: state.rows.map((row) => row.id === action.id && row.state === "ready" ? { ...row, selected: !row.selected } : row) };
    if (action.type === "select-ready") return { ...state, confirmed: false, rows: state.rows.map((row) => ({ ...row, selected: row.state === "ready" })) };
    if (action.type === "confirm") return { ...state, confirmed: action.value === true };
    if (action.type === "simulate" && state.confirmed && state.rows.some((row) => row.selected && row.state === "ready")) return { ...state, stage: "results", confirmed: false,
      rows: state.rows.map((row) => !row.selected || row.state !== "ready" ? row : { ...row, selected: false, state: row.uncertainExample ? "uncertain" : "complete",
        message: row.uncertainExample ? "In this fictional example, the save response was lost. That does not mean it failed. Verify the saved value instead of sending again."
          : "Simulated checks confirm every requested field. No real record was created or updated." }) };
  }
  if (action.type === "verify" && state.stage === "results") return { ...state, rows: state.rows.map((row) => row.id === action.id && row.state === "uncertain"
    ? { ...row, state: "complete", message: "Simulated read-only verification found the exact saved email, type, and primary setting. No second send was needed. In real imports, missing or conflicting evidence stays held." } : row) };
  return state;
}

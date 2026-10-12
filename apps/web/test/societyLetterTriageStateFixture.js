import { triageRow } from "./societyLetterTriageFixture";
import { societyQuerySettings } from "./societyQueryFixture";
import { templateFixture } from "./societyLetterFixture";
import { validateLetterTemplate } from "../src/app/api/utils/societyLetterDocuments";
import { getDefaultGivingSocietyConfigurations } from "../src/app/api/utils/givingSocietyDefinitions";
import {
  letterSourceSignature,
  letterWorkspace,
} from "../src/app/api/utils/societyLetterWorkflow";

export const triageToday = "2026-10-12";
export const triageDefinitions = getDefaultGivingSocietyConfigurations();
export function triageState(count = 2) {
  const template = {
    ...validateLetterTemplate(templateFixture()),
    societyKey: "presidents_society",
    sequence: 1,
  };
  const state = {
    revision: 1,
    settings: societyQuerySettings(),
    templates: { [template.version]: template },
    history: [],
    exclusions: [],
    readiness: {},
  };
  const rows = Array.from({ length: count }, (_, index) => {
    const { status, recipientReview, documentReadiness, ...source } = triageRow(
      String(10 + index),
    );
    return source;
  });
  state.snapshot = {
    signature: letterSourceSignature(state, triageDefinitions),
    generatedAt: new Date().toISOString(),
    period: rows[0].period,
    rows,
  };
  return state;
}
export function triageRequest(state) {
  return {
    action: "confirm_recipient_suggestions",
    confirm: true,
    revision: state.revision,
    suggestionsRevision: state.revision,
    recipients: letterWorkspace(state, triageDefinitions, triageToday).rows.map(
      (row) => ({
        householdId: row.householdId,
        reviewToken: row.recipientReview.token,
      }),
    ),
  };
}

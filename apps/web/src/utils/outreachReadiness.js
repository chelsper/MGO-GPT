import { projectIdentity, projectProspectRows } from "./projectProspecting";
import { validActionDate } from "./actionEntryOptions";

function phoneCoverage(people, headers, settings = {}) {
  const mapped = (key) => !!settings[key] && headers.filter(h => h === settings[key]).length === 1;
  const primaryMapped = mapped("phoneColumn"), alternateMapped = mapped("alternatePhoneColumn");
  let withPrimary = 0, withAlternateOnly = 0;
  for (const person of people) {
    const primary = primaryMapped && person.values[headers.indexOf(settings.phoneColumn)]?.length > 0;
    const alternate = alternateMapped && person.values[headers.indexOf(settings.alternatePhoneColumn)]?.length > 0;
    if (primary) withPrimary++;
    else if (alternate) withAlternateOnly++;
  }
  const withPhone = withPrimary + withAlternateOnly;
  return { total: people.length, withPrimary, withAlternateOnly, withPhone,
    missingPhone: people.length - withPhone, primaryMapped, alternateMapped };
}

export function outreachPhoneCoverage(report, snapshot, settings) {
  if (!snapshot?.generatedAt) return null;
  const identity = projectIdentity(snapshot, report.dataConfiguration);
  if (identity.error) return null;
  return phoneCoverage(projectProspectRows(snapshot, identity).filter(p => p.id), snapshot.headers, settings || {});
}

export function outreachSetupChecks(report, snapshot, saved) {
  const settings = saved.settings || {};
  const headers = snapshot?.headers || [];
  const mapped = (key) => !!settings[key] && headers.filter(h => h === settings[key]).length === 1;
  const identity = projectIdentity(snapshot, report.dataConfiguration);
  const people = identity.error ? [] : projectProspectRows(snapshot, identity).filter(p => p.id);
  const missing = (key) => people.filter(p => !p.values[headers.indexOf(settings[key])]?.length).length;
  const phones = phoneCoverage(people, headers, settings);
  const hasPhoneMapping = phones.primaryMapped || phones.alternateMapped;
  const hasInstructions = typeof settings.instructions === "string" && !!settings.instructions.trim();
  const checks = [
    { key: "source", label: "Saved list", state: snapshot?.generatedAt ? "ready" : "needed",
      detail: snapshot?.generatedAt ? `${identity.ids.length} distinct identified people in saved results. Opening this checklist does not refresh them.` : "No complete saved results yet. Configure the query, then refresh the list explicitly.", action: "source" },
    { key: "identity", label: "Constituent system record ID", state: identity.error ? "needed" : identity.invalidRows ? "review" : "ready",
      detail: identity.error ? "Map the constituent system record ID, not a lookup ID, gift ID or QRECID." : identity.invalidRows ? `${identity.invalidRows} ${identity.invalidRows === 1 ? "row has" : "rows have"} no valid system ID and cannot be assigned. Other identified people remain available.` : `Mapped to ${report.dataConfiguration.systemIdColumn}; repeated rows are grouped by that ID.`, action: "identity" },
    { key: "nameColumn", label: "Constituent names", state: !mapped("nameColumn") ? "needed" : missing("nameColumn") ? "review" : "ready",
      detail: !mapped("nameColumn") ? "Choose the name column in Outreach setup." : missing("nameColumn") ? `${missing("nameColumn")} ${missing("nameColumn") === 1 ? "person has" : "people have"} no name in this output; their system ID is shown instead.` : `Mapped to ${settings.nameColumn}.`, action: "nameColumn" },
    { key: "phoneColumn", label: "Phone numbers", state: !hasPhoneMapping || phones.missingPhone ? "review" : "ready",
      detail: !hasPhoneMapping ? "Map a phone output from the saved query, including an alternate if available. You can still record outcomes locally." : `${phones.withPhone} of ${phones.total} people have a phone in the mapped saved output${phones.withAlternateOnly ? `; ${phones.withAlternateOnly} ${phones.withAlternateOnly === 1 ? "relies" : "rely"} on the alternate phone` : ""}. ${phones.missingPhone} ${phones.missingPhone === 1 ? "person has" : "people have"} no mapped phone. Check current contact details before calling.`, action: "phoneColumn" },
    { key: "restrictionColumn", label: "Contact preferences", state: mapped("restrictionColumn") ? "ready" : "review",
      detail: mapped("restrictionColumn") ? `Mapped to ${settings.restrictionColumn}. Blank values do not mean calling is permitted; check current preferences.` : "Recommended: include and map contact restrictions. A missing column is not permission to call.", action: "restrictionColumn" },
    { key: "deadline", label: "Project deadline", state: !validActionDate(settings.deadline) ? "needed" : settings.deadline < saved.today ? "review" : "ready",
      detail: !validActionDate(settings.deadline) ? "Choose and save the project deadline." : `${settings.deadline}${settings.deadline < saved.today ? " has passed. Existing due dates and history are unchanged." : ". Existing assignment due dates are unchanged by setup edits."}`, action: "deadline" },
    { key: "instructions", label: "Caller instructions", state: hasInstructions ? "ready" : "review",
      detail: hasInstructions ? "Instructions are saved and visible to callers." : "Recommended: add the purpose, talking points and next steps. This is optional, not a saving requirement.", action: "instructions" },
  ];
  if (saved.canManage) checks.push({ key: "callers", label: "Project caller access", state: saved.callers.length ? "ready" : "needed",
    detail: saved.callers.length ? `${saved.callers.length} active project members can be assigned outreach. Only explicitly shared callers are eligible.` : "Grant project access to an active MGO, Admin or Advancement Services user before assigning.", action: "callers" });
  return checks;
}

export function outreachConnectionLabel(connection) {
  return ({ saved: "Connection saved", refresh_due: "Connection renewal due on submission", reconnect: "Reconnect before submitting", not_connected: "No saved NXT connection" })[connection] || "Connection status unavailable";
}

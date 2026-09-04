export function isPoolEntryArchived(entry) {
  return (
    String(entry?.solicitor_assignment_sync_state || "")
      .trim()
      .toLowerCase() === "success"
  );
}

export function getPoolContactState(entry, summaryState) {
  if (isPoolEntryArchived(entry)) return "Assigned to portfolio";
  if (entry.needs_contact_info) return "Contact info requested";
  if (
    ["failed", "manual_required"].includes(
      entry.solicitor_assignment_sync_state,
    )
  ) {
    return "Assignment needs attention";
  }
  if (entry.solicitor_requested) return "Assignment pending";
  const constituent = summaryState?.payload?.mapped?.constituent;
  const hasContact = [
    entry.email,
    entry.phone,
    constituent?.email,
    constituent?.phone,
  ].some(
    (value) =>
      typeof value === "string" &&
      value.trim() &&
      !["unavailable", "unknown", "n/a"].includes(value.trim().toLowerCase()),
  );
  if (hasContact) return "Contact details available";
  if (summaryState?.status === "error") return "Contact details unavailable";
  if (
    !constituent &&
    (entry.linked_blackbaud_constituent_id || entry.blackbaud_constituent_id)
  ) {
    return "Contact details not loaded";
  }
  return "No email or phone available";
}

export function filterPoolEntries(
  entries,
  { archive = false, search = "", sort = "oldest" } = {},
  summaries = {},
) {
  const query = search.trim().toLowerCase();
  return entries
    .filter((entry) => {
      if (isPoolEntryArchived(entry) !== archive) return false;
      const id =
        entry.linked_blackbaud_constituent_id || entry.blackbaud_constituent_id;
      const constituent = summaries[id]?.payload?.mapped?.constituent;
      return (
        !query ||
        [
          entry.prospect_name,
          entry.email,
          entry.phone,
          id,
          entry.assigned_user_name,
          entry.assigned_user_email,
          entry.note,
          constituent?.lookupId,
          constituent?.email,
          constituent?.phone,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query),
        )
      );
    })
    .sort((a, b) => {
      if (sort === "name")
        return (a.prospect_name || "").localeCompare(b.prospect_name || "");
      const date = (entry) =>
        Date.parse(
          (archive && entry.solicitor_assignment_synced_at) ||
            entry.assigned_at ||
            entry.created_at,
        ) || 0;
      return sort === "newest" ? date(b) - date(a) : date(a) - date(b);
    });
}

// Whitelist fields per action on both client and server. Help never writes an NXT assignment.
export function buildPoolActionBody(action, values = {}) {
  if (action === "request_help") {
    return {
      requestAction: action,
      needsContactInfo: true,
      contactInfoRequestNote: values.contactInfoRequestNote || "",
    };
  }
  if (!["assign", "save_outcome"].includes(action))
    throw new Error("Invalid prospect pool action");
  if (!String(values.mgogptDispositionValue || "").trim()) {
    throw new Error(
      action === "assign"
        ? "Choose an MGOGPT outcome before assigning yourself as solicitor."
        : "Choose an MGOGPT outcome before saving.",
    );
  }
  return {
    requestAction: action,
    ...(action === "assign" ? { solicitorRequested: true } : {}),
    mgogptDispositionValue: values.mgogptDispositionValue,
    mgogptDispositionComment: values.mgogptDispositionComment || "",
  };
}

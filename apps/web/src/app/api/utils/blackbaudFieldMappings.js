export const DEFAULT_BLACKBAUD_FIELD_MAPPINGS = [
  {
    mapping_key: "constituents.blackbaud_constituent_id",
    app_entity: "constituents",
    app_field: "blackbaud_constituent_id",
    blackbaud_object: "Constituent",
    blackbaud_field: "id",
    selection_rule: "Store exact NXT constituent ID",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "Primary link key",
  },
  {
    mapping_key: "constituents.name",
    app_entity: "constituents",
    app_field: "name",
    blackbaud_object: "Constituent",
    blackbaud_field: "display_name",
    selection_rule: "Use the constituent's primary display name",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "",
  },
  {
    mapping_key: "constituents.email",
    app_entity: "constituents",
    app_field: "email",
    blackbaud_object: "Constituent email addresses",
    blackbaud_field: "primary_email",
    selection_rule:
      "Pull only the email marked Primary = true; if none is primary, leave blank",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "",
  },
  {
    mapping_key: "constituents.phone",
    app_entity: "constituents",
    app_field: "phone",
    blackbaud_object: "Constituent phone numbers",
    blackbaud_field: "primary_phone",
    selection_rule:
      "Pull only the phone marked Primary = true; if none is primary, leave blank",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "",
  },
  {
    mapping_key: "constituents.organization",
    app_entity: "constituents",
    app_field: "organization",
    blackbaud_object: "Constituent / employment",
    blackbaud_field: "tbd",
    selection_rule:
      "Decide whether this should come from primary organization, employer, or another NXT field",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "Needs decision",
  },
  {
    mapping_key: "prospects.blackbaud_constituent_id",
    app_entity: "prospects",
    app_field: "blackbaud_constituent_id",
    blackbaud_object: "Constituent",
    blackbaud_field: "id",
    selection_rule: "Match to linked constituent",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "Added for linking",
  },
  {
    mapping_key: "prospects.ask_amount",
    app_entity: "prospects",
    app_field: "ask_amount",
    blackbaud_object: "Opportunity rollup or local ranking",
    blackbaud_field: "tbd",
    selection_rule: "Keep local rollup until opportunity sync is defined",
    direction: "local only",
    source_of_truth: "App",
    notes: "",
  },
  {
    mapping_key: "prospects.status",
    app_entity: "prospects",
    app_field: "status",
    blackbaud_object: "Prospect / opportunity rollup",
    blackbaud_field: "tbd",
    selection_rule: "Keep local until opportunity sync is stable",
    direction: "local only",
    source_of_truth: "App",
    notes: "",
  },
  {
    mapping_key: "prospect_pool.email",
    app_entity: "prospect_pool",
    app_field: "email",
    blackbaud_object: "Constituent email addresses",
    blackbaud_field: "primary_email",
    selection_rule: "Use only the primary email if linked",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "Otherwise local",
  },
  {
    mapping_key: "prospect_pool.phone",
    app_entity: "prospect_pool",
    app_field: "phone",
    blackbaud_object: "Constituent phone numbers",
    blackbaud_field: "primary_phone",
    selection_rule: "Use only the primary phone if linked",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "Otherwise local",
  },
  {
    mapping_key: "submissions.notes",
    app_entity: "submissions",
    app_field: "notes",
    blackbaud_object: "Contact report / action notes",
    blackbaud_field: "tbd",
    selection_rule: "Candidate future write-back; defer for now",
    direction: "local only",
    source_of_truth: "App",
    notes: "Defer",
  },
  {
    mapping_key: "submissions.blackbaud_action_id",
    app_entity: "submissions",
    app_field: "blackbaud_action_id",
    blackbaud_object: "Action",
    blackbaud_field: "id",
    selection_rule: "Store the created RE NXT action ID after successful write-back",
    direction: "pull",
    source_of_truth: "Blackbaud NXT",
    notes: "For future action sync",
  },
  {
    mapping_key: "submissions.blackbaud_sync_status",
    app_entity: "submissions",
    app_field: "blackbaud_sync_status",
    blackbaud_object: "Action sync lifecycle",
    blackbaud_field: "n/a",
    selection_rule:
      "Track whether the local submission is pending, synced, skipped, or failed against Blackbaud",
    direction: "local only",
    source_of_truth: "App",
    notes: "Operational sync state only",
  },
  {
    mapping_key: "submissions.blackbaud_sync_error",
    app_entity: "submissions",
    app_field: "blackbaud_sync_error",
    blackbaud_object: "Action sync lifecycle",
    blackbaud_field: "n/a",
    selection_rule:
      "Store the latest Blackbaud sync error for reviewer/admin troubleshooting",
    direction: "local only",
    source_of_truth: "App",
    notes: "Operational sync state only",
  },
  {
    mapping_key: "action.summary",
    app_entity: "action",
    app_field: "summary",
    blackbaud_object: "Action",
    blackbaud_field: "summary",
    selection_rule: "Map combined update summary into the Blackbaud action summary",
    direction: "push",
    source_of_truth: "App",
    notes: "Character limit 255",
  },
  {
    mapping_key: "action.description",
    app_entity: "action",
    app_field: "description",
    blackbaud_object: "Action",
    blackbaud_field: "description",
    selection_rule:
      "Concatenate action notes and next step into the Blackbaud action description",
    direction: "push",
    source_of_truth: "App",
    notes: "",
  },
  {
    mapping_key: "action.constituent_id",
    app_entity: "action",
    app_field: "constituent_id",
    blackbaud_object: "Action",
    blackbaud_field: "constituent_id",
    selection_rule: "Use the linked constituent's stored blackbaud_constituent_id",
    direction: "push",
    source_of_truth: "Blackbaud NXT",
    notes: "Required for CreateAction",
  },
  {
    mapping_key: "action.date",
    app_entity: "action",
    app_field: "date",
    blackbaud_object: "Action",
    blackbaud_field: "date",
    selection_rule: "Use the update submission date in ISO-8601 format",
    direction: "push",
    source_of_truth: "App",
    notes: "Required for CreateAction",
  },
  {
    mapping_key: "action.category",
    app_entity: "action",
    app_field: "category",
    blackbaud_object: "Action",
    blackbaud_field: "category",
    selection_rule:
      "Map interaction type to Blackbaud values: call -> Phone Call, visit/event -> Meeting, email -> Email, otherwise Task/Other",
    direction: "push",
    source_of_truth: "App",
    notes: "Required for CreateAction",
  },
  {
    mapping_key: "action.direction",
    app_entity: "action",
    app_field: "direction",
    blackbaud_object: "Action",
    blackbaud_field: "direction",
    selection_rule: "Default to Outbound unless the app later captures inbound direction",
    direction: "push",
    source_of_truth: "App",
    notes: "",
  },
  {
    mapping_key: "action.author",
    app_entity: "action",
    app_field: "author",
    blackbaud_object: "Action",
    blackbaud_field: "author",
    selection_rule: "Use the signed-in user's display name when available",
    direction: "push",
    source_of_truth: "App",
    notes: "Optional",
  },
  {
    mapping_key: "action.delete",
    app_entity: "action",
    app_field: "delete",
    blackbaud_object: "Action",
    blackbaud_field: "DELETE /constituent/v1/actions/{action_id}",
    selection_rule:
      "Only delete when a synced local submission is explicitly removed or replaced; never auto-delete during normal edits",
    direction: "push",
    source_of_truth: "App",
    notes: "Use stored submissions.blackbaud_action_id",
  },
];

export function getDefaultBlackbaudFieldMappings() {
  return DEFAULT_BLACKBAUD_FIELD_MAPPINGS.map((mapping) => ({ ...mapping }));
}

export function mergeBlackbaudFieldMappings(overrides = []) {
  const overrideMap = new Map(
    overrides.map((item) => [item.mapping_key, item]),
  );

  const merged = getDefaultBlackbaudFieldMappings().map((mapping) => ({
    ...mapping,
    ...(overrideMap.get(mapping.mapping_key) || {}),
  }));

  for (const override of overrides) {
    if (!overrideMap.has(override.mapping_key)) continue;
    if (!merged.some((item) => item.mapping_key === override.mapping_key)) {
      merged.push(override);
    }
  }

  return merged.sort((a, b) => {
    if (a.app_entity !== b.app_entity) {
      return a.app_entity.localeCompare(b.app_entity);
    }
    return a.app_field.localeCompare(b.app_field);
  });
}

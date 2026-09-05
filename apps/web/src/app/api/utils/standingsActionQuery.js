import { isInStandingsPeriod } from "@/utils/standingsPeriods";

export function buildStandingsActionQuery({ fundraiserIds, startsOn, endsOn }) {
  const ids = [...new Set((fundraiserIds || []).map((id) => String(id).trim()))];
  if (!ids.length || ids.some((id) => !/^\d+$/.test(id))) {
    throw new Error("Team Standings requires valid mapped solicitor system IDs.");
  }
  const window = { startsOn, endsOn };
  if (!isInStandingsPeriod(startsOn, window) || !isInStandingsPeriod(endsOn, window)) {
    throw new Error("Team Standings requires a valid action date range.");
  }

  // List V2 applies these filters before paging; never substitute last_modified.
  return {
    filter: {
      filter_items: [
        { field: {
          field_id: "action_date",
          operator: "Equal",
          value: { value: {
            date_range_type: "SpecificRange",
            start_date: `${startsOn}T00:00:00+00:00`,
            end_date: `${endsOn}T23:59:59+00:00`,
          } },
        } },
        { collection_field: {
          field_id: "fundraisers",
          filter_fields: [{
            field_id: "fundraisers.system_record_id",
            operator: "OneOf",
            value: { value: ids.map((id) => ({ id, label: id })) },
            is_aggregate: false,
          }],
        } },
      ],
      time_zone_offset_in_minutes: 0,
    },
    output: { items: [
      { field_id: "system_record_id" },
      { field_id: "action_date" },
      { field_id: "category" },
      { field_id: "type.description" },
      { field_id: "fundraisers" },
      { field_id: "action_summary" },
      { field_id: "constituent_summary" },
    ] },
    sort: { sort_fields: [{ field_id: "action_date", sort_order: "asc" }] },
  };
}

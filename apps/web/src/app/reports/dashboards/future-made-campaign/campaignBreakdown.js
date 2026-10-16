export function campaignBreakdown(data, kind = "investment") {
  if (kind === "budgetRelieving") {
    const saved = data.segments?.budgetRelieving;
    return {
      ready: saved?.status === "ready", label: "Budget Relieving", otherLabel: "Other campaign giving",
      cents: saved?.cents, receivedCents: saved?.receivedCents, otherCents: saved?.otherCents, otherReceivedCents: saved?.otherReceivedCents,
      field: "budget_relieving_cents", receivedField: "budget_relieving_received_cents", otherField: "other_budget_cents", otherReceivedField: "other_budget_received_cents",
      bar: "budgetBar", marker: "budgetKey", otherBar: "totalBar", otherMarker: "totalKey",
    };
  }
  const saved = data.segments?.classification;
  return {
    ready: saved?.status === "ready", label: "Comprehensive Investment", otherLabel: "Philanthropic",
    cents: saved?.investmentCents, receivedCents: saved?.investmentReceivedCents, otherCents: saved?.philanthropicCents, otherReceivedCents: saved?.philanthropicReceivedCents,
    field: "investment_cents", receivedField: "investment_received_cents", otherField: "philanthropic_cents", otherReceivedField: "philanthropic_received_cents",
    bar: "investmentBar", marker: "investmentKey", otherBar: "philanthropicBar", otherMarker: "philanthropicKey",
  };
}

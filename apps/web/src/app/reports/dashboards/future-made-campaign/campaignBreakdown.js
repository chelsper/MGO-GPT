export function campaignBreakdown(data, kind = "investment") {
  const totals = {
    totalLabel: "Campaign", totalField: "effective_cents", totalReceivedField: "received_cents",
    totalCents: data.segments?.committed?.status === "ready" ? data.segments.committed.cents : data.effectiveCents,
    totalReceivedCents: data.segments?.received?.cents,
  };
  if (kind === "budgetPhilanthropic") {
    const saved = data.segments?.budgetPhilanthropic;
    return {
      ready: saved?.status === "ready" && data.segments?.classification?.status === "ready" && data.segments?.budgetRelieving?.status === "ready",
      label: "Budget Relieving", otherLabel: "Other Philanthropic giving",
      cents: saved?.cents, receivedCents: saved?.receivedCents, otherCents: saved?.otherCents, otherReceivedCents: saved?.otherReceivedCents,
      field: "budget_philanthropic_cents", receivedField: "budget_philanthropic_received_cents", otherField: "other_philanthropic_cents", otherReceivedField: "other_philanthropic_received_cents",
      bar: "budgetBar", marker: "budgetKey", otherBar: "philanthropicBar", otherMarker: "philanthropicKey",
      totalLabel: "Philanthropic", totalField: "philanthropic_cents", totalReceivedField: "philanthropic_received_cents",
      totalCents: data.segments?.classification?.philanthropicCents, totalReceivedCents: data.segments?.classification?.philanthropicReceivedCents,
    };
  }
  if (kind === "budgetRelieving") {
    const saved = data.segments?.budgetRelieving;
    return {
      ...totals,
      ready: saved?.status === "ready", label: "Budget Relieving", otherLabel: "Other campaign giving",
      cents: saved?.cents, receivedCents: saved?.receivedCents, otherCents: saved?.otherCents, otherReceivedCents: saved?.otherReceivedCents,
      field: "budget_relieving_cents", receivedField: "budget_relieving_received_cents", otherField: "other_budget_cents", otherReceivedField: "other_budget_received_cents",
      bar: "budgetBar", marker: "budgetKey", otherBar: "totalBar", otherMarker: "totalKey",
    };
  }
  const saved = data.segments?.classification;
  return {
    ...totals,
    ready: saved?.status === "ready", label: "Comprehensive Investment", otherLabel: "Philanthropic",
    cents: saved?.investmentCents, receivedCents: saved?.investmentReceivedCents, otherCents: saved?.philanthropicCents, otherReceivedCents: saved?.philanthropicReceivedCents,
    field: "investment_cents", receivedField: "investment_received_cents", otherField: "philanthropic_cents", otherReceivedField: "philanthropic_received_cents",
    bar: "investmentBar", marker: "investmentKey", otherBar: "philanthropicBar", otherMarker: "philanthropicKey",
  };
}

export function campaignPartShare(amount, other, total) {
  if (![amount, other, total].every(Number.isSafeInteger) || total <= 0 || amount < 0 || other < 0 || BigInt(amount)+BigInt(other)!==BigInt(total)) return null;
  if (amount === 0) return "0%";
  if (amount === total) return "100%";
  const share = amount / total;
  if (share < 0.001) return "<0.1%";
  if (share > 0.999) return ">99.9%";
  return `${Math.round(share * 1000) / 10}%`;
}

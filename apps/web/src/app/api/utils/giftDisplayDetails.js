function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function label(value) {
  return value && typeof value === "object"
    ? text(value.description || value.name || value.label || value.value)
    : text(value);
}

// Fund IDs are references, not descriptions. Resolve them separately without
// changing the gift amounts or classification used by the giving calculation.
export function getGiftDisplayDetails(gift = {}) {
  const funds = new Set();
  const fundIds = new Set();
  const add = (source) => {
    if (!source) return;
    const description = label(source.fund_description || source.fundDescription ||
      source.fund_name || source.fundName || source.fund);
    if (description) funds.add(description);
    const id = text(source.fund_id || source.fundId || source.fund?.id);
    if (id) fundIds.add(id);
  };
  add(gift);
  for (const key of ["gift_splits", "splits", "funds", "designations", "applications"]) {
    for (const entry of Array.isArray(gift[key]) ? gift[key] : []) {
      add(entry);
      if (key === "funds" || key === "designations") {
        const description = label(entry);
        if (description) funds.add(description);
      }
    }
  }
  for (const description of gift.fundDescriptions || []) {
    if (text(description)) funds.add(text(description));
  }
  return {
    giftType: label(gift.gift_type || gift.giftType || gift.type || gift.type_name) || null,
    fundDescriptions: [...funds],
    fundIds: [...fundIds],
  };
}

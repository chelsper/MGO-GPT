function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function getLastNameSortKey(name) {
  const parts = normalizeText(name).split(/\s+/).filter(Boolean);
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  while (parts.length > 1 && suffixes.has(parts.at(-1).replace(/\./g, "").toLowerCase())) {
    parts.pop();
  }
  const lastName = parts.at(-1) || "";
  return `${lastName}\u0000${normalizeText(name)}`.toLocaleLowerCase("en-US");
}

function getGroupKey({ giftId, date, hardCreditDonor }) {
  const normalizedGiftId = normalizeText(giftId);
  if (normalizedGiftId) return `gift:${normalizedGiftId}`;
  return [
    "gift-fallback",
    normalizeText(hardCreditDonor?.constituentId),
    normalizeText(date),
  ].join(":");
}

function addGiftSolicitors(group, solicitors) {
  for (const solicitor of Array.isArray(solicitors) ? solicitors : []) {
    const id = normalizeText(solicitor?.id);
    const name = normalizeText(solicitor?.name);
    if (!id && !name) continue;
    const key = id ? `id:${id}` : `name:${name.toLocaleLowerCase("en-US")}`;
    group.giftSolicitors.set(key, { id: id || null, name: name || "Unnamed fundraiser" });
  }
}

export function mergeAcknowledgmentGiftGroup(groups, details) {
  const key = getGroupKey(details);
  const existing = groups.get(key) || {
    key,
    giftId: normalizeText(details?.giftId) || null,
    date: details?.date || null,
    hardCreditDonor: null,
    hardCreditRecordSolicitor: "Not in selected MGO portfolio",
    receivedAmount: 0,
    committedAmount: 0,
    giftSolicitors: new Map(),
    softCreditRecipients: new Map(),
  };

  if (details?.date && !existing.date) existing.date = details.date;
  if (details?.hardCreditDonor?.constituentId || details?.hardCreditDonor?.name) {
    existing.hardCreditDonor = {
      constituentId: normalizeText(details.hardCreditDonor.constituentId) || null,
      name: normalizeText(details.hardCreditDonor.name) || "Unnamed donor",
    };
  }
  if (details?.hardCreditRecordSolicitor) {
    existing.hardCreditRecordSolicitor = details.hardCreditRecordSolicitor;
  }

  existing.receivedAmount = Math.max(
    existing.receivedAmount,
    normalizeAmount(details?.receivedAmount),
  );
  existing.committedAmount = Math.max(
    existing.committedAmount,
    normalizeAmount(details?.committedAmount),
  );
  addGiftSolicitors(existing, details?.giftSolicitors);

  const recipient = details?.softCreditRecipient;
  const recipientId = normalizeText(recipient?.constituentId);
  if (recipientId) {
    const currentRecipient = existing.softCreditRecipients.get(recipientId);
    existing.softCreditRecipients.set(recipientId, {
      constituentId: recipientId,
      name: normalizeText(recipient?.name) || currentRecipient?.name || "Unnamed constituent",
      constituentRecordSolicitor:
        recipient?.constituentRecordSolicitor ||
        currentRecipient?.constituentRecordSolicitor ||
        "Not in selected MGO portfolio",
      amount: Math.max(currentRecipient?.amount || 0, normalizeAmount(recipient?.amount)),
    });
  }

  groups.set(key, existing);
  return existing;
}

export function materializeAcknowledgmentGiftGroups(groups) {
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      giftSolicitors: Array.from(group.giftSolicitors.values()).sort((left, right) =>
        left.name.localeCompare(right.name, "en"),
      ),
      softCreditRecipients: Array.from(group.softCreditRecipients.values()).sort((left, right) =>
        getLastNameSortKey(left.name).localeCompare(getLastNameSortKey(right.name), "en"),
      ),
    }))
    .sort((left, right) => {
      const leftTime = new Date(left.date || "").getTime();
      const rightTime = new Date(right.date || "").getTime();
      const dateComparison =
        (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0);
      if (dateComparison) return dateComparison;
      return getLastNameSortKey(left.hardCreditDonor?.name).localeCompare(
        getLastNameSortKey(right.hardCreditDonor?.name),
        "en",
      );
    });
}

import {
  materializeAcknowledgmentGiftGroups,
  mergeAcknowledgmentGiftGroup,
} from "@/app/reports/portfolioAcknowledgmentGroups";

function getLastNameSortKey(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  while (
    parts.length > 1 &&
    suffixes.has(parts.at(-1).replace(/\./g, "").toLowerCase())
  ) {
    parts.pop();
  }
  const lastName = parts.at(-1) || "";
  return `${lastName}\u0000${String(name || "")}`.toLocaleLowerCase("en-US");
}

export function getPortfolioPeople(payload) {
  const peopleByConstituentId = new Map();
  for (const person of [
    ...(Array.isArray(payload?.leadSolicitor) ? payload.leadSolicitor : []),
    ...(Array.isArray(payload?.supportingSolicitor)
      ? payload.supportingSolicitor
      : []),
  ]) {
    const constituentId = String(person?.constituentId || "").trim();
    if (!constituentId || peopleByConstituentId.has(constituentId)) continue;
    peopleByConstituentId.set(constituentId, person);
  }
  return Array.from(peopleByConstituentId.values());
}

function normalizeConstituencyLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDonorAdvisedFund(profile) {
  const constituencies = Array.isArray(profile?.constituencies)
    ? profile.constituencies
    : [];
  return constituencies.some((constituency) => {
    const label = normalizeConstituencyLabel(
      constituency?.label || constituency,
    );
    return label === "donor advised fund" || label === "donor advised funds";
  });
}

function sortReportRows(rows) {
  return rows.sort((left, right) =>
    getLastNameSortKey(left.name).localeCompare(
      getLastNameSortKey(right.name),
      "en",
    ),
  );
}

function getLatestGiftDetails(currentRow, { date, amount }) {
  const nextTime = new Date(date).getTime();
  const currentTime = new Date(currentRow?.lastGiftDate || "").getTime();
  if (
    !Number.isFinite(nextTime) ||
    (Number.isFinite(currentTime) && currentTime >= nextTime)
  ) {
    return {
      lastGiftDate: currentRow?.lastGiftDate || null,
      lastGiftAmount: currentRow?.lastGiftAmount ?? null,
    };
  }
  return {
    lastGiftDate: date || null,
    lastGiftAmount: amount == null ? null : Number(amount),
  };
}

function getConstituentRecordSolicitor(workspaceUser, person) {
  if (!person) return "Not in selected MGO portfolio";

  const assignmentTypes = Array.isArray(person.assignmentTypes)
    ? person.assignmentTypes.filter(Boolean)
    : [];
  const solicitorName =
    workspaceUser?.name || workspaceUser?.email || "Selected MGO";
  return assignmentTypes.length
    ? `${solicitorName} (${assignmentTypes.join(", ")})`
    : solicitorName;
}

function normalizeGiftSolicitorIdentity(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getWorkspaceGiftSolicitorIds(workspaceUser) {
  return new Set(
    [
      workspaceUser?.blackbaud_constituent_id,
      workspaceUser?.blackbaud_lookup_id,
      workspaceUser?.blackbaudConstituentId,
      workspaceUser?.blackbaudLookupId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

function isSelectedGiftSolicitor(solicitors, workspaceUser) {
  const workspaceIds = getWorkspaceGiftSolicitorIds(workspaceUser);
  const workspaceName = normalizeGiftSolicitorIdentity(
    workspaceUser?.name ||
      workspaceUser?.full_name ||
      workspaceUser?.display_name,
  );
  const workspaceNameParts = workspaceName.split(" ").filter(Boolean);

  return (Array.isArray(solicitors) ? solicitors : []).some((solicitor) => {
    const solicitorId = String(solicitor?.id || "").trim();
    if (solicitorId && workspaceIds.has(solicitorId)) return true;

    const solicitorName = normalizeGiftSolicitorIdentity(solicitor?.name);
    if (!solicitorName || solicitorName === "unnamed fundraiser") return false;
    if (workspaceName && solicitorName === workspaceName) return true;

    const solicitorNameParts = solicitorName.split(" ").filter(Boolean);
    return (
      workspaceNameParts.length >= 2 &&
      solicitorNameParts.length >= 2 &&
      workspaceNameParts[0] === solicitorNameParts[0] &&
      workspaceNameParts.at(-1) === solicitorNameParts.at(-1)
    );
  });
}

function getSelectedDirectGiftDetails(giving, workspaceUser) {
  const gifts = (
    Array.isArray(giving?.directGifts) ? giving.directGifts : []
  ).filter((gift) =>
    isSelectedGiftSolicitor(gift?.giftSolicitors, workspaceUser),
  );

  return gifts.reduce(
    (summary, gift) => {
      const receivedAmount = Number(gift?.receivedAmount || 0);
      const committedAmount = Number(gift?.committedAmount || 0);
      summary.received += receivedAmount;
      summary.committed += committedAmount;
      if (receivedAmount > 0) {
        const latestGift = getLatestGiftDetails(summary, {
          date: gift?.date,
          amount: receivedAmount,
        });
        summary.lastGiftDate = latestGift.lastGiftDate;
        summary.lastGiftAmount = latestGift.lastGiftAmount;
      }
      return summary;
    },
    {
      gifts,
      received: 0,
      committed: 0,
      lastGiftDate: null,
      lastGiftAmount: null,
    },
  );
}

function addGiftSolicitors(row, solicitors) {
  if (!row.giftSolicitors) row.giftSolicitors = new Map();

  for (const solicitor of Array.isArray(solicitors) ? solicitors : []) {
    const id = String(solicitor?.id || "").trim();
    const name = String(solicitor?.name || "").trim();
    if (!id && !name) continue;

    const key = id ? `id:${id}` : `name:${name.toLocaleLowerCase("en-US")}`;
    const existing = row.giftSolicitors.get(key) || {
      id: id || null,
      name,
      giftIds: new Set(),
    };
    for (const giftId of Array.isArray(solicitor?.giftIds)
      ? solicitor.giftIds
      : []) {
      if (giftId != null && String(giftId).trim())
        existing.giftIds.add(String(giftId));
    }
    row.giftSolicitors.set(key, existing);
  }
}

function materializeReportRows(rowsByConstituentId) {
  return sortReportRows(
    Array.from(rowsByConstituentId.values()).map((row) => {
      // This set prevents an associated gift returned in more than one batch
      // from being counted twice. It is implementation state, not report data.
      const { acknowledgmentCreditIds, ...displayRow } = row;
      return {
        ...displayRow,
        hardCreditDonors: Array.from(row.hardCreditDonors?.values() || []).sort(
          (left, right) => left.name.localeCompare(right.name, "en"),
        ),
        giftSolicitors: Array.from(row.giftSolicitors?.values() || [])
          .map((solicitor) => ({
            id: solicitor.id,
            name: solicitor.name,
            giftCount: solicitor.giftIds?.size || 1,
          }))
          .sort((left, right) => left.name.localeCompare(right.name, "en")),
      };
    }),
  );
}

export function getReportProfileIds(givingPayload, workspaceUser) {
  const direct = Object.entries(givingPayload.byConstituentId || {})
    .filter(([, giving]) => {
      const selected = getSelectedDirectGiftDetails(giving, workspaceUser);
      return selected.received > 0 || selected.committed > 0;
    })
    .map(([id]) => id);
  const related = (givingPayload.acknowledgmentCredits || [])
    .filter((credit) =>
      isSelectedGiftSolicitor(credit.giftSolicitors, workspaceUser),
    )
    .flatMap((credit) => [
      credit.hardCreditConstituentId,
      credit.recipientConstituentId,
    ]);
  return [
    ...new Set(
      [...direct, ...related]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
}

// The former browser calculator, now run only against a complete refresh.
// Keep hard-credit totals separate from soft-credit acknowledgment recipients.
export function buildPortfolioGivingReport({
  people,
  givingPayload,
  profilesById,
  workspaceUser,
  closedGiftSummary,
}) {
  const profiles = new Map(Object.entries(profilesById));
  for (const id of getReportProfileIds(givingPayload, workspaceUser)) {
    if (
      !profiles.get(id)?.name ||
      profiles.get(id)?.constituencyCodesVerified !== true
    )
      throw new Error(
        "Donor identity or constituency codes could not be verified. The previous report was retained.",
      );
  }
  const batch = people.map((person) => String(person.constituentId));
  const peopleByConstituentId = new Map(
    people.map((person) => [String(person.constituentId), person]),
  );
  const reportRowsByConstituentId = new Map();
  const reportGiftGroupsById = new Map();
  let totalHardReceived = 0;
  let totalHardCommitted = 0;
  function addHardCreditDonor(row, donor) {
    if (!row.hardCreditDonors) row.hardCreditDonors = new Map();
    row.hardCreditDonors.set(donor.constituentId, donor);
  }
  const selectedGivingByConstituentId = new Map();
  for (const constituentId of batch) {
    const giving = givingPayload?.byConstituentId?.[constituentId] || {};
    const selectedGiving = getSelectedDirectGiftDetails(giving, workspaceUser);
    if (!selectedGiving.gifts.length) continue;

    selectedGivingByConstituentId.set(constituentId, selectedGiving);
    totalHardReceived += selectedGiving.received;
    totalHardCommitted += selectedGiving.committed;
  }

  const acknowledgmentCredits = (
    Array.isArray(givingPayload?.acknowledgmentCredits)
      ? givingPayload.acknowledgmentCredits
      : []
  ).filter((credit) =>
    isSelectedGiftSolicitor(credit?.giftSolicitors, workspaceUser),
  );
  const donorIds = Array.from(selectedGivingByConstituentId)
    .filter(([, giving]) => giving.received > 0 || giving.committed > 0)
    .map(([constituentId]) => constituentId);

  for (const constituentId of donorIds) {
    const person = peopleByConstituentId.get(constituentId);
    const profile = profiles.get(constituentId);
    if (!profile) {
      throw new Error(
        "One donor could not be verified in NXT. The previous complete report was retained.",
      );
    }

    if (profile.constituencyCodesVerified !== true) {
      throw new Error(
        "One donor could not be verified against current NXT constituency codes. The previous complete report was retained.",
      );
    }

    if (isDonorAdvisedFund(profile)) {
      continue;
    }

    const selectedGiving = selectedGivingByConstituentId.get(constituentId);
    if (!selectedGiving) continue;
    const hardCreditRecordSolicitor = getConstituentRecordSolicitor(
      workspaceUser,
      person,
    );
    for (const gift of selectedGiving.gifts) {
      mergeAcknowledgmentGiftGroup(reportGiftGroupsById, {
        giftId: gift.id,
        date: gift.date,
        giftType: gift.giftType,
        fundDescriptions: gift.fundDescriptions,
        hardCreditDonor: {
          constituentId,
          name: profile.name || person?.name || "Unnamed donor",
        },
        hardCreditRecordSolicitor,
        receivedAmount: gift.receivedAmount,
        committedAmount: gift.committedAmount,
        giftSolicitors: gift.giftSolicitors,
      });
    }
    const existingRow = reportRowsByConstituentId.get(constituentId);
    const latestGift = selectedGiving.lastGiftDate
      ? getLatestGiftDetails(existingRow, {
          date: selectedGiving.lastGiftDate,
          amount: selectedGiving.lastGiftAmount,
        })
      : {
          lastGiftDate: existingRow?.lastGiftDate || null,
          lastGiftAmount: existingRow?.lastGiftAmount ?? null,
        };
    const nextRow = {
      ...existingRow,
      constituentId,
      name: profile.name || person?.name || "Unnamed constituent",
      constituentRecordSolicitor: hardCreditRecordSolicitor,
      // Direct credit is added here. Soft credit is added below from
      // the related gift, so a recipient sees the amount recognized
      // for them without double-counting it when both records load.
      recognizedReceived:
        Number(existingRow?.recognizedReceived || 0) + selectedGiving.received,
      recognizedCommitted:
        Number(existingRow?.recognizedCommitted || 0) +
        selectedGiving.committed,
      ...latestGift,
      hardCreditDonors: existingRow?.hardCreditDonors || new Map(),
      acknowledgmentCreditIds:
        existingRow?.acknowledgmentCreditIds || new Set(),
      giftSolicitors: existingRow?.giftSolicitors || new Map(),
    };
    for (const gift of selectedGiving.gifts) {
      addGiftSolicitors(
        nextRow,
        gift.giftSolicitors.map((solicitor) => ({
          ...solicitor,
          giftIds: [gift.id],
        })),
      );
    }
    reportRowsByConstituentId.set(constituentId, nextRow);
  }

  for (const credit of acknowledgmentCredits) {
    const hardCreditConstituentId = String(
      credit?.hardCreditConstituentId || "",
    ).trim();
    const recipientConstituentId = String(
      credit?.recipientConstituentId || "",
    ).trim();
    const hardCreditDonor = profiles.get(hardCreditConstituentId);
    const recipient = profiles.get(recipientConstituentId);
    if (
      !hardCreditDonor ||
      !recipient ||
      recipient.constituencyCodesVerified !== true
    ) {
      throw new Error(
        "One soft-credit recipient could not be verified in NXT. The previous complete report was retained.",
      );
    }
    if (isDonorAdvisedFund(recipient)) {
      continue;
    }

    const existingRow = reportRowsByConstituentId.get(recipientConstituentId);
    const recipientPortfolioPerson = peopleByConstituentId.get(
      recipientConstituentId,
    );
    const recipientRecordSolicitor = recipientPortfolioPerson
      ? getConstituentRecordSolicitor(workspaceUser, recipientPortfolioPerson)
      : "Not in selected MGO portfolio";
    const hardCreditPortfolioPerson = peopleByConstituentId.get(
      hardCreditConstituentId,
    );
    mergeAcknowledgmentGiftGroup(reportGiftGroupsById, {
      giftId: credit?.giftId,
      date: credit?.date,
      giftType: credit?.giftType,
      fundDescriptions: credit?.fundDescriptions,
      hardCreditDonor: {
        constituentId: hardCreditConstituentId,
        name: hardCreditDonor.name || "Unnamed donor",
      },
      hardCreditRecordSolicitor: hardCreditPortfolioPerson
        ? getConstituentRecordSolicitor(
            workspaceUser,
            hardCreditPortfolioPerson,
          )
        : "Not in selected MGO portfolio",
      receivedAmount: credit?.hardCreditAmount || credit?.amount,
      giftSolicitors: credit?.giftSolicitors,
      softCreditRecipient: {
        constituentId: recipientConstituentId,
        name: recipient.name || "Unnamed constituent",
        constituentRecordSolicitor: recipientRecordSolicitor,
        amount: credit?.amount,
      },
    });
    const acknowledgmentCreditKey = [
      credit?.giftId ||
        `${credit?.date || "unknown"}:${credit?.amount || "unknown"}`,
      hardCreditConstituentId,
      recipientConstituentId,
    ].join(":");
    const acknowledgmentCreditIds = new Set(
      existingRow?.acknowledgmentCreditIds || [],
    );
    const isNewAcknowledgmentCredit = !acknowledgmentCreditIds.has(
      acknowledgmentCreditKey,
    );
    if (isNewAcknowledgmentCredit) {
      acknowledgmentCreditIds.add(acknowledgmentCreditKey);
    }
    const latestGift = getLatestGiftDetails(existingRow, {
      date: credit?.date,
      amount: credit?.amount,
    });
    const nextRow = {
      ...existingRow,
      constituentId: recipientConstituentId,
      name: recipient.name || existingRow?.name || "Unnamed constituent",
      constituentRecordSolicitor:
        recipientRecordSolicitor ||
        existingRow?.constituentRecordSolicitor ||
        "Not in selected MGO portfolio",
      recognizedReceived:
        Number(existingRow?.recognizedReceived || 0) +
        (isNewAcknowledgmentCredit ? Number(credit?.amount || 0) : 0),
      recognizedCommitted: Number(existingRow?.recognizedCommitted || 0),
      ...latestGift,
      hardCreditDonors: existingRow?.hardCreditDonors || new Map(),
      acknowledgmentCreditIds,
      giftSolicitors: existingRow?.giftSolicitors || new Map(),
    };
    addHardCreditDonor(nextRow, {
      constituentId: hardCreditConstituentId,
      name: hardCreditDonor.name || "Donor Advised Fund",
    });
    if (isNewAcknowledgmentCredit) {
      addGiftSolicitors(
        nextRow,
        (credit.giftSolicitors || []).map((solicitor) => ({
          ...solicitor,
          giftIds: [credit.giftId],
        })),
      );
    }
    reportRowsByConstituentId.set(recipientConstituentId, nextRow);
  }

  if (
    ![
      totalHardReceived,
      totalHardCommitted,
      closedGiftSummary?.closedThisFY,
    ].every((value) => typeof value === "number" && Number.isFinite(value))
  )
    throw new Error("The report totals could not be verified.");
  const reportRows = materializeReportRows(reportRowsByConstituentId);
  if (
    reportRows.some(
      (row) =>
        !Number.isFinite(row.recognizedReceived) ||
        !Number.isFinite(row.recognizedCommitted),
    )
  )
    throw new Error("A donor's gift credit could not be verified.");
  return {
    reportRows,
    acknowledgmentGiftGroups:
      materializeAcknowledgmentGiftGroups(reportGiftGroupsById),
    period: givingPayload.period,
    hardCreditTotals: {
      received: totalHardReceived,
      committed: totalHardCommitted,
    },
    closedGiftSummary,
  };
}

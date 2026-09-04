"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import useUser from "@/utils/useUser";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { canUseExecutiveViewRole, isMgoRole } from "@/utils/workspaceRoles";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { getReportHref } from "@/app/api/utils/reportRegistry";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import {
  materializeAcknowledgmentGiftGroups,
  mergeAcknowledgmentGiftGroup,
} from "@/app/reports/portfolioAcknowledgmentGroups";

const REPORT_BATCH_SIZE = 10;
const REPORT_BATCH_CONCURRENCY = 2;
const REPORT_PROFILE_CONCURRENCY = 4;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatGiftDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "Unavailable";
}

function chunkValues(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function getLastNameSortKey(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  while (parts.length > 1 && suffixes.has(parts.at(-1).replace(/\./g, "").toLowerCase())) {
    parts.pop();
  }
  const lastName = parts.at(-1) || "";
  return `${lastName}\u0000${String(name || "")}`.toLocaleLowerCase("en-US");
}

function getPortfolioPeople(payload) {
  const peopleByConstituentId = new Map();
  for (const person of [
    ...(Array.isArray(payload?.leadSolicitor) ? payload.leadSolicitor : []),
    ...(Array.isArray(payload?.supportingSolicitor) ? payload.supportingSolicitor : []),
  ]) {
    const constituentId = String(person?.constituentId || "").trim();
    if (!constituentId || peopleByConstituentId.has(constituentId)) continue;
    peopleByConstituentId.set(constituentId, person);
  }
  return Array.from(peopleByConstituentId.values());
}

async function fetchCurrentFiscalYearGiving(constituentIds) {
  const searchParams = new URLSearchParams({
    constituentIds: constituentIds.join(","),
    report: "portfolio-fy-giving",
  });
  const response = await fetch(
    `/api/blackbaud/current-fy-giving?${searchParams.toString()}`,
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Could not load current fiscal-year giving.");
  }
  return payload;
}

async function fetchReportProfile(constituentId) {
  const response = await fetch(
    `/api/blackbaud/constituents/${encodeURIComponent(constituentId)}/summary?report_profile=true`,
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Could not load this donor's NXT identity.");
  }
  return payload?.mapped?.constituent || null;
}

async function loadReportProfiles(constituentIds) {
  const profiles = new Map();
  const warnings = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < constituentIds.length) {
      const constituentId = constituentIds[nextIndex];
      nextIndex += 1;
      try {
        profiles.set(constituentId, await fetchReportProfile(constituentId));
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? error.message
            : "Could not load one donor's NXT identity.",
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(REPORT_PROFILE_CONCURRENCY, constituentIds.length) },
      () => worker(),
    ),
  );

  return { profiles, warnings };
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
  return constituencies.some(
    (constituency) => {
      const label = normalizeConstituencyLabel(constituency?.label || constituency);
      return label === "donor advised fund" || label === "donor advised funds";
    },
  );
}

function sortReportRows(rows) {
  return rows.sort((left, right) =>
    getLastNameSortKey(left.name).localeCompare(getLastNameSortKey(right.name), "en"),
  );
}

function getLatestGiftDetails(currentRow, { date, amount }) {
  const nextTime = new Date(date).getTime();
  const currentTime = new Date(currentRow?.lastGiftDate || "").getTime();
  if (!Number.isFinite(nextTime) || (Number.isFinite(currentTime) && currentTime >= nextTime)) {
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
  const solicitorName = workspaceUser?.name || workspaceUser?.email || "Selected MGO";
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
    workspaceUser?.name || workspaceUser?.full_name || workspaceUser?.display_name,
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
  const gifts = (Array.isArray(giving?.directGifts) ? giving.directGifts : []).filter((gift) =>
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
    { gifts, received: 0, committed: 0, lastGiftDate: null, lastGiftAmount: null },
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
    for (const giftId of Array.isArray(solicitor?.giftIds) ? solicitor.giftIds : []) {
      if (giftId != null && String(giftId).trim()) existing.giftIds.add(String(giftId));
    }
    row.giftSolicitors.set(key, existing);
  }
}

function formatGiftSolicitors(solicitors) {
  if (!solicitors?.length) return "Not returned by NXT";
  return solicitors
    .map((solicitor) =>
      solicitor.giftCount > 1 ? `${solicitor.name} (${solicitor.giftCount} gifts)` : solicitor.name,
    )
    .join(", ");
}

function materializeReportRows(rowsByConstituentId) {
  return sortReportRows(
    Array.from(rowsByConstituentId.values()).map((row) => {
      // This set prevents an associated gift returned in more than one batch
      // from being counted twice. It is implementation state, not report data.
      const { acknowledgmentCreditIds, ...displayRow } = row;
      return {
        ...displayRow,
        hardCreditDonors: Array.from(row.hardCreditDonors?.values() || []).sort((left, right) =>
          left.name.localeCompare(right.name, "en"),
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

function MetricCard({ label, value, hint }) {
  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid #E2E8F0",
        borderRadius: "16px",
        padding: "20px",
      }}
    >
      <div
        style={{
          color: "#64748B",
          fontSize: "12px",
          fontWeight: 800,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ color: "#0F172A", fontSize: "30px", fontWeight: 800, marginTop: "8px" }}>
        {value}
      </div>
      {hint ? <div style={{ color: "#64748B", fontSize: "13px", marginTop: "6px" }}>{hint}</div> : null}
    </div>
  );
}

export default function ReportsPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [profileStatus, setProfileStatus] = useState(null);
  const [actingWorkspaceStatus, setActingWorkspaceStatus] = useState(null);
  const [mgoUsers, setMgoUsers] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [acknowledgmentGiftGroups, setAcknowledgmentGiftGroups] = useState([]);
  const [period, setPeriod] = useState(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportWarnings, setReportWarnings] = useState([]);
  const [hardCreditTotals, setHardCreditTotals] = useState({ received: 0, committed: 0 });
  const [closedGiftSummary, setClosedGiftSummary] = useState(undefined);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const {
    configurations: reportConfigurations,
    visibleReports,
    canManage: canManageReports,
    isLoading: isLoadingReportConfigurations,
    error: reportConfigurationsError,
  } = useReportConfigurations({ enabled: Boolean(user) });

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    async function loadProfileContext() {
      try {
        const response = await fetch("/api/users/profile");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load your workspace profile.");
        }
        if (active) setProfileStatus(payload);
      } catch (error) {
        if (active) {
          setReportError(
            error instanceof Error ? error.message : "Could not load your workspace profile.",
          );
        }
      }
    }

    loadProfileContext();
    return () => {
      active = false;
    };
  }, [user]);

  const canUseExecutiveView = canUseExecutiveViewRole(profileStatus?.user?.role);
  const reportAccess = reportConfigurations.find(
    (configuration) => configuration.key === "portfolio-fy-giving",
  ) || null;
  const reportAccessLoading = Boolean(user) && isLoadingReportConfigurations;
  const reportAccessError = reportConfigurationsError
    ? reportConfigurationsError instanceof Error
      ? reportConfigurationsError.message
      : "Could not load report access."
    : !reportAccessLoading && user && !reportAccess
      ? "My Reports access could not be loaded."
      : "";
  const additionalReports = visibleReports.filter(
    (configuration) => configuration.key !== "portfolio-fy-giving",
  );

  useEffect(() => {
    if (!user || !canUseExecutiveView) return undefined;

    let active = true;
    async function loadExecutiveOptions() {
      try {
        const [workspaceResponse, mgoResponse] = await Promise.all([
          fetch("/api/admin/workspace-user"),
          fetch("/api/users/mgos"),
        ]);
        const [workspacePayload, mgoPayload] = await Promise.all([
          workspaceResponse.json().catch(() => null),
          mgoResponse.json().catch(() => null),
        ]);
        if (!workspaceResponse.ok) {
          throw new Error(workspacePayload?.error || "Could not load the selected MGO workspace.");
        }
        if (!mgoResponse.ok) {
          throw new Error(mgoPayload?.error || "Could not load MGO report options.");
        }
        if (active) {
          setActingWorkspaceStatus(workspacePayload);
          setMgoUsers(Array.isArray(mgoPayload) ? mgoPayload : []);
        }
      } catch (error) {
        if (active) {
          setReportError(
            error instanceof Error ? error.message : "Could not load MGO report options.",
          );
        }
      }
    }

    loadExecutiveOptions();
    return () => {
      active = false;
    };
  }, [canUseExecutiveView, user]);

  const workspaceUser = profileStatus?.workspaceUser || null;

  useEffect(() => {
    if (
      reportAccessLoading ||
      reportAccessError ||
      reportAccess?.canView !== true ||
      !workspaceUser?.id
    ) {
      setClosedGiftSummary(undefined);
      return undefined;
    }

    let active = true;
    async function loadClosedGiftSummary() {
      setClosedGiftSummary(undefined);
      try {
        const response = await fetch("/api/prospects/summary");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load the My Prospects closed-gift total.");
        }
        if (active) setClosedGiftSummary(payload);
      } catch {
        if (active) setClosedGiftSummary(null);
      }
    }

    loadClosedGiftSummary();
    return () => {
      active = false;
    };
  }, [refreshVersion, reportAccess?.canView, reportAccessError, reportAccessLoading, workspaceUser?.id]);

  useEffect(() => {
    if (
      reportAccessLoading ||
      reportAccessError ||
      reportAccess?.canView !== true ||
      !workspaceUser?.id
    ) {
      return undefined;
    }

    let active = true;
    async function loadReport() {
      setIsLoadingReport(true);
      setReportError("");
      setReportWarnings([]);
      setReportRows([]);
      setAcknowledgmentGiftGroups([]);
      setPeriod(null);
      setHardCreditTotals({ received: 0, committed: 0 });
      try {
        const portfolioResponse = await fetch("/api/blackbaud/portfolio");
        const portfolioPayload = await portfolioResponse.json().catch(() => null);
        if (!portfolioResponse.ok) {
          throw new Error(portfolioPayload?.error || "Could not load this MGO's portfolio.");
        }

        const people = getPortfolioPeople(portfolioPayload);
        const constituentIds = people
          .map((person) => String(person?.constituentId || "").trim())
          .filter(Boolean);

        if (!constituentIds.length) {
          if (active) {
            setReportRows([]);
            setPeriod(null);
          }
          return;
        }

        const peopleByConstituentId = new Map(
          people.map((person) => [String(person?.constituentId || "").trim(), person]),
        );
        const reportRowsByConstituentId = new Map();
        const reportGiftGroupsById = new Map();
        const warnings = new Set();
        let reportPeriod = null;
        let successfullyLoadedBatch = false;
        let totalHardReceived = 0;
        let totalHardCommitted = 0;
        const batches = chunkValues(constituentIds, REPORT_BATCH_SIZE);

        function addHardCreditDonor(row, donor) {
          if (!row.hardCreditDonors) row.hardCreditDonors = new Map();
          row.hardCreditDonors.set(donor.constituentId, donor);
        }

        async function loadBatch(batch) {
          const givingPayload = await fetchCurrentFiscalYearGiving(batch);
          successfullyLoadedBatch = true;
          reportPeriod = reportPeriod || givingPayload?.period || null;
          Object.values(givingPayload?.warnings || {})
            .filter(Boolean)
            .forEach((warning) => warnings.add(warning));

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
          ).filter((credit) => isSelectedGiftSolicitor(credit?.giftSolicitors, workspaceUser));
          const donorIds = Array.from(selectedGivingByConstituentId)
            .filter(([, giving]) => giving.received > 0 || giving.committed > 0)
            .map(([constituentId]) => constituentId);
          const hardCreditDonorIds = [
            ...new Set(
              acknowledgmentCredits
                .map((credit) => String(credit?.hardCreditConstituentId || "").trim())
                .filter(Boolean),
            ),
          ];
          const { profiles, warnings: profileWarnings } = await loadReportProfiles([
            ...new Set([...donorIds, ...hardCreditDonorIds]),
          ]);
          profileWarnings.forEach((warning) => warnings.add(warning));

          const acknowledgmentRecipientIds = [
            ...new Set(
              acknowledgmentCredits
                .map((credit) => String(credit?.recipientConstituentId || "").trim())
                .filter((constituentId) => constituentId && !profiles.has(constituentId)),
            ),
          ];
          if (acknowledgmentRecipientIds.length) {
            const { profiles: recipientProfiles, warnings: recipientWarnings } =
              await loadReportProfiles(acknowledgmentRecipientIds);
            recipientProfiles.forEach((profile, constituentId) => profiles.set(constituentId, profile));
            recipientWarnings.forEach((warning) => warnings.add(warning));
          }

          for (const constituentId of donorIds) {
            const person = peopleByConstituentId.get(constituentId);
            const profile = profiles.get(constituentId);
            if (!profile) {
              warnings.add(
                "One donor could not be verified in NXT and was omitted from this report.",
              );
              continue;
            }

            if (profile.constituencyCodesVerified !== true) {
              warnings.add(
                "One donor could not be verified against current NXT constituency codes and was omitted from this report.",
              );
              continue;
            }

            if (isDonorAdvisedFund(profile)) {
              continue;
            }

            const selectedGiving = selectedGivingByConstituentId.get(constituentId);
            if (!selectedGiving) continue;
            const hardCreditRecordSolicitor = getConstituentRecordSolicitor(workspaceUser, person);
            for (const gift of selectedGiving.gifts) {
              mergeAcknowledgmentGiftGroup(reportGiftGroupsById, {
                giftId: gift.id,
                date: gift.date,
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
                Number(existingRow?.recognizedCommitted || 0) + selectedGiving.committed,
              ...latestGift,
              hardCreditDonors: existingRow?.hardCreditDonors || new Map(),
              acknowledgmentCreditIds: existingRow?.acknowledgmentCreditIds || new Set(),
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
            const hardCreditConstituentId = String(credit?.hardCreditConstituentId || "").trim();
            const recipientConstituentId = String(credit?.recipientConstituentId || "").trim();
            const hardCreditDonor = profiles.get(hardCreditConstituentId);
            const recipient = profiles.get(recipientConstituentId);
            if (!hardCreditDonor || !recipient || recipient.constituencyCodesVerified !== true) {
              warnings.add(
                "One soft-credit recipient could not be verified in NXT and was omitted from this report.",
              );
              continue;
            }
            if (isDonorAdvisedFund(recipient)) {
              continue;
            }

            const existingRow = reportRowsByConstituentId.get(recipientConstituentId);
            const recipientPortfolioPerson = peopleByConstituentId.get(recipientConstituentId);
            const recipientRecordSolicitor = recipientPortfolioPerson
              ? getConstituentRecordSolicitor(workspaceUser, recipientPortfolioPerson)
              : "Not in selected MGO portfolio";
            const hardCreditPortfolioPerson = peopleByConstituentId.get(hardCreditConstituentId);
            mergeAcknowledgmentGiftGroup(reportGiftGroupsById, {
              giftId: credit?.giftId,
              date: credit?.date,
              hardCreditDonor: {
                constituentId: hardCreditConstituentId,
                name: hardCreditDonor.name || "Unnamed donor",
              },
              hardCreditRecordSolicitor: hardCreditPortfolioPerson
                ? getConstituentRecordSolicitor(workspaceUser, hardCreditPortfolioPerson)
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
              credit?.giftId || `${credit?.date || "unknown"}:${credit?.amount || "unknown"}`,
              hardCreditConstituentId,
              recipientConstituentId,
            ].join(":");
            const acknowledgmentCreditIds = new Set(existingRow?.acknowledgmentCreditIds || []);
            const isNewAcknowledgmentCredit = !acknowledgmentCreditIds.has(acknowledgmentCreditKey);
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

          if (active) {
            setReportRows(materializeReportRows(reportRowsByConstituentId));
            setAcknowledgmentGiftGroups(
              materializeAcknowledgmentGiftGroups(reportGiftGroupsById),
            );
            setPeriod(reportPeriod);
            setReportWarnings(Array.from(warnings));
            setHardCreditTotals({
              received: totalHardReceived,
              committed: totalHardCommitted,
            });
          }
        }

        let nextBatchIndex = 0;
        async function batchWorker() {
          while (nextBatchIndex < batches.length) {
            const batch = batches[nextBatchIndex];
            nextBatchIndex += 1;
            try {
              await loadBatch(batch);
            } catch (error) {
              warnings.add(
                error instanceof Error ? error.message : "One report segment could not load.",
              );
              if (active) setReportWarnings(Array.from(warnings));
            }
          }
        }

        await Promise.all(
          Array.from({ length: Math.min(REPORT_BATCH_CONCURRENCY, batches.length) }, () =>
            batchWorker(),
          ),
        );

        if (!successfullyLoadedBatch) {
          throw new Error("Blackbaud could not load current fiscal-year gifts for this portfolio.");
        }

        if (active) {
          setPeriod(reportPeriod);
          setReportWarnings(Array.from(warnings));
          setHardCreditTotals({
            received: totalHardReceived,
            committed: totalHardCommitted,
          });
        }
      } catch (error) {
        if (active) {
          setReportRows([]);
          setAcknowledgmentGiftGroups([]);
          setPeriod(null);
          setReportError(
            error instanceof Error
              ? error.message
              : "Could not load current fiscal-year giving for this portfolio.",
          );
        }
      } finally {
        if (active) setIsLoadingReport(false);
      }
    }

    loadReport();
    return () => {
      active = false;
    };
  }, [refreshVersion, reportAccess?.canView, reportAccessError, reportAccessLoading, workspaceUser?.id]);

  async function handleWorkspaceChange(event) {
    const nextUserId = Number(event.target.value || 0);
    setIsSwitchingWorkspace(true);
    setReportError("");
    try {
      const response = nextUserId
        ? await fetch("/api/admin/workspace-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: nextUserId }),
          })
        : await fetch("/api/admin/workspace-user", { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not switch the MGO report workspace.");
      }
      window.location.assign("/reports");
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "Could not switch the MGO report workspace.",
      );
      setIsSwitchingWorkspace(false);
    }
  }

  const selectedMgoId = actingWorkspaceStatus?.actingUser?.id || "";
  const totalReceived = hardCreditTotals.received;
  const closedGiftSummaryIsLoading = closedGiftSummary === undefined;
  const closedGiftSummaryIsAvailable =
    Boolean(closedGiftSummary && typeof closedGiftSummary === "object");
  const totalCommitted = closedGiftSummaryIsAvailable
    ? Number(closedGiftSummary.closedThisFY || 0)
    : 0;
  const yearLabel = period?.yearLabel || closedGiftSummary?.currentFY || "Current FY";
  const closedYearLabel = closedGiftSummary?.currentFY || yearLabel;

  if (loadingUser || !user) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#64748B" }}>
        Loading reports...
      </main>
    );
  }

  if (reportAccessLoading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#64748B" }}>
        Checking report access...
      </main>
    );
  }

  if (reportAccessError) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#1D4ED8", fontWeight: 800 }}>Return to home</a>
          <div
            role="alert"
            style={{
              marginTop: "18px",
              border: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
              borderRadius: "14px",
              padding: "16px",
              fontWeight: 700,
            }}
          >
            {reportAccessError}
          </div>
        </div>
      </main>
    );
  }

  if (reportAccess?.canView !== true) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#1D4ED8", fontWeight: 800 }}>Return to home</a>
          <section
            style={{
              marginTop: "18px",
              backgroundColor: "white",
              border: "1px solid #E2E8F0",
              borderRadius: "18px",
              padding: "26px",
            }}
          >
            <h1 style={{ margin: 0, color: "#0F172A" }}>My Reports is not shared with you</h1>
            <p style={{ color: "#64748B", lineHeight: 1.55 }}>
              An Advancement Services user can change this report&apos;s audience in Report Access &amp; Configurations.
            </p>
            {canManageReports ? (
              <a href="/report-configurations" style={{ color: "#1D4ED8", fontWeight: 800 }}>
                Configure report access
              </a>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <SharedReportHeader
          activeReportKey="portfolio-fy-giving"
          title="My Reports"
          description="Review portfolio giving and shared engagement reports."
          backHref="/"
          backLabel="Return to home"
          accessibleReports={visibleReports}
          action={
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {canManageReports ? (
                <a
                  href="/report-configurations"
                  style={{
                    minHeight: "42px",
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: "10px",
                    border: "1px solid #BFDBFE",
                    backgroundColor: "white",
                    color: "#1D4ED8",
                    padding: "0 14px",
                    fontSize: "14px",
                    fontWeight: 800,
                  }}
                >
                  Configure access
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setRefreshVersion((version) => version + 1)}
                disabled={isLoadingReport || !workspaceUser}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  minHeight: "42px",
                  borderRadius: "10px",
                  border: "1px solid #BFDBFE",
                  backgroundColor: "white",
                  color: "#1D4ED8",
                  padding: "0 14px",
                  fontSize: "14px",
                  fontWeight: 800,
                  cursor: isLoadingReport ? "wait" : "pointer",
                }}
              >
                <RefreshCw size={17} />
                Refresh report
              </button>
            </div>
          }
        />

        {additionalReports.length ? (
          <section
            aria-label="Available reports"
            style={{
              marginBottom: "22px",
              backgroundColor: "white",
              border: "1px solid #E2E8F0",
              borderRadius: "18px",
              padding: "22px",
              boxShadow: "0 10px 28px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: "#0F172A", fontSize: "20px" }}>Available reports</h2>
              <p style={{ margin: "7px 0 0", color: "#64748B", lineHeight: 1.5 }}>
                These reports are enabled for you by Advancement Services. Opening one uses its existing data and refresh policy.
              </p>
            </div>
            <div
              style={{
                marginTop: "16px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "12px",
              }}
            >
              {additionalReports.map((configuration) => (
                <a
                  key={configuration.key}
                  href={getReportHref(configuration)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    minHeight: "156px",
                    border: "1px solid #C7D2FE",
                    backgroundColor: "#FAFAFF",
                    borderRadius: "14px",
                    padding: "16px",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ color: "#4338CA", fontSize: "12px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {configuration.reportTypeLabel || "Shared report"}
                  </span>
                  <strong style={{ color: "#0F172A", fontSize: "17px" }}>{configuration.title}</strong>
                  <span style={{ color: "#64748B", lineHeight: 1.45, flex: 1 }}>
                    {configuration.description || "Open this shared report."}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#4338CA", fontSize: "14px", fontWeight: 800 }}>
                    Open report <ExternalLink size={15} />
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section
          style={{
            backgroundColor: "white",
            border: "1px solid #E2E8F0",
            borderRadius: "18px",
            padding: "22px",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "18px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, color: "#0F172A", fontSize: "20px" }}>
                {yearLabel} portfolio giving
              </h2>
              <p style={{ margin: "7px 0 0", color: "#64748B", lineHeight: 1.5, maxWidth: "760px" }}>
                Every total and row is limited to gifts where NXT lists the selected MGO as a Gift
                Solicitor. Direct hard-credit totals include Donor Advised Fund gifts; Donor Advised Fund
                entities are excluded from acknowledgment recipients.
              </p>
            </div>
            {canUseExecutiveView ? (
              <label style={{ display: "grid", gap: "7px", minWidth: "250px", color: "#334155", fontSize: "13px", fontWeight: 800 }}>
                Report for MGO
                <select
                  name="report-mgo-workspace"
                  value={selectedMgoId}
                  onChange={handleWorkspaceChange}
                  disabled={isSwitchingWorkspace}
                  style={{
                    minHeight: "44px",
                    borderRadius: "10px",
                    border: "1px solid #CBD5E1",
                    backgroundColor: "white",
                    color: "#0F172A",
                    padding: "0 12px",
                    fontSize: "15px",
                  }}
                >
                  <option value="">My MGO workspace</option>
                  {mgoUsers
                    .filter((candidate) => isMgoRole(candidate?.role))
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name || candidate.email}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </div>
          {workspaceUser ? (
            <div
              style={{
                marginTop: "16px",
                borderRadius: "12px",
                backgroundColor: "#EFF6FF",
                color: "#1E40AF",
                padding: "11px 13px",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              Showing {workspaceUser.name || workspaceUser.email || "the selected MGO"}&apos;s portfolio.
            </div>
          ) : null}
        </section>

        {reportError ? (
          <div
            role="alert"
            style={{
              marginTop: "18px",
              border: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
              borderRadius: "14px",
              padding: "14px 16px",
              fontWeight: 700,
            }}
          >
            {reportError}
          </div>
        ) : null}

        {reportWarnings.length > 0 ? (
          <div
            role="status"
            style={{
              marginTop: "18px",
              border: "1px solid #FDE68A",
              backgroundColor: "#FFFBEB",
              color: "#92400E",
              borderRadius: "14px",
              padding: "14px 16px",
              fontWeight: 700,
            }}
          >
            Some gift records could not be read. The report includes the remaining portfolio data.
          </div>
        ) : null}

        {isLoadingReport ? (
          <div style={{ marginTop: "24px", color: "#64748B", fontWeight: 700 }}>
            {reportRows.length
              ? "Loading the remaining portfolio records..."
              : `Loading ${yearLabel} gift records for this portfolio...`}
          </div>
        ) : null}

        {!reportError ? (
          <>
            <section
              aria-label="Report totals"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
                marginTop: "24px",
              }}
            >
              <MetricCard
                label={`${yearLabel} Total Cash Received`}
                value={formatCurrency(totalReceived)}
                hint="Gift-solicitor-attributed hard-credit revenue, including DAF gifts"
              />
              <MetricCard
                label={`${closedYearLabel} Total Committed`}
                value={
                  closedGiftSummaryIsLoading
                    ? "Loading..."
                    : closedGiftSummaryIsAvailable
                      ? formatCurrency(totalCommitted)
                      : "Unavailable"
                }
                hint={
                  closedGiftSummaryIsLoading
                    ? "Loading the My Prospects closed-gift total from Raiser's Edge NXT."
                    : closedGiftSummaryIsAvailable
                      ? "Closed gifts credited to this MGO in Raiser's Edge NXT, matching My Prospects."
                      : "The My Prospects closed-gift total could not be loaded."
                }
              />
              <MetricCard
                label="Acknowledgment recipients"
                value={reportRows.length}
                hint="Individuals with direct or soft-credit recognition"
              />
            </section>

            <section
              style={{
                marginTop: "24px",
                backgroundColor: "white",
                border: "1px solid #E2E8F0",
                borderRadius: "18px",
                boxShadow: "0 10px 28px rgba(15, 23, 42, 0.05)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "20px 22px 14px" }}>
                <h2 style={{ margin: 0, color: "#0F172A", fontSize: "20px" }}>Acknowledgment detail</h2>
                <p style={{ margin: "6px 0 0", color: "#64748B", lineHeight: 1.5 }}>
                  Grouped by gift, newest first. Each group starts with the hard-credit donor and lists
                  any related soft-credit recipients beneath it. Donor Advised Fund entities appear as
                  gift context but are excluded from the acknowledgment-recipient total.
                </p>
              </div>
              {acknowledgmentGiftGroups.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "1180px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#F8FAFC", textAlign: "left" }}>
                        {[
                          "Donor / recipient",
                          "Constituent record solicitor",
                          "Relationship to gift",
                          "Gift solicitor(s)",
                          `${yearLabel} Cash Received`,
                          `${yearLabel} Committed`,
                          "Gift Date",
                          "Record",
                        ].map((heading) => (
                          <th
                            key={heading}
                            scope="col"
                            style={{
                              color: "#475569",
                              fontSize: "11px",
                              fontWeight: 800,
                              letterSpacing: "0.05em",
                              padding: "13px 16px",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {acknowledgmentGiftGroups.map((group, groupIndex) => {
                      const hardCreditProfileUrl = buildBlackbaudConstituentProfileUrl(
                        group.hardCreditDonor?.constituentId,
                      );
                      const groupBorder = groupIndex === 0 ? "1px solid #E2E8F0" : "8px solid #E2E8F0";
                      return (
                        <tbody key={group.key}>
                          <tr style={{ backgroundColor: "#F8FAFC", borderTop: groupBorder }}>
                            <td style={{ padding: "16px", color: "#0F172A" }}>
                              <span
                                style={{
                                  color: "#64748B",
                                  display: "block",
                                  fontSize: "10px",
                                  fontWeight: 800,
                                  letterSpacing: "0.06em",
                                  marginBottom: "5px",
                                  textTransform: "uppercase",
                                }}
                              >
                                Hard-credit donor
                              </span>
                              <strong>{group.hardCreditDonor?.name || "Unnamed donor"}</strong>
                            </td>
                            <td style={{ padding: "16px", color: "#334155", lineHeight: 1.45 }}>
                              {group.hardCreditRecordSolicitor || "Not in selected MGO portfolio"}
                            </td>
                            <td style={{ padding: "16px" }}>
                              <span
                                style={{
                                  backgroundColor: "#DBEAFE",
                                  borderRadius: "999px",
                                  color: "#1D4ED8",
                                  display: "inline-flex",
                                  fontSize: "12px",
                                  fontWeight: 800,
                                  padding: "5px 9px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Hard credit
                              </span>
                            </td>
                            <td style={{ padding: "16px", color: "#334155", lineHeight: 1.45 }}>
                              {formatGiftSolicitors(group.giftSolicitors)}
                            </td>
                            <td style={{ padding: "16px", color: "#047857", fontWeight: 800 }}>
                              {formatCurrency(group.receivedAmount)}
                            </td>
                            <td style={{ padding: "16px", color: "#1D4ED8", fontWeight: 800 }}>
                              {formatCurrency(group.committedAmount)}
                            </td>
                            <td style={{ padding: "16px", color: "#334155", whiteSpace: "nowrap" }}>
                              {group.date ? formatGiftDate(group.date) : "Unavailable"}
                            </td>
                            <td style={{ padding: "16px" }}>
                              {hardCreditProfileUrl ? (
                                <a
                                  href={hardCreditProfileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    alignItems: "center",
                                    border: "1px solid #BFDBFE",
                                    borderRadius: "9px",
                                    color: "#1D4ED8",
                                    display: "inline-flex",
                                    fontSize: "13px",
                                    fontWeight: 800,
                                    gap: "6px",
                                    padding: "8px 10px",
                                    textDecoration: "none",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Open NXT record <ExternalLink size={14} />
                                </a>
                              ) : (
                                "Unavailable"
                              )}
                            </td>
                          </tr>
                          {group.softCreditRecipients.map((recipient) => {
                            const recipientProfileUrl = buildBlackbaudConstituentProfileUrl(
                              recipient.constituentId,
                            );
                            return (
                              <tr
                                key={`${group.key}:${recipient.constituentId}`}
                                style={{ borderTop: "1px solid #E2E8F0" }}
                              >
                                <td style={{ padding: "14px 16px 14px 34px", color: "#0F172A" }}>
                                  <div style={{ borderLeft: "3px solid #A7F3D0", paddingLeft: "12px" }}>
                                    <span
                                      style={{
                                        color: "#047857",
                                        display: "block",
                                        fontSize: "10px",
                                        fontWeight: 800,
                                        letterSpacing: "0.06em",
                                        marginBottom: "4px",
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      Soft-credit recipient
                                    </span>
                                    <strong>{recipient.name}</strong>
                                  </div>
                                </td>
                                <td style={{ padding: "14px 16px", color: "#334155", lineHeight: 1.45 }}>
                                  {recipient.constituentRecordSolicitor}
                                </td>
                                <td style={{ padding: "14px 16px" }}>
                                  <span
                                    style={{
                                      backgroundColor: "#D1FAE5",
                                      borderRadius: "999px",
                                      color: "#047857",
                                      display: "inline-flex",
                                      fontSize: "12px",
                                      fontWeight: 800,
                                      padding: "5px 9px",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Soft credit
                                  </span>
                                </td>
                                <td style={{ padding: "14px 16px", color: "#64748B" }}>Same gift</td>
                                <td style={{ padding: "14px 16px", color: "#047857", fontWeight: 800 }}>
                                  {formatCurrency(recipient.amount)}
                                </td>
                                <td style={{ padding: "14px 16px", color: "#94A3B8" }}>-</td>
                                <td style={{ padding: "14px 16px", color: "#64748B" }}>Same gift</td>
                                <td style={{ padding: "14px 16px" }}>
                                  {recipientProfileUrl ? (
                                    <a
                                      href={recipientProfileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        alignItems: "center",
                                        border: "1px solid #BFDBFE",
                                        borderRadius: "9px",
                                        color: "#1D4ED8",
                                        display: "inline-flex",
                                        fontSize: "13px",
                                        fontWeight: 800,
                                        gap: "6px",
                                        padding: "8px 10px",
                                        textDecoration: "none",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Open NXT record <ExternalLink size={14} />
                                    </a>
                                  ) : (
                                    "Unavailable"
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      );
                    })}
                  </table>
                </div>
              ) : (
                <div style={{ borderTop: "1px solid #E2E8F0", color: "#64748B", padding: "24px 22px" }}>
                  No acknowledgment recipients or recognized gift records were found for this portfolio in {yearLabel}.
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

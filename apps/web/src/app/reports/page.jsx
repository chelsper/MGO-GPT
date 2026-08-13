"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import useUser from "@/utils/useUser";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { canUseExecutiveViewRole } from "@/utils/workspaceRoles";

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

function materializeReportRows(rowsByConstituentId) {
  return sortReportRows(
    Array.from(rowsByConstituentId.values()).map((row) => ({
      ...row,
      hardCreditDonors: Array.from(row.hardCreditDonors?.values() || []).sort((left, right) =>
        left.name.localeCompare(right.name, "en"),
      ),
    })),
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
  const [period, setPeriod] = useState(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportWarnings, setReportWarnings] = useState([]);
  const [hardCreditTotals, setHardCreditTotals] = useState({ received: 0, committed: 0 });
  const [refreshVersion, setRefreshVersion] = useState(0);

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
    if (!workspaceUser?.id) return undefined;

    let active = true;
    async function loadReport() {
      setIsLoadingReport(true);
      setReportError("");
      setReportWarnings([]);
      setReportRows([]);
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
        const portfolioConstituentIds = new Set(constituentIds);
        const reportRowsByConstituentId = new Map();
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

          for (const constituentId of batch) {
            const giving = givingPayload?.byConstituentId?.[constituentId] || {};
            totalHardReceived += Number(giving.hardReceived || 0);
            totalHardCommitted += Number(giving.hardCommitted || 0);
          }

          const donorIds = batch.filter((constituentId) => {
            const giving = givingPayload?.byConstituentId?.[constituentId] || {};
            return Number(giving.recognizedReceived || 0) > 0 || Number(giving.recognizedCommitted || 0) > 0;
          });
          const hardCreditDonorIds = [
            ...new Set(
              (Array.isArray(givingPayload?.acknowledgmentCredits)
                ? givingPayload.acknowledgmentCredits
                : []
              )
                .map((credit) => String(credit?.hardCreditConstituentId || "").trim())
                .filter(Boolean),
            ),
          ];
          const { profiles, warnings: profileWarnings } = await loadReportProfiles([
            ...new Set([...donorIds, ...hardCreditDonorIds]),
          ]);
          profileWarnings.forEach((warning) => warnings.add(warning));

          const acknowledgmentCredits = Array.isArray(givingPayload?.acknowledgmentCredits)
            ? givingPayload.acknowledgmentCredits
            : [];
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

            const giving = givingPayload?.byConstituentId?.[constituentId] || {};
            const existingRow = reportRowsByConstituentId.get(constituentId);
            reportRowsByConstituentId.set(constituentId, {
              ...existingRow,
              constituentId,
              name: profile.name || person?.name || "Unnamed constituent",
              recognizedReceived: Number(giving.recognizedReceived || 0),
              recognizedCommitted: Number(giving.recognizedCommitted || 0),
              lastGiftDate: giving.lastGiftDate || null,
              lastGiftAmount: giving.lastGiftAmount == null ? null : Number(giving.lastGiftAmount),
              hardCreditDonors: existingRow?.hardCreditDonors || new Map(),
            });
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
            const isPortfolioRecipient = portfolioConstituentIds.has(recipientConstituentId);
            const latestGift = getLatestGiftDetails(existingRow, {
              date: credit?.date,
              amount: credit?.amount,
            });
            const nextRow = {
              ...existingRow,
              constituentId: recipientConstituentId,
              name: recipient.name || existingRow?.name || "Unnamed constituent",
              recognizedReceived: isPortfolioRecipient
                ? Number(existingRow?.recognizedReceived || 0)
                : Number(existingRow?.recognizedReceived || 0) + Number(credit?.amount || 0),
              recognizedCommitted: Number(existingRow?.recognizedCommitted || 0),
              ...latestGift,
              hardCreditDonors: existingRow?.hardCreditDonors || new Map(),
            };
            addHardCreditDonor(nextRow, {
              constituentId: hardCreditConstituentId,
              name: hardCreditDonor.name || "Donor Advised Fund",
            });
            reportRowsByConstituentId.set(recipientConstituentId, nextRow);
          }

          if (active) {
            setReportRows(materializeReportRows(reportRowsByConstituentId));
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
  }, [refreshVersion, workspaceUser?.id]);

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
  const totalCommitted = hardCreditTotals.committed;
  const yearLabel = period?.yearLabel || "Current FY";

  if (loadingUser || !user) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#64748B" }}>
        Loading reports...
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "18px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <a
              href="/"
              aria-label="Return to home"
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                display: "grid",
                placeItems: "center",
                color: "#374151",
                backgroundColor: "white",
              }}
            >
              <ArrowLeft size={20} />
            </a>
            <div>
              <h1 style={{ margin: 0, fontSize: "30px", color: "#0F172A" }}>Reports</h1>
              <p style={{ margin: "6px 0 0", color: "#64748B", lineHeight: 1.5 }}>
                Review portfolio giving without adding background work to My Prospects.
              </p>
            </div>
          </div>
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
                Headline totals use all direct hard-credit gift records, including Donor Advised Funds. The acknowledgment list uses the individuals who receive direct or soft-credit recognition.
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
                    .filter((candidate) => candidate?.role === "mgo")
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
                hint="Hard-credit revenue, including DAF gifts"
              />
              <MetricCard
                label={`${yearLabel} Total Committed`}
                value={formatCurrency(totalCommitted)}
                hint="Hard-credit gift commitments only"
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
                  Alphabetized by last name. A soft-credit recipient is shown with the related hard-credit
                  donor. Donor Advised Fund entities do not appear as acknowledgment recipients.
                </p>
              </div>
              {reportRows.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "1020px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#F8FAFC", textAlign: "left" }}>
                        {[
                          "Acknowledgment recipient",
                          "Hard-credit donor",
                          `${yearLabel} Recognition Credit`,
                          `${yearLabel} Recognized Committed`,
                          "Last Gift Date",
                          "Last Gift Amount",
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
                    <tbody>
                      {reportRows.map((row) => {
                        const profileUrl = buildBlackbaudConstituentProfileUrl(row.constituentId);
                        return (
                          <tr key={row.constituentId} style={{ borderTop: "1px solid #E2E8F0" }}>
                            <td style={{ padding: "16px", color: "#0F172A", fontWeight: 800 }}>{row.name}</td>
                            <td style={{ padding: "16px", color: "#334155", lineHeight: 1.45 }}>
                              {row.hardCreditDonors?.length
                                ? row.hardCreditDonors.map((donor) => donor.name).join(", ")
                                : "Direct credit"}
                            </td>
                            <td style={{ padding: "16px", color: "#047857", fontWeight: 800 }}>
                              {formatCurrency(row.recognizedReceived)}
                            </td>
                            <td style={{ padding: "16px", color: "#1D4ED8", fontWeight: 800 }}>
                              {formatCurrency(row.recognizedCommitted)}
                            </td>
                            <td style={{ padding: "16px", color: "#334155" }}>
                              {row.lastGiftDate ? formatGiftDate(row.lastGiftDate) : "Unavailable"}
                            </td>
                            <td style={{ padding: "16px", color: "#334155", fontWeight: 700 }}>
                              {row.lastGiftAmount == null ? "Unavailable" : formatCurrency(row.lastGiftAmount)}
                            </td>
                            <td style={{ padding: "16px" }}>
                              {profileUrl ? (
                                <a
                                  href={profileUrl}
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

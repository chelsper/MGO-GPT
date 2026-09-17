"use client";

import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { PortfolioCard } from "@/components/PortfolioWorklist";
import PortfolioContactDetails from "@/components/PortfolioContactDetails";
import ActivePledgeNotice from "@/components/ActivePledgeNotice";
import { mergeSavedPortfolioContacts } from "@/utils/portfolioContacts";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { AnnualGivingSocietyBadge, CurrentFiscalYearGiving, formatBlackbaudCurrency } from "./ProspectGiving";
import { buildPortfolioUpdateHref, nxtProfileLinkStyle, smallActionButton } from "./prospectPresentation";
import usePortfolioSummary from "./usePortfolioSummary";

export default function PortfolioTier({
  title,
  description,
  items,
  accent,
  onAddToTopProspects,
  isAdding,
  isReadOnly = false,
  topProspectConstituentIds = new Set(),
  topProspectByConstituentId = new Map(),
  onRemoveFromTopProspects,
  isRemovingFromTopProspects = false,
  onRemoveSolicitorAssignment,
  allowSolicitorAssignmentRemoval = true,
  allowNxtSummary = true,
  onOpenPortfolioNextStep,
  onOpenPortfolioDiscussion,
  isRemovingSolicitorAssignment = false,
  removingSolicitorConstituentId = "",
  annualGivingSocietiesByConstituentId = {},
  currentFiscalYearGivingByConstituentId = {},
  currentFiscalYearLabel = "",
  portfolioCategories = [],
  portfolioCategoryByConstituentId = {},
  onMovePortfolioCategory,
  movingPortfolioCategoryConstituentId = "",
  density = "detailed",
  signals = new Map(),
  pledgeData,
  totalCount = items.length,
  emptyMessage = "No current constituents in this tier right now.",
}) {
  const { expandedSummaries, summaryStates, loadSummary, toggleSummary } = usePortfolioSummary({ allowNxtSummary });
  const hasLifetimeGiving = (person) =>
    person?.lifetimeGiving?.totalGiving !== null &&
    person?.lifetimeGiving?.totalGiving !== undefined &&
    Number.isFinite(Number(person.lifetimeGiving.totalGiving));

  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "14px",
        border: "1px solid #E5E7EB",
        padding: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "baseline",
          flexWrap: "wrap",
          marginBottom: "8px",
        }}
      >
        <div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#111827" }}>
            {title}
          </div>
          <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
            {description}
          </div>
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: "999px",
            backgroundColor: accent.background,
            color: accent.text,
            fontSize: "12px",
            fontWeight: "700",
          }}
        >
          {items.length < totalCount ? `${items.length} of ${totalCount}` : totalCount} constituent{totalCount === 1 ? "" : "s"}
        </div>
      </div>

      {items.length ? (
        <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
          {items.map((person) => (
            <PortfolioCard
              key={person.constituentId}
              person={person}
              signal={signals.get(String(person.constituentId))}
              density={density}
              isTopProspect={topProspectConstituentIds.has(String(person.constituentId))}
            >
              {(() => {
                const isTopProspect = topProspectConstituentIds.has(
                  String(person.constituentId || ""),
                );
                const topProspect = topProspectByConstituentId.get(
                  String(person.constituentId || ""),
                );
                const summaryState = summaryStates[person.constituentId];
                const isSummaryExpanded = Boolean(
                  expandedSummaries[person.constituentId],
                );
                const narrativeSummary =
                  summaryState?.payload?.mapped?.prospectSummaryNarrative || "";
                const contactPerson = mergeSavedPortfolioContacts(
                  person,
                  summaryState?.contactDetails,
                  { checkedAt: summaryState?.contactDetails?.contactCheckedAt },
                );
                const portfolioGivingSocieties =
                  annualGivingSocietiesByConstituentId[
                    String(person.constituentId || "")
                  ];
                const annualGivingSocieties =
                  portfolioGivingSocieties ||
                  summaryState?.payload?.mapped?.annualGivingSocieties ||
                  null;
                const currentFiscalYearGiving =
                  currentFiscalYearGivingByConstituentId[
                    String(person.constituentId || "")
                  ];
                const portfolioCategory =
                  portfolioCategoryByConstituentId[
                    String(person.constituentId || "")
                  ] || null;
                const nxtProfileUrl = buildBlackbaudConstituentProfileUrl(
                  person.constituentId,
                );
                const isRemovingThisSolicitorAssignment =
                  isRemovingSolicitorAssignment &&
                  String(removingSolicitorConstituentId || "") ===
                    String(person.constituentId || "");
                const isMovingThisPortfolioCategory =
                  String(movingPortfolioCategoryConstituentId || "") ===
                  String(person.constituentId || "");

                return (
                  <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>
                    {person.name || "Unnamed constituent"}
                  </div>
                  {isTopProspect ? (
                    <span
                      title="Already in your Top Prospects list"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "5px 9px",
                        borderRadius: "999px",
                        backgroundColor: "#FEF3C7",
                        color: "#92400E",
                        border: "1px solid #FDE68A",
                        fontSize: "11px",
                        fontWeight: 800,
                      }}
                    >
                      <Star size={13} fill="currentColor" />
                      Top Prospect
                    </span>
                  ) : null}
                  {portfolioCategory ? (
                    <span
                      title="MGO portfolio category"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "5px 9px",
                        borderRadius: "999px",
                        backgroundColor: "#E0E7FF",
                        color: "#3730A3",
                        border: "1px solid #C7D2FE",
                        fontSize: "11px",
                        fontWeight: 800,
                      }}
                    >
                      {portfolioCategory.displayName || portfolioCategory.name}
                    </span>
                  ) : null}
                  <AnnualGivingSocietyBadge annualGivingSocieties={annualGivingSocieties} />
                </div>
                {person.lookupId ? (
                  <div
                    style={{
                      padding: "5px 10px",
                      borderRadius: "999px",
                      backgroundColor: "#EEF2FF",
                      color: "#4338CA",
                      fontSize: "12px",
                      fontWeight: "700",
                    }}
                  >
                    Lookup ID: {person.lookupId}
                  </div>
                ) : null}
              </div>
              <PortfolioContactDetails person={contactPerson} />
              <CurrentFiscalYearGiving
                giving={currentFiscalYearGiving}
                yearLabel={currentFiscalYearLabel}
              />
              <ActivePledgeNotice
                status={pledgeData?.byConstituentId?.[String(person.constituentId)]}
                incomplete={pledgeData?.incomplete}
              />
              <div
                style={{
                  marginTop: "4px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #DBEAFE",
                  backgroundColor: "#EFF6FF",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSummary(person.constituentId)}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    border: "none",
                    backgroundColor: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    color: "#1D4ED8",
                    fontSize: "13px",
                    fontWeight: "700",
                  }}
                >
                  <span>NXT Summary</span>
                  {isSummaryExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isSummaryExpanded ? (
                  <div style={{ marginTop: "10px" }}>
                    {summaryState?.status === "loading" ? (
                      <div style={{ fontSize: "13px", color: "#4B5563" }}>
                        Loading NXT summary...
                      </div>
                    ) : summaryState?.status === "error" ? (
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#991B1B",
                          backgroundColor: "#FEF2F2",
                          border: "1px solid #FECACA",
                          borderRadius: "8px",
                          padding: "10px 12px",
                        }}
                      >
                        {summaryState.error || "Linked Blackbaud data could not be loaded right now."}
                      </div>
                    ) : narrativeSummary ? (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "10px",
                          backgroundColor: "white",
                          border: "1px solid #BFDBFE",
                          fontSize: "14px",
                          lineHeight: 1.7,
                          color: "#1F2937",
                        }}
                      >
                        {narrativeSummary}
                        {summaryState?.payload?.summaryRefreshedAt ? (
                          <div style={{ marginTop: "8px", fontSize: "11px", color: "#64748B" }}>
                            Intelligence snapshot: {new Date(summaryState.payload.summaryRefreshedAt).toLocaleString()}.
                            {summaryState.payload.givingRefreshedAt
                              ? ` Giving figures updated: ${new Date(summaryState.payload.givingRefreshedAt).toLocaleString()}.`
                              : ""}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          backgroundColor: "white",
                          border: "1px solid #DBEAFE",
                          fontSize: "13px",
                          color: "#4B5563",
                        }}
                      >
                        No concise NXT summary is available for this constituent yet.
                      </div>
                    )}
                    {allowNxtSummary && summaryState?.status !== "loading" ? (
                      <button
                        type="button"
                        onClick={() => loadSummary(person.constituentId, { refresh: true })}
                        style={{ ...smallActionButton, marginTop: "8px" }}
                      >
                        Refresh this summary
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: "4px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#6B7280" }}>
                  {person.assignmentTypes?.join(" · ")}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  {hasLifetimeGiving(person) ? (
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                      Lifetime giving:{" "}
                      {formatBlackbaudCurrency(person.lifetimeGiving?.totalGiving)}
                    </div>
                  ) : null}
                  {nxtProfileUrl ? (
                    <a
                      href={nxtProfileUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={nxtProfileLinkStyle}
                    >
                      Open NXT profile
                    </a>
                  ) : null}
                  {!isReadOnly ? (
                    <>
                      {portfolioCategories.length ? (
                        <label
                          style={{
                            display: "grid",
                            gap: "5px",
                            minWidth: "168px",
                            flex: "1 1 168px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "800",
                              color: "#6B7280",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Portfolio category
                          </span>
                          <select
                            aria-label={`Move ${person.name || "constituent"} to portfolio category`}
                            value={portfolioCategory?.id ? String(portfolioCategory.id) : ""}
                            onChange={(event) =>
                              onMovePortfolioCategory?.(person, event.target.value || null)
                            }
                            disabled={isMovingThisPortfolioCategory}
                            style={{
                              minWidth: 0,
                              border: "1px solid #C7D2FE",
                              borderRadius: "8px",
                              padding: "8px 10px",
                              fontSize: "12px",
                              fontWeight: "700",
                              color: "#3730A3",
                              backgroundColor: "white",
                              cursor: isMovingThisPortfolioCategory
                                ? "not-allowed"
                                : "pointer",
                              opacity: isMovingThisPortfolioCategory ? 0.7 : 1,
                            }}
                          >
                            <option value="">Uncategorized</option>
                            {portfolioCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.displayName || category.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onOpenPortfolioNextStep?.(person)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border: "1px solid #BFDBFE",
                          backgroundColor: "#EFF6FF",
                          color: "#1D4ED8",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                        }}
                      >
                        Set next step
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenPortfolioDiscussion?.(person)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border: "1px solid #DDD6FE",
                          backgroundColor: "#F5F3FF",
                          color: "#6D28D9",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                        }}
                      >
                        Team discussion
                      </button>
                      <a
                        href={buildPortfolioUpdateHref(person, "action")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border: "1px solid #C7D2FE",
                          backgroundColor: "#EEF2FF",
                          color: "#4338CA",
                          fontSize: "12px",
                          fontWeight: "700",
                          textDecoration: "none",
                        }}
                      >
                        Log action
                      </a>
                      <a
                        href={buildPortfolioUpdateHref(person, "opportunity")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border: "1px solid #A7F3D0",
                          backgroundColor: "#ECFDF5",
                          color: "#047857",
                          fontSize: "12px",
                          fontWeight: "700",
                          textDecoration: "none",
                        }}
                      >
                        Add opportunity
                      </a>
                      {allowSolicitorAssignmentRemoval ? (
                        <button
                          type="button"
                          onClick={() => onRemoveSolicitorAssignment?.(person)}
                          disabled={isRemovingSolicitorAssignment}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "8px 12px",
                            borderRadius: "999px",
                            border: "1px solid #FECACA",
                            backgroundColor: "#FEF2F2",
                            color: "#991B1B",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: isRemovingSolicitorAssignment
                              ? "not-allowed"
                              : "pointer",
                            opacity: isRemovingSolicitorAssignment ? 0.7 : 1,
                          }}
                        >
                          {isRemovingThisSolicitorAssignment
                            ? "Removing..."
                            : "Remove me as solicitor"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {isTopProspect && !isReadOnly ? (
                    <button
                      type="button"
                      onClick={() => onRemoveFromTopProspects?.(topProspect)}
                      disabled={isRemovingFromTopProspects || !topProspect?.id}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: "1px solid #FDE68A",
                        backgroundColor: "#FFFBEB",
                        color: "#92400E",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor:
                          isRemovingFromTopProspects || !topProspect?.id
                            ? "not-allowed"
                            : "pointer",
                        opacity: isRemovingFromTopProspects || !topProspect?.id ? 0.7 : 1,
                      }}
                    >
                      {isRemovingFromTopProspects
                        ? "Removing..."
                        : "Remove from Top Prospects"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isReadOnly && !isTopProspect) {
                          onAddToTopProspects?.(person);
                        }
                      }}
                      disabled={isAdding || isTopProspect || isReadOnly}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: isTopProspect ? "1px solid #FDE68A" : "1px solid #C7D2FE",
                        backgroundColor: isTopProspect ? "#FFFBEB" : "white",
                        color: isTopProspect ? "#92400E" : "#4338CA",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: isAdding || isTopProspect || isReadOnly ? "not-allowed" : "pointer",
                      }}
                    >
                      {isTopProspect
                        ? "Already in Top Prospects"
                        : isReadOnly
                          ? "Read-only view"
                          : "Add to Top Prospects"}
                    </button>
                  )}
                </div>
              </div>
                  </>
                );
              })()}
            </PortfolioCard>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: "12px", fontSize: "13px", color: "#6B7280", lineHeight: 1.6 }}>
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

"use client";

import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { PortfolioCard } from "@/components/PortfolioWorklist";
import PortfolioCardActions from "./PortfolioCardActions";
import PortfolioContactDetails, { PortfolioContactLocation } from "@/components/PortfolioContactDetails";
import PortfolioActivityDetails from "@/components/PortfolioActivityDetails";
import ActivePledgeNotice from "@/components/ActivePledgeNotice";
import DonorBriefing from "@/components/DonorBriefing";
import RelationshipOriginator from "@/components/RelationshipOriginator";
import { useWorkspaceLabels } from "@/components/WorkspaceTerminology";
import { mergeSavedPortfolioContacts } from "@/utils/portfolioContacts";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { AnnualGivingSocietyBadge, CurrentFiscalYearGiving, formatBlackbaudCurrency } from "./ProspectGiving";
import { nxtProfileLinkStyle, smallActionButton } from "./prospectPresentation";
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
  onOpenPortfolioLogAction,
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
  const { mgo: fundraiserLabel } = useWorkspaceLabels();
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
              actions={!isReadOnly && <PortfolioCardActions
                key={density}
                person={person}
                isReadOnly={isReadOnly}
                fundraiserLabel={fundraiserLabel}
                onOpenPortfolioNextStep={onOpenPortfolioNextStep}
                onOpenPortfolioDiscussion={onOpenPortfolioDiscussion}
                onOpenPortfolioLogAction={onOpenPortfolioLogAction}
                onAddToTopProspects={onAddToTopProspects}
                isAdding={isAdding}
                isTopProspect={topProspectConstituentIds.has(String(person.constituentId))}
                topProspect={topProspectByConstituentId.get(String(person.constituentId || ""))}
                onRemoveFromTopProspects={onRemoveFromTopProspects}
                isRemovingFromTopProspects={isRemovingFromTopProspects}
                allowSolicitorAssignmentRemoval={allowSolicitorAssignmentRemoval}
                onRemoveSolicitorAssignment={onRemoveSolicitorAssignment}
                isRemovingSolicitorAssignment={isRemovingSolicitorAssignment}
                removingSolicitorConstituentId={removingSolicitorConstituentId}
              />}
              isTopProspect={topProspectConstituentIds.has(String(person.constituentId))}
              categoryName={portfolioCategoryByConstituentId[String(person.constituentId)]?.displayName || portfolioCategoryByConstituentId[String(person.constituentId)]?.name || "Uncategorized"}
              location={<PortfolioContactLocation person={mergeSavedPortfolioContacts(
                person,
                summaryStates[person.constituentId]?.contactDetails,
                { checkedAt: summaryStates[person.constituentId]?.contactDetails?.contactCheckedAt },
              )} />}
            >
              {(() => {
                const isTopProspect = topProspectConstituentIds.has(
                  String(person.constituentId || ""),
                );
                const summaryState = summaryStates[person.constituentId];
                const isSummaryExpanded = Boolean(
                  expandedSummaries[person.constituentId],
                );
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
                      title={`${fundraiserLabel} portfolio category`}
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
              <PortfolioActivityDetails activity={person.savedActivity} />
              {!isReadOnly && allowNxtSummary && person.constituentId && <RelationshipOriginator key={person.constituentId} constituentId={person.constituentId} />}
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
                  aria-expanded={isSummaryExpanded}
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
                  <span>Donor briefing</span>
                  {isSummaryExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isSummaryExpanded ? (
                  <div style={{ marginTop: "10px" }}>
                    {summaryState?.status === "loading" ? (
                      <div style={{ fontSize: "13px", color: "#4B5563" }}>
                        Loading background details...
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
                    ) : null}
                    <DonorBriefing
                      constituentId={person.constituentId}
                      name={person.name}
                      summary={summaryState?.payload}
                      activity={person.savedActivity}
                      signal={signals.get(String(person.constituentId))}
                      pledgeStatus={pledgeData?.byConstituentId?.[String(person.constituentId)]}
                      pledgeIncomplete={pledgeData?.incomplete}
                    />
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
                    </>
                  ) : null}

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

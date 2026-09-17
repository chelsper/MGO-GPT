import { ChevronDown, ChevronUp } from "lucide-react";
import ActivePledgeNotice from "@/components/ActivePledgeNotice";
import {
  AnnualGivingSocietyBadge,
  formatBlackbaudCurrency,
} from "./ProspectGiving";
import { nxtProfileLinkStyle } from "./prospectPresentation";
import {
  workspaceCardStyle,
  sectionEyebrowStyle,
} from "./prospectDetailPresentation";

export default function ProspectDetailSummary({
  linkedBlackbaudConstituentId,
  linkedBlackbaudConstituentProfileUrl,
  blackbaudSummary,
  blackbaudSummaryLoading,
  blackbaudSummaryError,
  pledgeData,
  showBlackbaudNarrativeSummary,
  onToggleNarrative,
}) {
  const blackbaudConstituent = blackbaudSummary?.mapped?.constituent || null;
  const blackbaudLifetimeGiving =
    blackbaudSummary?.mapped?.lifetimeGiving || null;
  const annualGivingSocieties =
    blackbaudSummary?.mapped?.annualGivingSocieties || null;
  const blackbaudNarrativeSummary =
    blackbaudSummary?.mapped?.prospectSummaryNarrative || "";
  const blackbaudProposalSummary =
    blackbaudSummary?.mapped?.proposalSummary || [];
  return (
    <>
      {linkedBlackbaudConstituentId ? (
        <div
          style={{
            ...workspaceCardStyle,
            borderColor: "#BFDBFE",
            backgroundColor: "#EFF6FF",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "flex-start",
              marginBottom: "10px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "700",
                  color: "#1D4ED8",
                }}
              >
                Blackbaud Summary
              </div>
              {blackbaudConstituent?.lookupId ? (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "12px",
                    color: "#4B5563",
                  }}
                >
                  Lookup ID: {blackbaudConstituent.lookupId}
                </div>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#1D4ED8",
                  backgroundColor: "#DBEAFE",
                  border: "1px solid #93C5FD",
                  borderRadius: "999px",
                  padding: "4px 10px",
                }}
              >
                Read-only NXT data
              </div>
              <AnnualGivingSocietyBadge
                annualGivingSocieties={annualGivingSocieties}
              />
              {linkedBlackbaudConstituentProfileUrl ? (
                <a
                  href={linkedBlackbaudConstituentProfileUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={nxtProfileLinkStyle}
                >
                  Open NXT profile
                </a>
              ) : null}
            </div>
          </div>

          <ActivePledgeNotice
            status={
              pledgeData?.byConstituentId?.[
                String(linkedBlackbaudConstituentId)
              ]
            }
            incomplete={pledgeData?.incomplete}
          />
          {blackbaudSummaryLoading ? (
            <div style={{ fontSize: "13px", color: "#4B5563" }}>
              Loading Blackbaud summary...
            </div>
          ) : blackbaudSummaryError ? (
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
              Linked Blackbaud data could not be loaded right now.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  backgroundColor: "#DBEAFE",
                  border: "1px solid #BFDBFE",
                }}
              >
                <button
                  type="button"
                  onClick={onToggleNarrative}
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
                  {showBlackbaudNarrativeSummary ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
                {showBlackbaudNarrativeSummary ? (
                  <div style={{ marginTop: "10px" }}>
                    {blackbaudNarrativeSummary ? (
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: "12px",
                          backgroundColor: "white",
                          border: "1px solid #BFDBFE",
                          fontSize: "14px",
                          lineHeight: 1.7,
                          color: "#1F2937",
                        }}
                      >
                        {blackbaudNarrativeSummary}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "10px",
                          backgroundColor: "white",
                          border: "1px solid #DBEAFE",
                          fontSize: "13px",
                          color: "#4B5563",
                        }}
                      >
                        No concise NXT summary is available for this constituent
                        yet.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "12px",
                  marginTop: "14px",
                }}
              >
                {blackbaudConstituent?.preferredName ? (
                  <div>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#6B7280",
                        margin: "0 0 2px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Preferred Name
                    </p>
                    <p
                      style={{ fontSize: "14px", color: "#111827", margin: 0 }}
                    >
                      {blackbaudConstituent.preferredName}
                    </p>
                  </div>
                ) : null}
                {blackbaudConstituent?.email ? (
                  <div>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#6B7280",
                        margin: "0 0 2px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Email
                    </p>
                    <p
                      style={{ fontSize: "14px", color: "#111827", margin: 0 }}
                    >
                      {blackbaudConstituent.email}
                    </p>
                  </div>
                ) : null}
                {blackbaudConstituent?.phone ? (
                  <div>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#6B7280",
                        margin: "0 0 2px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Phone
                    </p>
                    <p
                      style={{ fontSize: "14px", color: "#111827", margin: 0 }}
                    >
                      {blackbaudConstituent.phone}
                    </p>
                  </div>
                ) : null}
                {blackbaudLifetimeGiving?.totalGiving ? (
                  <div>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#6B7280",
                        margin: "0 0 2px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Lifetime Giving
                    </p>
                    <p
                      style={{ fontSize: "14px", color: "#111827", margin: 0 }}
                    >
                      {formatBlackbaudCurrency(
                        blackbaudLifetimeGiving.totalGiving,
                      )}
                    </p>
                  </div>
                ) : null}
                {blackbaudProposalSummary.length ? (
                  <div>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#6B7280",
                        margin: "0 0 2px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Open Proposals
                    </p>
                    <p
                      style={{ fontSize: "14px", color: "#111827", margin: 0 }}
                    >
                      {blackbaudProposalSummary.length}
                    </p>
                  </div>
                ) : null}
              </div>
              {blackbaudConstituent?.address ? (
                <div style={{ marginTop: "14px" }}>
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: "700",
                      color: "#6B7280",
                      marginBottom: "2px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Preferred Address
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#374151",
                      margin: 0,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {blackbaudConstituent.address}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div style={{ ...workspaceCardStyle, backgroundColor: "#F9FAFB" }}>
          <p style={sectionEyebrowStyle}>Blackbaud</p>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#4B5563",
              lineHeight: 1.6,
            }}
          >
            This prospect is not linked to a Blackbaud constituent yet. Actions
            and opportunities will stay in the app only until the record is
            linked.
          </p>
        </div>
      )}
    </>
  );
}

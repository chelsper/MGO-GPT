import {
  FUNDED_OPPORTUNITY_STATUS,
  DECLINED_OPPORTUNITY_STATUS,
  formatCurrency,
  getOpportunityDisplayStatus,
  getOpportunityDisplayAmount,
  isFundedOpportunity,
  isDeclinedOpportunity,
  hasOpportunityFundedAmount,
  getOpportunityFundedDisplayAmount,
  formatLongDate,
} from "./prospectDetailPresentation";

const OPPORTUNITY_STATUS_COLORS = {
  Active: { bg: "#DCFCE7", text: "#166534", border: "#BBF7D0" },
  Identification: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  Qualification: { bg: "#F5F3FF", text: "#5B21B6", border: "#DDD6FE" },
  Cultivation: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
  Solicitation: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  "Solicitation - Verbal": {
    bg: "#FFEFD5",
    text: "#9A3412",
    border: "#FED7AA",
  },
  Stewardship: { bg: "#F0FDFA", text: "#0F766E", border: "#99F6E4" },
  Funded: { bg: "#DBEAFE", text: "#1D4ED8", border: "#BFDBFE" },
  Declined: { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
  [FUNDED_OPPORTUNITY_STATUS]: {
    bg: "#DBEAFE",
    text: "#1D4ED8",
    border: "#BFDBFE",
  },
  [DECLINED_OPPORTUNITY_STATUS]: {
    bg: "#FEE2E2",
    text: "#991B1B",
    border: "#FECACA",
  },
};

function OpportunityStatusBadge({ status }) {
  const colors =
    OPPORTUNITY_STATUS_COLORS[status] || OPPORTUNITY_STATUS_COLORS.Active;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: "600",
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

export default function ProspectOpportunityCard({
  opportunity,
  editor,
  readOnly,
  canLinkGift,
  unlinkingGiftLinkId,
  onEdit,
  onUnlinkGift,
  onLinkGift,
  renderRollover,
  renderStewardshipOpportunitySection,
}) {
  return (
    <div
      key={opportunity.id}
      style={{
        padding: "14px",
        backgroundColor: "#EFF6FF",
        borderRadius: "10px",
        border: "1px solid #BFDBFE",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          marginBottom: "6px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "#1E3A8A",
              marginBottom: "2px",
            }}
          >
            {opportunity.title}
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <OpportunityStatusBadge
              status={getOpportunityDisplayStatus(opportunity)}
            />
          </div>
        </div>
        <div
          style={{
            fontSize: "14px",
            fontWeight: "700",
            color: "#111827",
          }}
        >
          {formatCurrency(getOpportunityDisplayAmount(opportunity))}
        </div>
      </div>
      {Boolean(editor) ? (
        editor
      ) : (
        <>
          {opportunity.latest_notes ? (
            <p
              style={{
                fontSize: "13px",
                color: "#374151",
                lineHeight: 1.5,
                margin: "0 0 6px 0",
              }}
            >
              {opportunity.latest_notes}
            </p>
          ) : null}
          {isFundedOpportunity(opportunity) &&
          (hasOpportunityFundedAmount(opportunity) ||
            opportunity.close_date) ? (
            <div
              style={{
                fontSize: "12px",
                color: "#166534",
                marginBottom: "6px",
                lineHeight: 1.5,
              }}
            >
              {hasOpportunityFundedAmount(opportunity)
                ? `Amount Funded ${formatCurrency(getOpportunityFundedDisplayAmount(opportunity))}`
                : null}
              {hasOpportunityFundedAmount(opportunity) && opportunity.close_date
                ? " · "
                : ""}
              {opportunity.close_date
                ? `Funded ${formatLongDate(opportunity.close_date)}`
                : null}
            </div>
          ) : null}
          {Array.isArray(opportunity.linked_gifts) &&
          opportunity.linked_gifts.length > 0 ? (
            <div
              style={{
                margin: "8px 0",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #A7F3D0",
                backgroundColor: "#F0FDF4",
                color: "#166534",
                fontSize: "12px",
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: "800", marginBottom: "4px" }}>
                Linked gifts in JUMGOGPT
              </div>
              {opportunity.linked_gifts.map((giftLink) => {
                const giftLinkKey = giftLink.id || giftLink.blackbaud_gift_id;
                const isUnlinking =
                  String(unlinkingGiftLinkId) === String(giftLinkKey);

                return (
                  <div
                    key={giftLinkKey}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {formatLongDate(giftLink.gift_date) ||
                        "Gift date unavailable"}
                      {" · "}
                      {formatCurrency(giftLink.gift_amount)}
                      {giftLink.gift_type ? ` · ${giftLink.gift_type}` : ""}
                      {giftLink.gift_fund ? ` · ${giftLink.gift_fund}` : ""}
                      {giftLink.nxt_sync_state === "manual_required"
                        ? " · NXT link needs manual review"
                        : ""}
                    </span>
                    {!readOnly ? (
                      <button
                        type="button"
                        disabled={isUnlinking}
                        onClick={() => onUnlinkGift(opportunity, giftLink)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "999px",
                          border: "1px solid #BBF7D0",
                          backgroundColor: "white",
                          color: "#166534",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: isUnlinking ? "not-allowed" : "pointer",
                        }}
                      >
                        {isUnlinking ? "Unlinking..." : "Unlink gift"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {isFundedOpportunity(opportunity) && !readOnly && canLinkGift ? (
            <button
              type="button"
              onClick={() => onLinkGift(opportunity)}
              style={{
                marginBottom: "8px",
                padding: "7px 12px",
                borderRadius: "999px",
                border: "1px solid #86EFAC",
                backgroundColor: "white",
                color: "#166534",
                fontSize: "12px",
                fontWeight: "800",
                cursor: "pointer",
              }}
            >
              Link recent gift
            </button>
          ) : null}
          {isDeclinedOpportunity(opportunity) &&
          (opportunity.decline_reason || opportunity.close_date) ? (
            <div
              style={{
                fontSize: "12px",
                color: "#991B1B",
                marginBottom: "6px",
                lineHeight: 1.5,
              }}
            >
              {opportunity.decline_reason || "Opportunity declined"}
              {opportunity.close_date
                ? ` · Closed ${formatLongDate(opportunity.close_date)}`
                : ""}
            </div>
          ) : null}
          {renderRollover(opportunity)}
          {renderStewardshipOpportunitySection(opportunity)}
          {opportunity.ask_date || opportunity.expected_date ? (
            <div
              style={{
                fontSize: "12px",
                color: "#6B7280",
                marginBottom: "6px",
                lineHeight: 1.5,
              }}
            >
              {opportunity.ask_date
                ? `Ask date ${formatLongDate(opportunity.ask_date)}`
                : null}
              {opportunity.ask_date && opportunity.expected_date ? " · " : ""}
              {opportunity.expected_date
                ? `Expected ${formatLongDate(opportunity.expected_date)}`
                : null}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: "12px", color: "#6B7280" }}>
              Last updated{" "}
              {new Date(opportunity.updated_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {opportunity.close_date
                ? ` · Closed ${formatLongDate(opportunity.close_date)}`
                : ""}
            </div>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => onEdit(opportunity)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "999px",
                  border: "1px solid #93C5FD",
                  backgroundColor: "white",
                  color: "#1D4ED8",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Edit Opportunity
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

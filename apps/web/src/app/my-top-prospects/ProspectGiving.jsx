import { Trophy } from "lucide-react";

export function formatBlackbaudCurrency(amount) {
  if (amount == null) return "Unavailable";
  return "$" + Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSocietySource(source) {
  const labels = {
    committed: "committed giving",
    received_revenue: "received revenue",
    recognition_credit: "recognition credit",
    planned_gift: "planned gift on record",
  };
  return labels[source] || String(source || "").replace(/_/g, " ");
}

export function AnnualGivingSocietyBadge({ annualGivingSocieties }) {
  const societies = Array.isArray(annualGivingSocieties?.societies)
    ? annualGivingSocieties.societies
    : annualGivingSocieties?.primarySociety
      ? [annualGivingSocieties.primarySociety]
      : [];

  if (!societies.length) return null;

  return (
    <>
      {societies.map((society) => {
        const isLifetime = society.basis === "lifetime";
        const year = society.year || annualGivingSocieties?.year;
        const sourceKeys = society.supportedCountSources || society.countSources || [];
        const isPresenceBased = society.qualificationMode === "planned_gift";
        const total = society.qualifyingAmount ?? annualGivingSocieties?.combinedAnnualGiving;
        const displayTotal =
          isPresenceBased || total == null ? "" : formatBlackbaudCurrency(total);
        const sourceLabel = sourceKeys.map(formatSocietySource).join(" + ");

        return (
          <span
            key={`${society.basis || "annual"}-${society.key || society.label}`}
            title={[
              isLifetime
                ? "Lifetime giving society"
                : year
                  ? `${year} annual giving society`
                  : "Annual giving society",
              displayTotal && sourceLabel
                ? `${displayTotal} ${sourceLabel}`
                : displayTotal || sourceLabel,
            ]
              .filter(Boolean)
              .join(": ")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              border: isLifetime ? "1px solid #93C5FD" : "1px solid #FCD34D",
              borderRadius: "999px",
              backgroundColor: isLifetime ? "#EFF6FF" : "#FFFBEB",
              color: isLifetime ? "#1D4ED8" : "#92400E",
              fontSize: "12px",
              fontWeight: 800,
              padding: "6px 10px",
              whiteSpace: "nowrap",
            }}
          >
            <Trophy size={14} />
            {society.label}
          </span>
        );
      })}
    </>
  );
}

export function CurrentFiscalYearGiving({ giving, yearLabel }) {
  const recognizedReceived = Number(giving?.recognizedReceived || 0);
  const recognizedCommitted = Number(giving?.recognizedCommitted || 0);
  const plannedGifts = Number(giving?.plannedGifts || 0);

  if (
    !Number.isFinite(recognizedReceived) ||
    !Number.isFinite(recognizedCommitted) ||
    !Number.isFinite(plannedGifts) ||
    (recognizedReceived <= 0 && recognizedCommitted <= 0 && plannedGifts <= 0)
  ) {
    return null;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: "8px",
        marginTop: "4px",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px solid #BBF7D0",
        backgroundColor: "#F0FDF4",
      }}
    >
      <div
        style={{
          gridColumn: "1 / -1",
          color: "#166534",
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {yearLabel || "Current FY"} recognized giving
      </div>
      <div>
        <div style={{ color: "#4B5563", fontSize: "11px", fontWeight: 700 }}>
          Received
        </div>
        <div style={{ color: "#065F46", fontSize: "14px", fontWeight: 800 }}>
          {formatBlackbaudCurrency(recognizedReceived)}
        </div>
      </div>
      <div>
        <div style={{ color: "#4B5563", fontSize: "11px", fontWeight: 700 }}>
          Committed
        </div>
        <div style={{ color: "#065F46", fontSize: "14px", fontWeight: 800 }}>
          {formatBlackbaudCurrency(recognizedCommitted)}
        </div>
      </div>
      {plannedGifts > 0 ? (
        <div>
          <div style={{ color: "#4B5563", fontSize: "11px", fontWeight: 700 }}>
            Planned gifts
          </div>
          <div style={{ color: "#065F46", fontSize: "14px", fontWeight: 800 }}>
            {formatBlackbaudCurrency(plannedGifts)}
          </div>
          <div style={{ color: "#4B5563", fontSize: "11px", lineHeight: 1.35 }}>
            Included in committed
          </div>
        </div>
      ) : null}
    </div>
  );
}

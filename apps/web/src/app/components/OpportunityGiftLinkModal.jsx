"use client";

import { useEffect, useState } from "react";

function formatCurrency(amount) {
  if (amount == null || amount === "") return "Amount unavailable";
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "Amount unavailable";
  return "$" + numericAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getGiftLabel(gift) {
  return [formatDate(gift.date), formatCurrency(gift.amount), gift.type, gift.fund]
    .filter(Boolean)
    .join(" · ");
}

export default function OpportunityGiftLinkModal({
  opportunityId,
  constituentId,
  opportunityTitle = "this opportunity",
  onClose,
  onSaved,
}) {
  const [gifts, setGifts] = useState([]);
  const [selectedGiftIds, setSelectedGiftIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRecentGifts() {
      if (!constituentId) {
        setError("A Blackbaud constituent ID is required before gifts can be linked.");
        return;
      }

      setLoading(true);
      setError("");
      setFeedback("");

      try {
        const response = await fetch(
          `/api/blackbaud/constituents/${encodeURIComponent(constituentId)}/recent-gifts?limit=5`,
        );
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load recent gifts.");
        }

        if (!cancelled) {
          setGifts(Array.isArray(payload?.gifts) ? payload.gifts : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load recent gifts.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRecentGifts();

    return () => {
      cancelled = true;
    };
  }, [constituentId]);

  function toggleGift(giftId) {
    setSelectedGiftIds((current) => {
      const next = new Set(current);
      if (next.has(giftId)) {
        next.delete(giftId);
      } else {
        next.add(giftId);
      }
      return next;
    });
  }

  async function saveSelectedGifts() {
    if (!opportunityId) {
      setError("The opportunity must be saved before gifts can be linked.");
      return;
    }

    const selectedGifts = gifts.filter((gift) => selectedGiftIds.has(String(gift.id)));
    if (!selectedGifts.length) {
      setError("Select at least one gift to link, or choose Skip for now.");
      return;
    }

    setSaving(true);
    setError("");
    setFeedback("");

    try {
      const response = await fetch(
        `/api/prospects/opportunities/${encodeURIComponent(opportunityId)}/gift-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gifts: selectedGifts.map((gift) => ({
              id: gift.id,
              giftDate: gift.date || null,
              giftAmount: gift.amount ?? null,
              giftType: gift.type || null,
              giftFund: gift.fund || null,
              appliedAmount: gift.amount ?? null,
            })),
          }),
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Could not save gift links.");
      }

      setFeedback(
        "Gift link saved in the app. NXT linking still requires manual review.",
      );
      onSaved?.(payload);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save gift links.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Link recent gift"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        backgroundColor: "rgba(17, 24, 39, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflow: "auto",
          borderRadius: "18px",
          backgroundColor: "white",
          border: "1px solid #E5E7EB",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: "22px 24px", borderBottom: "1px solid #E5E7EB" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: "0 0 6px 0",
                  color: "#111827",
                  fontSize: "22px",
                  lineHeight: 1.15,
                }}
              >
                Link to recent gift?
              </h2>
              <p
                style={{
                  margin: 0,
                  color: "#6B7280",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                Select any recent gifts that funded <strong>{opportunityTitle}</strong>.
                This saves the relationship in JUMGOGPT now; NXT linking is still marked for
                manual review.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "1px solid #E5E7EB",
                backgroundColor: "white",
                color: "#6B7280",
                borderRadius: "999px",
                width: "36px",
                height: "36px",
                cursor: "pointer",
                fontSize: "20px",
                lineHeight: 1,
              }}
              aria-label="Close gift link dialog"
            >
              x
            </button>
          </div>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {loading ? (
            <div style={{ color: "#6B7280", fontSize: "14px" }}>
              Loading the constituent's five most recent gifts...
            </div>
          ) : null}

          {!loading && gifts.length === 0 && !error ? (
            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
                color: "#4B5563",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              No recent gifts were available to link. You can skip this step and link the gift
              manually later if needed.
            </div>
          ) : null}

          {!loading && gifts.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {gifts.map((gift) => {
                const giftId = String(gift.id);
                const isSelected = selectedGiftIds.has(giftId);

                return (
                  <label
                    key={giftId}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "14px",
                      borderRadius: "12px",
                      border: isSelected ? "2px solid #6A5BFF" : "1px solid #E5E7EB",
                      backgroundColor: isSelected ? "#F5F3FF" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleGift(giftId)}
                      style={{ marginTop: "3px" }}
                    />
                    <span>
                      <span
                        style={{
                          display: "block",
                          color: "#111827",
                          fontSize: "15px",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        {formatCurrency(gift.amount)}
                      </span>
                      <span style={{ color: "#4B5563", fontSize: "13px", lineHeight: 1.4 }}>
                        {getGiftLabel(gift)}
                      </span>
                      {Array.isArray(gift.funds) && gift.funds.length > 1 ? (
                        <span
                          style={{
                            display: "block",
                            color: "#6B7280",
                            fontSize: "12px",
                            marginTop: "3px",
                          }}
                        >
                          Funds: {gift.funds.join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {error ? (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                borderRadius: "12px",
                backgroundColor: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          ) : null}

          {feedback ? (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                borderRadius: "12px",
                backgroundColor: "#ECFDF5",
                border: "1px solid #A7F3D0",
                color: "#166534",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {feedback}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "20px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #D1D5DB",
                backgroundColor: "white",
                color: "#374151",
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={saveSelectedGifts}
              disabled={saving || loading || gifts.length === 0}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "none",
                backgroundColor:
                  saving || loading || gifts.length === 0 ? "#C7D2FE" : "#6A5BFF",
                color: "white",
                fontWeight: 700,
                cursor:
                  saving || loading || gifts.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save selected gifts"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

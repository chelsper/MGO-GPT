import { useState } from "react";
import { mergeSavedPortfolioContacts } from "@/utils/portfolioContacts";

// State remains owned by the mounted tier. Reads are explicit; card expansion
// and worklist sorting must not start a full NXT summary request.
export default function usePortfolioSummary({ allowNxtSummary }) {
  const [expandedSummaries, setExpandedSummaries] = useState({});

  const [summaryStates, setSummaryStates] = useState({});

  const loadSummary = async (constituentId, { refresh = false } = {}) => {
    if (!allowNxtSummary) {
      setSummaryStates((current) => ({
        ...current,
        [constituentId]: {
          ...current[constituentId],
          status: "error",
          error: "NXT summary requests are paused while Blackbaud is temporarily unavailable.",
        },
      }));
      return;
    }

    setSummaryStates((current) => ({
      ...current,
      [constituentId]: { ...current[constituentId], status: "loading", error: null },
    }));

    try {
      const params = new URLSearchParams();
      if (refresh) params.set("refresh", "1");
      const query = params.toString();
      const response = await fetch(
        `/api/blackbaud/constituents/${constituentId}/summary${query ? `?${query}` : ""}`,
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load NXT summary");
      }

      setSummaryStates((current) => ({
        ...current,
        [constituentId]: {
          ...current[constituentId],
          status: "success",
          error: null,
          payload,
          contactDetails: mergeSavedPortfolioContacts(
            current[constituentId]?.contactDetails || {},
            payload?.mapped?.constituent,
            { checkedAt: payload?.summaryRefreshedAt },
          ),
        },
      }));
    } catch (error) {
      setSummaryStates((current) => ({
        ...current,
        [constituentId]: {
          ...current[constituentId],
          status: "error",
          error: error instanceof Error ? error.message : "Failed to load NXT summary",
        },
      }));
    }
  };

  const toggleSummary = (constituentId) => {
    const nextExpanded = !expandedSummaries[constituentId];
    setExpandedSummaries((current) => ({
      ...current,
      [constituentId]: nextExpanded,
    }));

    if (nextExpanded && !summaryStates[constituentId]) {
      void loadSummary(constituentId);
    }
  };

  return { expandedSummaries, summaryStates, loadSummary, toggleSummary };
}

"use client";

import { useEffect, useState } from "react";
import useUser from "@/utils/useUser";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

const STAGES = [
  "Identification",
  "Qualification",
  "Cultivation",
  "Solicitation",
  "Stewardship",
];

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export default function UpdateOpportunityPage() {
  const { data: user, loading } = useUser();
  const [donorName, setDonorName] = useState("");
  const [opportunityStage, setOpportunityStage] = useState("Identification");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [constituentMatches, setConstituentMatches] = useState([]);
  const [matchDecision, setMatchDecision] = useState("");

  useEffect(() => {
    const query = donorName.trim();
    if (query.length < 2) {
      setConstituentMatches([]);
      setMatchDecision("");
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/constituents/search?q=${encodeURIComponent(query)}`,
        );
        if (!response.ok) return;
        const data = await response.json();
        if (active) {
          setConstituentMatches(Array.isArray(data) ? data : []);
        }
      } catch (searchError) {
        console.error("Constituent lookup error:", searchError);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [donorName]);

  const exactMatch = constituentMatches.find(
    (item) => item.normalized_name === normalizeName(donorName),
  );

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/submissions/opportunity-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error || "Failed to submit opportunity update",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      setDonorName("");
      setOpportunityStage("Identification");
      setEstimatedAmount("");
      setNotes("");
      setConstituentMatches([]);
      setMatchDecision("");
    },
    onError: (err) => {
      console.error(err);
      setError(err?.message || "Failed to submit. Please try again.");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!donorName.trim()) {
      setError("Please enter a donor name.");
      return;
    }

    if (exactMatch && !matchDecision) {
      setError(
        `We found an existing ${exactMatch.name} in your workflow. Choose whether to link this update or treat it as a new person.`,
      );
      return;
    }

    submitMutation.mutate({
      donorName,
      constituentId: matchDecision === "link" ? exactMatch?.id || null : null,
      createNewConstituent: matchDecision === "new",
      opportunityStage,
      estimatedAmount: estimatedAmount ? parseFloat(estimatedAmount) : null,
      notes,
    });
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F9FAFB",
        }}
      >
        <p style={{ color: "#6B7280" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#F9FAFB",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #E5E7EB",
          padding: "16px 24px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: "700px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <a
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "#F3F4F6",
              border: "1px solid #E5E7EB",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={18} color="#374151" />
          </a>
          <h1
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#111827",
              margin: 0,
            }}
          >
            Update Opportunity
          </h1>
        </div>
      </header>

      <main style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}>
        {submitMutation.isPending && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#EDE9FE",
              color: "#5B21B6",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            Sending your opportunity update to the submission tracker...
          </div>
        )}

        {success && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#D1FAE5",
              color: "#065F46",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            Opportunity update submitted successfully.{" "}
            <a
              href="/submissions"
              style={{ color: "#065F46", textDecoration: "underline", marginRight: "8px" }}
            >
              View submission tracker
            </a>
            or{" "}
            <a
              href="/"
              style={{ color: "#065F46", textDecoration: "underline" }}
            >
              Back to dashboard
            </a>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#FEE2E2",
              color: "#991B1B",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "24px",
              marginBottom: "20px",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Donor Name <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <input
              type="text"
              value={donorName}
              onChange={(e) => {
                setDonorName(e.target.value);
                setMatchDecision("");
              }}
              placeholder="Enter donor name"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
            {exactMatch ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #DDD6FE",
                  backgroundColor: "#F5F3FF",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#5B21B6", marginBottom: "6px" }}>
                  Existing workflow match found
                </div>
                <div style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.5 }}>
                  We found <strong>{exactMatch.name}</strong> in your prospects or prior updates.
                  Do you want to tie this opportunity to that existing person?
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setMatchDecision("link")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "999px",
                      border: matchDecision === "link" ? "2px solid #6A5BFF" : "1px solid #C4B5FD",
                      backgroundColor: matchDecision === "link" ? "#EDE9FE" : "white",
                      color: "#5B21B6",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Link existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchDecision("new")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "999px",
                      border: matchDecision === "new" ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                      backgroundColor: matchDecision === "new" ? "#F3F4F6" : "white",
                      color: "#374151",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Treat as new person
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "24px",
              marginBottom: "20px",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "12px",
              }}
            >
              Opportunity Stage
            </label>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setOpportunityStage(stage)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    fontSize: "14px",
                    fontWeight: "500",
                    border:
                      opportunityStage === stage
                        ? "2px solid #6A5BFF"
                        : "1px solid #E5E7EB",
                    backgroundColor:
                      opportunityStage === stage ? "#EDE9FE" : "white",
                    color: opportunityStage === stage ? "#6A5BFF" : "#374151",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  {stage}
                  {opportunityStage === stage && (
                    <span
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        backgroundColor: "#6A5BFF",
                        display: "inline-block",
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "24px",
              marginBottom: "20px",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Estimated Amount
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#374151",
                }}
              >
                $
              </span>
              <input
                type="number"
                value={estimatedAmount}
                onChange={(e) => setEstimatedAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "24px",
              marginBottom: "20px",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Type your notes here..."
              rows={5}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submitMutation.isPending}
            style={{
              width: "100%",
              padding: "14px",
              backgroundColor: submitMutation.isPending ? "#9CA3AF" : "#6A5BFF",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: submitMutation.isPending ? "not-allowed" : "pointer",
            }}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Update"}
          </button>
        </form>
      </main>
    </div>
  );
}

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

function getDefaultFY() {
  const now = new Date();
  const fiscalYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `FY${String(fiscalYear).slice(-2)}`;
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
  const [linkedProspectContext, setLinkedProspectContext] = useState(null);
  const [opportunityLinkMode, setOpportunityLinkMode] = useState("create");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");
  const [newOpportunityTitle, setNewOpportunityTitle] = useState("");
  const [prospectPrompt, setProspectPrompt] = useState(null);
  const [prospectError, setProspectError] = useState("");
  const [prospectAdded, setProspectAdded] = useState(false);

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

  useEffect(() => {
    if (!exactMatch || matchDecision === "new") {
      setLinkedProspectContext(null);
      setOpportunityLinkMode("create");
      setSelectedOpportunityId("");
      setNewOpportunityTitle("");
      return;
    }

    let active = true;

    const loadContext = async () => {
      try {
        const prospectsResponse = await fetch("/api/prospects");
        if (!prospectsResponse.ok) {
          return;
        }

        const prospects = await prospectsResponse.json();
        if (!active) return;

        const normalizedDonorName = normalizeName(donorName);
        const matchedProspect = Array.isArray(prospects)
          ? prospects.find((prospect) => {
              if (exactMatch.id && prospect.constituent_id) {
                return Number(prospect.constituent_id) === Number(exactMatch.id);
              }
              return normalizeName(prospect.prospect_name) === normalizedDonorName;
            })
          : null;

        if (!matchedProspect) {
          setLinkedProspectContext(null);
          setOpportunityLinkMode("create");
          setSelectedOpportunityId("");
          setNewOpportunityTitle("");
          return;
        }

        const detailResponse = await fetch(`/api/prospects/${matchedProspect.id}`);
        if (!detailResponse.ok) {
          return;
        }

        const detail = await detailResponse.json();
        if (!active) return;

        const opportunities = Array.isArray(detail?.opportunities)
          ? detail.opportunities
          : [];

        setLinkedProspectContext(detail?.prospect ? detail : null);
        if (opportunities.length > 0) {
          setOpportunityLinkMode("update");
          setSelectedOpportunityId(String(opportunities[0].id));
          setNewOpportunityTitle("");
        } else {
          setOpportunityLinkMode("create");
          setSelectedOpportunityId("");
          setNewOpportunityTitle(`${donorName.trim()} opportunity`);
        }
      } catch (contextError) {
        console.error("Linked opportunity lookup error:", contextError);
      }
    };

    loadContext();

    return () => {
      active = false;
    };
  }, [exactMatch, donorName, matchDecision]);

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
    onSuccess: async (data) => {
      setSuccess(true);
      setProspectError("");
      setProspectAdded(false);
      const submittedName = donorName.trim();
      const submittedAmount = estimatedAmount ? parseFloat(estimatedAmount) : null;
      const submittedConstituentId = data?.constituent_id || null;
      setDonorName("");
      setOpportunityStage("Identification");
      setEstimatedAmount("");
      setNotes("");
      setConstituentMatches([]);
      setMatchDecision("");
      setLinkedProspectContext(null);
      setOpportunityLinkMode("create");
      setSelectedOpportunityId("");
      setNewOpportunityTitle("");

      try {
        const response = await fetch("/api/prospects");
        if (!response.ok) {
          setProspectPrompt(null);
          return;
        }
        const prospects = await response.json();
        const normalizedSubmittedName = normalizeName(submittedName);
        const alreadyTracked = Array.isArray(prospects) && prospects.some((prospect) => {
          if (submittedConstituentId && prospect.constituent_id) {
            return Number(prospect.constituent_id) === Number(submittedConstituentId);
          }
          return normalizeName(prospect.prospect_name) === normalizedSubmittedName;
        });

        setProspectPrompt(
          alreadyTracked || data?.prospect_id
            ? null
            : {
                prospectName: submittedName,
                constituentId: submittedConstituentId,
                askAmount: submittedAmount,
                expectedCloseFY: getDefaultFY(),
                askType: "Major Gift",
              },
        );
      } catch (prospectLookupError) {
        console.error("Prospect lookup error:", prospectLookupError);
        setProspectPrompt(null);
      }
    },
    onError: (err) => {
      console.error(err);
      setError(err?.message || "Failed to submit. Please try again.");
    },
  });

  const addProspectMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to add prospect");
      }
      return res.json();
    },
    onSuccess: () => {
      setProspectAdded(true);
      setProspectError("");
      setProspectPrompt(null);
    },
    onError: (err) => {
      console.error(err);
      setProspectError(err?.message || "Failed to add prospect.");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setProspectPrompt(null);
    setProspectError("");
    setProspectAdded(false);

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
      linkedProspectId: linkedProspectContext?.prospect?.id || null,
      linkedOpportunityId:
        linkedProspectContext?.prospect && opportunityLinkMode === "update"
          ? Number(selectedOpportunityId) || null
          : null,
      createNewOpportunity:
        Boolean(linkedProspectContext?.prospect) &&
        opportunityLinkMode === "create",
      opportunityTitle:
        linkedProspectContext?.prospect && opportunityLinkMode === "create"
          ? newOpportunityTitle.trim()
          : null,
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

        {prospectPrompt && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#FEF3C7",
              color: "#92400E",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
            }}
          >
            Would you like to add <strong>{prospectPrompt.prospectName}</strong> to My Top Prospects?
            <div style={{ marginTop: "10px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => addProspectMutation.mutate(prospectPrompt)}
                disabled={addProspectMutation.isPending}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "#92400E",
                  color: "white",
                  fontWeight: "600",
                  cursor: addProspectMutation.isPending ? "not-allowed" : "pointer",
                }}
              >
                {addProspectMutation.isPending ? "Adding..." : "Add to Top Prospects"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProspectPrompt(null);
                  setProspectError("");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #D6D3D1",
                  backgroundColor: "white",
                  color: "#57534E",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {prospectAdded && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#DBEAFE",
              color: "#1D4ED8",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            Prospect added to{" "}
            <a href="/my-top-prospects" style={{ color: "#1D4ED8", textDecoration: "underline" }}>
              My Top Prospects
            </a>
            .
          </div>
        )}

        {prospectError && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
            }}
          >
            {prospectError}
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

            {linkedProspectContext?.prospect ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #BFDBFE",
                  backgroundColor: "#EFF6FF",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#1D4ED8",
                    marginBottom: "6px",
                  }}
                >
                  Linked top prospect found
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#1F2937",
                    lineHeight: 1.5,
                    marginBottom: "10px",
                  }}
                >
                  This update is tied to <strong>{linkedProspectContext.prospect.prospect_name}</strong> in My Top
                  Prospects. We can either update an existing linked opportunity or create a new one and roll it into
                  the total ask pipeline automatically.
                </div>

                {linkedProspectContext.opportunities?.length > 0 ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "10px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpportunityLinkMode("update")}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border:
                            opportunityLinkMode === "update"
                              ? "2px solid #2563EB"
                              : "1px solid #93C5FD",
                          backgroundColor:
                            opportunityLinkMode === "update" ? "#DBEAFE" : "white",
                          color: "#1D4ED8",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Update existing opportunity
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpportunityLinkMode("create")}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border:
                            opportunityLinkMode === "create"
                              ? "2px solid #2563EB"
                              : "1px solid #93C5FD",
                          backgroundColor:
                            opportunityLinkMode === "create" ? "#DBEAFE" : "white",
                          color: "#1D4ED8",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Create new linked opportunity
                      </button>
                    </div>

                    {opportunityLinkMode === "update" ? (
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#1D4ED8",
                            marginBottom: "6px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Existing opportunity
                        </label>
                        <select
                          value={selectedOpportunityId}
                          onChange={(e) => setSelectedOpportunityId(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "10px 14px",
                            border: "1px solid #BFDBFE",
                            borderRadius: "8px",
                            fontSize: "14px",
                            boxSizing: "border-box",
                            backgroundColor: "white",
                          }}
                        >
                          {linkedProspectContext.opportunities.map((opportunity) => (
                            <option key={opportunity.id} value={opportunity.id}>
                              {opportunity.title} | {opportunity.current_stage}
                              {opportunity.estimated_amount
                                ? ` | $${Number(opportunity.estimated_amount).toLocaleString()}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#1D4ED8",
                            marginBottom: "6px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          New opportunity title
                        </label>
                        <input
                          type="text"
                          value={newOpportunityTitle}
                          onChange={(e) => setNewOpportunityTitle(e.target.value)}
                          placeholder="e.g. Endowed scholarship ask"
                          style={{
                            width: "100%",
                            padding: "10px 14px",
                            border: "1px solid #BFDBFE",
                            borderRadius: "8px",
                            fontSize: "14px",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#1F2937",
                      lineHeight: 1.5,
                    }}
                  >
                    No linked opportunities exist yet. This submission will create a new linked opportunity under this
                    prospect.
                    <div style={{ marginTop: "10px" }}>
                      <input
                        type="text"
                        value={newOpportunityTitle}
                        onChange={(e) => setNewOpportunityTitle(e.target.value)}
                        placeholder="Opportunity title"
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          border: "1px solid #BFDBFE",
                          borderRadius: "8px",
                          fontSize: "14px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                )}
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

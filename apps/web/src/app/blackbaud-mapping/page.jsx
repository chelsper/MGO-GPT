"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";
import { isAdminRole } from "@/utils/workspaceRoles";

const cardStyle = {
  backgroundColor: "white",
  borderRadius: "12px",
  border: "1px solid #E5E7EB",
  padding: "24px",
  marginBottom: "20px",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #D1D5DB",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const selectStyle = {
  ...inputStyle,
  backgroundColor: "white",
};

const readOnlyInputStyle = {
  ...inputStyle,
  backgroundColor: "#F3F4F6",
  color: "#6B7280",
  cursor: "not-allowed",
};

const readOnlySelectStyle = {
  ...selectStyle,
  backgroundColor: "#F3F4F6",
  color: "#6B7280",
  cursor: "not-allowed",
};

const directions = ["pull", "push", "bidirectional", "local only"];

const directionLabels = {
  pull: "Read from Blackbaud",
  push: "Send to Blackbaud",
  bidirectional: "Two-way sync",
  "local only": "App only",
};

const directionTone = {
  pull: {
    backgroundColor: "#E0E7FF",
    border: "1px solid #C7D2FE",
    color: "#4338CA",
  },
  push: {
    backgroundColor: "#FEF3C7",
    border: "1px solid #FCD34D",
    color: "#92400E",
  },
  bidirectional: {
    backgroundColor: "#DCFCE7",
    border: "1px solid #86EFAC",
    color: "#166534",
  },
  "local only": {
    backgroundColor: "#F3F4F6",
    border: "1px solid #D1D5DB",
    color: "#4B5563",
  },
};

function prettifyFieldName(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function BlackbaudMappingPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [savingKey, setSavingKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");

  async function loadMappings() {
    const [profileResponse, mappingResponse] = await Promise.all([
      fetch("/api/users/profile"),
      fetch("/api/admin/blackbaud-mappings"),
    ]);

    const profileData = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok || !isAdminRole(profileData?.user?.role)) {
      throw new Error("Forbidden — admins only");
    }

    const mappingData = await mappingResponse.json().catch(() => null);
    if (!mappingResponse.ok) {
      throw new Error(mappingData?.error || "Failed to load Blackbaud mappings");
    }

    setProfile(profileData.user || null);
    setMappings(mappingData.mappings || []);
  }

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    (async () => {
      setProfileLoading(true);
      try {
        await loadMappings();
      } catch (err) {
        if (!active) return;
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Failed to load Blackbaud mappings",
        );
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionUser]);

  const filteredMappings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return mappings.filter((mapping) => {
      const matchesDirection =
        directionFilter === "all" ? true : mapping.direction === directionFilter;
      if (!matchesDirection) return false;
      if (!query) return true;

      const haystack = [
        mapping.app_entity,
        mapping.app_field,
        mapping.mapping_key,
        mapping.blackbaud_object,
        mapping.blackbaud_field,
        mapping.source_of_truth,
        mapping.selection_rule,
        mapping.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [directionFilter, mappings, searchQuery]);

  const groupedMappings = useMemo(() => {
    const groups = new Map();
    for (const mapping of filteredMappings) {
      if (!groups.has(mapping.app_entity)) {
        groups.set(mapping.app_entity, []);
      }
      groups.get(mapping.app_entity).push(mapping);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMappings]);

  const mappingSummary = useMemo(() => {
    const total = mappings.length;
    const editable = mappings.filter((mapping) => mapping.direction !== "pull").length;
    const pullOnly = mappings.filter((mapping) => mapping.direction === "pull").length;
    const localOnly = mappings.filter((mapping) => mapping.direction === "local only").length;
    return { total, editable, pullOnly, localOnly };
  }, [mappings]);

  function updateMapping(mappingKey, field, value) {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.mapping_key === mappingKey ? { ...mapping, [field]: value } : mapping,
      ),
    );
  }

  async function saveMapping(mapping) {
    setSavingKey(mapping.mapping_key);
    setError("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/admin/blackbaud-mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapping),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save Blackbaud mapping");
      }

      setMappings((current) =>
        current.map((item) =>
          item.mapping_key === mapping.mapping_key ? { ...item, ...data.mapping } : item,
        ),
      );
      setStatusMessage(`Saved mapping for ${mapping.app_entity}.${mapping.app_field}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save Blackbaud mapping");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading || !sessionUser || profileLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          backgroundColor: "#F9FAFB",
          color: "#6B7280",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!isAdminRole(profile?.role)) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#F9FAFB", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <main style={{ maxWidth: "760px", margin: "0 auto", padding: "24px 18px 48px" }}>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "#6A5BFF",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "18px",
            }}
          >
            <ArrowLeft size={16} />
            Back to dashboard
          </a>
          <div style={cardStyle}>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800, color: "#111827" }}>
              Blackbaud Mapping
            </h1>
            <p style={{ margin: "12px 0 0", color: "#6B7280" }}>
              This page is available to workspace administrators only.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F9FAFB", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 18px 48px" }}>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: "#6A5BFF",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "18px",
          }}
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </a>

        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>
            Blackbaud Mapping
          </h1>
          <p style={{ margin: "12px 0 0", color: "#6B7280", lineHeight: 1.6 }}>
            Set the data governance rules for how app fields line up with Raiser's Edge
            NXT. Use this page to confirm which system owns a field, whether the app
            reads or writes it, and any special selection rules reviewers should follow.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginTop: "18px",
            }}
          >
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "14px",
                backgroundColor: "#F9FAFB",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Total mappings
              </div>
              <div style={{ marginTop: "6px", fontSize: "26px", fontWeight: 800, color: "#111827" }}>
                {mappingSummary.total}
              </div>
            </div>
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "14px",
                backgroundColor: "#F9FAFB",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Editable here
              </div>
              <div style={{ marginTop: "6px", fontSize: "26px", fontWeight: 800, color: "#111827" }}>
                {mappingSummary.editable}
              </div>
            </div>
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "14px",
                backgroundColor: "#F9FAFB",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Pull-only
              </div>
              <div style={{ marginTop: "6px", fontSize: "26px", fontWeight: 800, color: "#4338CA" }}>
                {mappingSummary.pullOnly}
              </div>
            </div>
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "14px",
                backgroundColor: "#F9FAFB",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                App only
              </div>
              <div style={{ marginTop: "6px", fontSize: "26px", fontWeight: 800, color: "#4B5563" }}>
                {mappingSummary.localOnly}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: "16px",
              padding: "14px 16px",
              borderRadius: "12px",
              backgroundColor: "#F8FAFC",
              border: "1px solid #E2E8F0",
              color: "#475569",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            Start by reviewing fields marked <strong>Read from Blackbaud</strong>, then update the editable fields that still need a clearer source of truth or selection rule.
          </div>
        </div>

        {statusMessage ? (
          <div
            style={{
              ...cardStyle,
              marginTop: "-8px",
              backgroundColor: "#ECFDF5",
              borderColor: "#A7F3D0",
              color: "#065F46",
            }}
          >
            {statusMessage}
          </div>
        ) : null}
        {error ? (
          <div
            style={{
              ...cardStyle,
              marginTop: "-8px",
              backgroundColor: "#FEF2F2",
              borderColor: "#FECACA",
              color: "#991B1B",
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) minmax(220px, 1fr)",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "8px" }}>
                Search mappings
              </label>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by app field, Blackbaud field, key, or notes"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "8px" }}>
                Filter by direction
              </label>
              <select
                value={directionFilter}
                onChange={(event) => setDirectionFilter(event.target.value)}
                style={selectStyle}
              >
                <option value="all">All directions</option>
                {directions.map((direction) => (
                  <option key={direction} value={direction}>
                    {directionLabels[direction]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: "12px", fontSize: "13px", color: "#6B7280" }}>
            Showing {filteredMappings.length} of {mappings.length} mappings.
          </div>
        </div>

        {groupedMappings.length === 0 ? (
          <div style={cardStyle}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827" }}>
              No mappings match this filter
            </div>
            <div style={{ marginTop: "8px", fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>
              Clear the search or switch the direction filter to see more fields.
            </div>
          </div>
        ) : null}

        {groupedMappings.map(([entity, rows]) => (
          <section key={entity} style={cardStyle}>
            <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#111827",
                  textTransform: "capitalize",
                }}
              >
                {prettifyFieldName(entity)}
              </h2>
                <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                  {rows.length} field{rows.length === 1 ? "" : "s"} in this section
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              {rows.map((mapping) => (
                <div
                  key={mapping.mapping_key}
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: "12px",
                    padding: "18px",
                    backgroundColor: "#FAFAFF",
                  }}
                >
                  {(() => {
                    const isReadOnly = mapping.direction === "pull";
                    const tone = directionTone[mapping.direction] || directionTone["local only"];
                    return (
                      <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "14px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827" }}>
                          {prettifyFieldName(mapping.app_field)}
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: "999px",
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontWeight: 700,
                            ...tone,
                          }}
                        >
                          {directionLabels[mapping.direction] || prettifyFieldName(mapping.direction)}
                        </span>
                        {isReadOnly ? (
                          <span
                            style={{
                              borderRadius: "999px",
                              backgroundColor: "#E0E7FF",
                              color: "#4338CA",
                              fontWeight: 700,
                              fontSize: "12px",
                              padding: "6px 10px",
                            }}
                          >
                            Locked here
                          </span>
                        ) : null}
                      </div>
                      <div style={{ color: "#374151", fontSize: "13px", marginTop: "6px", fontWeight: 600 }}>
                        App field: {mapping.app_entity}.{mapping.app_field}
                      </div>
                      <div style={{ color: "#6B7280", fontSize: "13px", marginTop: "4px" }}>
                        Mapping key: {mapping.mapping_key}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                      <button
                        type="button"
                        onClick={() => saveMapping(mapping)}
                        disabled={isReadOnly || savingKey === mapping.mapping_key}
                        style={{
                          border: "none",
                          borderRadius: "10px",
                          backgroundColor: "#6A5BFF",
                          color: "white",
                          fontWeight: 700,
                          padding: "10px 16px",
                          cursor:
                            isReadOnly || savingKey === mapping.mapping_key
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            isReadOnly || savingKey === mapping.mapping_key ? 0.7 : 1,
                        }}
                      >
                        {isReadOnly
                          ? "Managed by Blackbaud"
                          : savingKey === mapping.mapping_key
                            ? "Saving..."
                            : "Save mapping"}
                      </button>
                    </div>
                  </div>

                  {isReadOnly ? (
                    <div
                      style={{
                        marginBottom: "14px",
                        borderRadius: "10px",
                        backgroundColor: "#EEF2FF",
                        color: "#4338CA",
                        padding: "12px 14px",
                        fontSize: "13px",
                        lineHeight: 1.5,
                      }}
                    >
                      This field is configured as a pull-only value from Blackbaud NXT and
                      cannot be edited from the admin mapping UI.
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginBottom: "14px",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        borderRadius: "10px",
                        border: "1px solid #E5E7EB",
                        backgroundColor: "white",
                        padding: "12px",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Blackbaud target
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "14px", color: "#111827", fontWeight: 700 }}>
                        {mapping.blackbaud_object && mapping.blackbaud_field
                          ? `${mapping.blackbaud_object}.${mapping.blackbaud_field}`
                          : "Not set yet"}
                      </div>
                    </div>
                    <div
                      style={{
                        borderRadius: "10px",
                        border: "1px solid #E5E7EB",
                        backgroundColor: "white",
                        padding: "12px",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Source of truth
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "14px", color: "#111827", fontWeight: 700 }}>
                        {mapping.source_of_truth || "Not documented yet"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "14px",
                    }}
                  >
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>
                        Blackbaud object
                      </span>
                      <input
                        value={mapping.blackbaud_object || ""}
                        onChange={(event) =>
                          updateMapping(mapping.mapping_key, "blackbaud_object", event.target.value)
                        }
                        disabled={isReadOnly}
                        style={isReadOnly ? readOnlyInputStyle : inputStyle}
                      />
                    </label>

                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>
                        Blackbaud field
                      </span>
                      <input
                        value={mapping.blackbaud_field || ""}
                        onChange={(event) =>
                          updateMapping(mapping.mapping_key, "blackbaud_field", event.target.value)
                        }
                        disabled={isReadOnly}
                        style={isReadOnly ? readOnlyInputStyle : inputStyle}
                      />
                    </label>

                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>
                        Direction
                      </span>
                      <select
                        value={mapping.direction || "local only"}
                        onChange={(event) =>
                          updateMapping(mapping.mapping_key, "direction", event.target.value)
                        }
                        disabled={isReadOnly}
                        style={isReadOnly ? readOnlySelectStyle : selectStyle}
                      >
                        {directions.map((direction) => (
                          <option key={direction} value={direction}>
                            {direction}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>
                        Source of truth
                      </span>
                      <input
                        value={mapping.source_of_truth || ""}
                        onChange={(event) =>
                          updateMapping(mapping.mapping_key, "source_of_truth", event.target.value)
                        }
                        disabled={isReadOnly}
                        style={isReadOnly ? readOnlyInputStyle : inputStyle}
                      />
                    </label>
                  </div>

                  <div style={{ display: "grid", gap: "14px", marginTop: "14px" }}>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>
                        Selection rule
                      </span>
                      <textarea
                        value={mapping.selection_rule || ""}
                        onChange={(event) =>
                          updateMapping(mapping.mapping_key, "selection_rule", event.target.value)
                        }
                        rows={2}
                        disabled={isReadOnly}
                        style={{
                          ...(isReadOnly ? readOnlyInputStyle : inputStyle),
                          resize: "vertical",
                        }}
                      />
                    </label>

                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>
                        Notes
                      </span>
                      <textarea
                        value={mapping.notes || ""}
                        onChange={(event) =>
                          updateMapping(mapping.mapping_key, "notes", event.target.value)
                        }
                        rows={2}
                        disabled={isReadOnly}
                        style={{
                          ...(isReadOnly ? readOnlyInputStyle : inputStyle),
                          resize: "vertical",
                        }}
                      />
                    </label>
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

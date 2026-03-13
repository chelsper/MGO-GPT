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

const directions = ["pull", "push", "bidirectional", "local only"];

export default function BlackbaudMappingPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [savingKey, setSavingKey] = useState(null);

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

  const groupedMappings = useMemo(() => {
    const groups = new Map();
    for (const mapping of mappings) {
      if (!groups.has(mapping.app_entity)) {
        groups.set(mapping.app_entity, []);
      }
      groups.get(mapping.app_entity).push(mapping);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
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
            Manage which app fields should map to Blackbaud NXT, what the source of
            truth is, and the selection rules for each field. This first pass stores
            governance decisions only. It does not automatically rewrite sync logic.
          </p>
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

        {groupedMappings.map(([entity, rows]) => (
          <section key={entity} style={cardStyle}>
            <div style={{ marginBottom: "16px" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#111827",
                  textTransform: "capitalize",
                }}
              >
                {entity.replaceAll("_", " ")}
              </h2>
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
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827" }}>
                        {mapping.app_entity}.{mapping.app_field}
                      </div>
                      <div style={{ color: "#6B7280", fontSize: "13px", marginTop: "4px" }}>
                        Mapping key: {mapping.mapping_key}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => saveMapping(mapping)}
                      disabled={savingKey === mapping.mapping_key}
                      style={{
                        border: "none",
                        borderRadius: "10px",
                        backgroundColor: "#6A5BFF",
                        color: "white",
                        fontWeight: 700,
                        padding: "10px 16px",
                        cursor: savingKey === mapping.mapping_key ? "wait" : "pointer",
                        opacity: savingKey === mapping.mapping_key ? 0.7 : 1,
                      }}
                    >
                      {savingKey === mapping.mapping_key ? "Saving..." : "Save mapping"}
                    </button>
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
                        style={inputStyle}
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
                        style={inputStyle}
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
                        style={selectStyle}
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
                        style={inputStyle}
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
                        style={{ ...inputStyle, resize: "vertical" }}
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
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

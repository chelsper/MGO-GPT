"use client";

import { useEffect, useId, useState } from "react";
import { Check, Search, UserRound, X } from "lucide-react";

const MAX_DISCUSSION_CONSTITUENTS = 20;

function constituentKey(constituent) {
  return String(
    constituent?.blackbaudConstituentId || constituent?.blackbaudRecordId || "",
  ).trim();
}

function selectionFromResult(result) {
  return {
    blackbaudConstituentId: constituentKey(result),
    name: String(result?.name || "Unnamed constituent").trim(),
    lookupId: String(
      result?.lookupId || result?.blackbaudLookupId || "",
    ).trim() || null,
  };
}

export default function DiscussionConstituentPicker({
  selected = [],
  onChange,
  disabled = false,
  label = "Constituents to discuss",
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const selectedKeys = new Set(selected.map(constituentKey).filter(Boolean));

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || disabled) {
      setResults([]);
      setSearching(false);
      setSearched(false);
      setError("");
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const response = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        );
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not search NXT right now.");
        }
        setResults(Array.isArray(payload?.results) ? payload.results.slice(0, 8) : []);
      } catch (searchError) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Could not search NXT right now.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
          setSearched(true);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [disabled, query]);

  function addConstituent(result) {
    const selection = selectionFromResult(result);
    if (
      !selection.blackbaudConstituentId ||
      selectedKeys.has(selection.blackbaudConstituentId) ||
      selected.length >= MAX_DISCUSSION_CONSTITUENTS
    ) {
      return;
    }
    onChange([...selected, selection]);
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  function removeConstituent(key) {
    onChange(selected.filter((constituent) => constituentKey(constituent) !== key));
  }

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div>
        <label
          htmlFor={inputId}
          style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#374151" }}
        >
          {label} <span style={{ color: "#6B7280", fontWeight: 600 }}>(optional)</span>
        </label>
        <p style={{ margin: "4px 0 0", color: "#6B7280", fontSize: "12px", lineHeight: 1.45 }}>
          Search NXT and add one or more people as topics for this discussion.
        </p>
      </div>

      {selected.length ? (
        <div aria-label="Selected constituents" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {selected.map((constituent) => {
            const key = constituentKey(constituent);
            const isPrimaryAnchor = constituent.isPrimaryAnchor === true;
            return (
              <span
                key={key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  border: "1px solid #BFDBFE",
                  backgroundColor: "#EFF6FF",
                  color: "#1E3A8A",
                  borderRadius: "999px",
                  padding: "7px 9px 7px 11px",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                <UserRound size={14} aria-hidden="true" />
                {constituent.name}
                {isPrimaryAnchor ? (
                  <span style={{ color: "#64748B", fontSize: "10px", fontWeight: 800 }}>
                    Prospect
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeConstituent(key)}
                  disabled={disabled || isPrimaryAnchor}
                  aria-label={
                    isPrimaryAnchor
                      ? `${constituent.name} is the primary prospect`
                      : `Remove ${constituent.name}`
                  }
                  title={
                    isPrimaryAnchor
                      ? "This constituent anchors the prospect discussion"
                      : "Remove constituent"
                  }
                  style={{
                    display: "grid",
                    placeItems: "center",
                    border: 0,
                    background: "transparent",
                    color: "#1E40AF",
                    padding: "1px",
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div style={{ position: "relative" }}>
        <Search
          size={17}
          aria-hidden="true"
          color="#64748B"
          style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          id={inputId}
          type="search"
          value={query}
          disabled={disabled || selected.length >= MAX_DISCUSSION_CONSTITUENTS}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            selected.length >= MAX_DISCUSSION_CONSTITUENTS
              ? `Maximum of ${MAX_DISCUSSION_CONSTITUENTS} selected`
              : "Search by constituent name or lookup ID"
          }
          autoComplete="off"
          style={{
            width: "100%",
            borderRadius: "12px",
            border: "1px solid #D1D5DB",
            padding: "10px 12px 10px 38px",
            fontSize: "14px",
            backgroundColor: "white",
          }}
        />
      </div>

      {searching ? <div role="status" style={{ color: "#64748B", fontSize: "12px" }}>Searching NXT...</div> : null}
      {error ? <div role="alert" style={{ color: "#991B1B", fontSize: "12px", fontWeight: 700 }}>{error}</div> : null}
      {searched && !searching && !error && !results.length ? (
        <div role="status" style={{ color: "#64748B", fontSize: "12px" }}>No matching NXT constituents found.</div>
      ) : null}

      {results.length ? (
        <div
          aria-label="Constituent search results"
          style={{
            display: "grid",
            gap: "6px",
            border: "1px solid #DCE7F7",
            borderRadius: "12px",
            padding: "8px",
            backgroundColor: "white",
          }}
        >
          {results.map((result) => {
            const key = constituentKey(result);
            const isSelected = selectedKeys.has(key);
            return (
              <button
                key={key || result.name}
                type="button"
                disabled={disabled || isSelected || !key}
                onClick={() => addConstituent(result)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  width: "100%",
                  border: 0,
                  borderRadius: "9px",
                  backgroundColor: isSelected ? "#F0FDF4" : "#F8FAFC",
                  color: "#111827",
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: isSelected ? "default" : "pointer",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: "13px" }}>{result.name}</strong>
                  <span style={{ display: "block", marginTop: "2px", color: "#64748B", fontSize: "12px" }}>
                    {result.lookupId || result.blackbaudLookupId || "NXT constituent"}
                    {result.email ? ` · ${result.email}` : ""}
                  </span>
                </span>
                <span style={{ flexShrink: 0, color: isSelected ? "#15803D" : "#4F46E5", fontSize: "12px", fontWeight: 800 }}>
                  {isSelected ? <Check size={16} aria-label="Selected" /> : "Add"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

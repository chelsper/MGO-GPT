"use client";

import { useState } from "react";
import useUser from "@/utils/useUser";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";

const PURPOSE_OPTIONS = [
  "Donor visit preparation",
  "Event invitation",
  "Solicitation",
  "Stewardship",
  "Prospect research",
  "Hustle",
  "Other",
];
const EXCEL_FIELD_OPTIONS = [
  "Constituent Name",
  "Spouse Name",
  "Address",
  "Email",
  "Phone",
  "Employer",
  "Title",
  "Education",
  "JU Advisory Boards",
  "Assigned MGO",
  "Lifetime Giving",
  "Last Gift Date",
  "Last Gift Amount",
  "NXT Wealth Rating",
  "Other",
];
const WHO_INCLUDED_OPTIONS = [
  "All contactable constituents",
  "Alumni (all types)",
  "Alumni (only undergraduate)",
  "Parents (current)",
  "Parents (current/former)",
  "Current donors",
  "Lapsed donors",
  "Prospects with ratings",
  "Event attendees",
  "Trustees",
  "Advisory board members",
  "Other",
];
const MGO_OPTIONS = [
  "Any",
  "Scott Bacon",
  "Erica Beal",
  "Kaye Glover",
  "Gretchen Picotte",
  "Leslie Redd",
];
const EXCLUSION_OPTIONS = [
  "Deceased",
  "No contact",
  "No solicitation",
  "Trustees",
  "Spouses of trustees",
  "Alumni non-graduates",
  "Parent non-graduates",
  "Organizations",
  "Donors in an active pledge",
  "Donors this FY",
  "Other",
];

function RadioButton({ label, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        borderRadius: "10px",
        border: selected ? "2px solid #6A5BFF" : "1px solid #E5E7EB",
        backgroundColor: selected ? "#EDE9FE" : "white",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        marginBottom: "6px",
      }}
    >
      <span
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          border: selected ? "2px solid #6A5BFF" : "2px solid #D1D5DB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {selected && (
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#6A5BFF",
            }}
          />
        )}
      </span>
      <span
        style={{ fontSize: "14px", color: selected ? "#6A5BFF" : "#374151" }}
      >
        {label}
      </span>
    </button>
  );
}

function CheckboxItem({ label, checked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        borderRadius: "10px",
        border: checked ? "2px solid #6A5BFF" : "1px solid #E5E7EB",
        backgroundColor: checked ? "#EDE9FE" : "white",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        marginBottom: "6px",
      }}
    >
      <span
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "4px",
          border: checked ? "2px solid #6A5BFF" : "2px solid #D1D5DB",
          backgroundColor: checked ? "#6A5BFF" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {checked && <Check size={14} color="white" />}
      </span>
      <span
        style={{ fontSize: "14px", color: checked ? "#6A5BFF" : "#374151" }}
      >
        {label}
      </span>
    </button>
  );
}

export default function RequestListPage() {
  const { data: user, loading } = useUser();
  const [requesterName, setRequesterName] = useState("");
  const [dateNeeded, setDateNeeded] = useState("");
  const [purpose, setPurpose] = useState("");
  const [purposeOther, setPurposeOther] = useState("");
  const [outputType, setOutputType] = useState("");
  const [excelFields, setExcelFields] = useState([]);
  const [excelFieldsOther, setExcelFieldsOther] = useState("");
  const [whoIncluded, setWhoIncluded] = useState([]);
  const [whoIncludedOther, setWhoIncludedOther] = useState("");
  const [givingLevel, setGivingLevel] = useState("");
  const [givingLevelCustom, setGivingLevelCustom] = useState("");
  const [giftTimeframe, setGiftTimeframe] = useState("");
  const [giftTimeframeCustomStart, setGiftTimeframeCustomStart] = useState("");
  const [giftTimeframeCustomEnd, setGiftTimeframeCustomEnd] = useState("");
  const [locationFilter, setLocationFilter] = useState("none");
  const [locationState, setLocationState] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationZip, setLocationZip] = useState("");
  const [locationRadiusAddress, setLocationRadiusAddress] = useState("");
  const [locationRadiusMiles, setLocationRadiusMiles] = useState("");
  const [assignedMgo, setAssignedMgo] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [exclusions, setExclusions] = useState([]);
  const [exclusionsOther, setExclusionsOther] = useState("");
  const [priorityLevel, setPriorityLevel] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const toggleArray = (arr, setArr, value) => {
    if (arr.includes(value)) {
      setArr(arr.filter((i) => i !== value));
    } else {
      setArr([...arr, value]);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/list-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to submit list request");
      return res.json();
    },
    onSuccess: () => setSuccess(true),
    onError: (err) => {
      console.error(err);
      setError("Failed to submit. Please try again.");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!dateNeeded) {
      setError("Please enter the date needed.");
      return;
    }
    if (!purpose) {
      setError("Please select a purpose.");
      return;
    }
    if (purpose === "Other" && !purposeOther) {
      setError("Please specify other purpose.");
      return;
    }
    if (!outputType) {
      setError("Please select an output type.");
      return;
    }
    if (!priorityLevel) {
      setError("Please select a priority level.");
      return;
    }

    submitMutation.mutate({
      requesterName: requesterName || user?.name || "",
      dateNeeded,
      purpose,
      purposeOther,
      outputType,
      excelFields,
      excelFieldsOther,
      whoIncluded,
      whoIncludedOther,
      givingLevel,
      givingLevelCustom: givingLevelCustom
        ? parseFloat(givingLevelCustom)
        : null,
      giftTimeframe,
      giftTimeframeCustomStart,
      giftTimeframeCustomEnd,
      locationFilter,
      locationState,
      locationCity,
      locationZip,
      locationRadiusAddress,
      locationRadiusMiles: locationRadiusMiles
        ? parseInt(locationRadiusMiles)
        : null,
      assignedMgo,
      specialInstructions,
      exclusions,
      exclusionsOther,
      priorityLevel,
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

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #D1D5DB",
    borderRadius: "8px",
    fontSize: "14px",
    boxSizing: "border-box",
  };
  const sectionStyle = {
    backgroundColor: "white",
    borderRadius: "12px",
    border: "1px solid #E5E7EB",
    padding: "24px",
    marginBottom: "20px",
  };
  const sectionTitle = {
    fontSize: "16px",
    fontWeight: "700",
    color: "#111827",
    margin: "0 0 16px 0",
  };
  const fieldLabel = {
    display: "block",
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
    marginBottom: "8px",
  };

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
            Request List from DevData
          </h1>
        </div>
      </header>

      <main style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}>
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
            List request submitted successfully!{" "}
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
          {/* Request Basics */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Request Basics</h3>
            <label style={fieldLabel}>Name</label>
            <input
              type="text"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder={user?.name || "Your name"}
              style={{ ...inputStyle, marginBottom: "16px" }}
            />

            <label style={fieldLabel}>Date Needed</label>
            <input
              type="date"
              value={dateNeeded}
              onChange={(e) => setDateNeeded(e.target.value)}
              style={{ ...inputStyle, marginBottom: "16px" }}
            />

            <label style={fieldLabel}>Purpose of List</label>
            {PURPOSE_OPTIONS.map((opt) => (
              <RadioButton
                key={opt}
                label={opt}
                selected={purpose === opt}
                onClick={() => setPurpose(opt)}
              />
            ))}
            {purpose === "Other" && (
              <input
                type="text"
                value={purposeOther}
                onChange={(e) => setPurposeOther(e.target.value)}
                placeholder="Please specify"
                style={{ ...inputStyle, marginTop: "8px" }}
              />
            )}
          </div>

          {/* Output Type */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Output Type</h3>
            <RadioButton
              label="NXT List only"
              selected={outputType === "nxt_only"}
              onClick={() => setOutputType("nxt_only")}
            />
            <RadioButton
              label="Excel spreadsheet only"
              selected={outputType === "excel_only"}
              onClick={() => setOutputType("excel_only")}
            />
            <RadioButton
              label="Both NXT list and Excel spreadsheet"
              selected={outputType === "both"}
              onClick={() => setOutputType("both")}
            />
          </div>

          {/* Excel Fields */}
          {(outputType === "excel_only" || outputType === "both") && (
            <div style={sectionStyle}>
              <h3 style={sectionTitle}>Excel Output Fields</h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "#6B7280",
                  marginBottom: "12px",
                }}
              >
                Which fields should be included?
              </p>
              {EXCEL_FIELD_OPTIONS.map((f) => (
                <CheckboxItem
                  key={f}
                  label={f}
                  checked={excelFields.includes(f)}
                  onClick={() => toggleArray(excelFields, setExcelFields, f)}
                />
              ))}
              {excelFields.includes("Other") && (
                <input
                  type="text"
                  value={excelFieldsOther}
                  onChange={(e) => setExcelFieldsOther(e.target.value)}
                  placeholder="Please specify"
                  style={{ ...inputStyle, marginTop: "8px" }}
                />
              )}
            </div>
          )}

          {/* List Criteria */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>List Criteria</h3>

            <label style={fieldLabel}>Who should be included?</label>
            {WHO_INCLUDED_OPTIONS.map((opt) => (
              <CheckboxItem
                key={opt}
                label={opt}
                checked={whoIncluded.includes(opt)}
                onClick={() => toggleArray(whoIncluded, setWhoIncluded, opt)}
              />
            ))}
            {whoIncluded.includes("Other") && (
              <input
                type="text"
                value={whoIncludedOther}
                onChange={(e) => setWhoIncludedOther(e.target.value)}
                placeholder="Please specify"
                style={{
                  ...inputStyle,
                  marginTop: "8px",
                  marginBottom: "16px",
                }}
              />
            )}

            <label style={{ ...fieldLabel, marginTop: "20px" }}>
              Giving Level
            </label>
            {[
              "Any giving history",
              "$1+ lifetime",
              "$1,000+",
              "$10,000+",
              "$100,000+",
              "Custom amount",
            ].map((level) => (
              <RadioButton
                key={level}
                label={level}
                selected={givingLevel === level}
                onClick={() => setGivingLevel(level)}
              />
            ))}
            {givingLevel === "Custom amount" && (
              <input
                type="number"
                value={givingLevelCustom}
                onChange={(e) => setGivingLevelCustom(e.target.value)}
                placeholder="Enter amount"
                style={{ ...inputStyle, marginTop: "8px" }}
              />
            )}

            <label style={{ ...fieldLabel, marginTop: "20px" }}>
              Gift Timeframe
            </label>
            {[
              "Any time",
              "Last 12 months",
              "Last 3 years",
              "Last 5 years",
              "Custom range",
            ].map((tf) => (
              <RadioButton
                key={tf}
                label={tf}
                selected={giftTimeframe === tf}
                onClick={() => setGiftTimeframe(tf)}
              />
            ))}
            {giftTimeframe === "Custom range" && (
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <input
                  type="date"
                  value={giftTimeframeCustomStart}
                  onChange={(e) => setGiftTimeframeCustomStart(e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="date"
                  value={giftTimeframeCustomEnd}
                  onChange={(e) => setGiftTimeframeCustomEnd(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            <label style={{ ...fieldLabel, marginTop: "20px" }}>
              Location Filter
            </label>
            {["None", "State", "City", "Zip code", "Radius from location"].map(
              (f) => (
                <RadioButton
                  key={f}
                  label={f}
                  selected={locationFilter === f.toLowerCase()}
                  onClick={() => setLocationFilter(f.toLowerCase())}
                />
              ),
            )}
            {locationFilter === "state" && (
              <input
                type="text"
                value={locationState}
                onChange={(e) => setLocationState(e.target.value)}
                placeholder="State"
                style={{ ...inputStyle, marginTop: "8px" }}
              />
            )}
            {locationFilter === "city" && (
              <input
                type="text"
                value={locationCity}
                onChange={(e) => setLocationCity(e.target.value)}
                placeholder="City"
                style={{ ...inputStyle, marginTop: "8px" }}
              />
            )}
            {locationFilter === "zip code" && (
              <input
                type="text"
                value={locationZip}
                onChange={(e) => setLocationZip(e.target.value)}
                placeholder="Zip code"
                style={{ ...inputStyle, marginTop: "8px" }}
              />
            )}
            {locationFilter === "radius from location" && (
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <input
                  type="text"
                  value={locationRadiusAddress}
                  onChange={(e) => setLocationRadiusAddress(e.target.value)}
                  placeholder="Address"
                  style={inputStyle}
                />
                <input
                  type="number"
                  value={locationRadiusMiles}
                  onChange={(e) => setLocationRadiusMiles(e.target.value)}
                  placeholder="Miles"
                  style={{ ...inputStyle, maxWidth: "120px" }}
                />
              </div>
            )}

            <label style={{ ...fieldLabel, marginTop: "20px" }}>
              Assigned to MGO
            </label>
            {MGO_OPTIONS.map((mgo) => (
              <RadioButton
                key={mgo}
                label={mgo}
                selected={assignedMgo === mgo}
                onClick={() => setAssignedMgo(mgo)}
              />
            ))}
          </div>

          {/* Special Instructions & Exclusions */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Special Instructions</h3>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Anything else we should know?"
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "inherit",
                marginBottom: "20px",
              }}
            />

            <label style={fieldLabel}>Exclusions</label>
            {EXCLUSION_OPTIONS.map((exc) => (
              <CheckboxItem
                key={exc}
                label={exc}
                checked={exclusions.includes(exc)}
                onClick={() => toggleArray(exclusions, setExclusions, exc)}
              />
            ))}
            {exclusions.includes("Other") && (
              <input
                type="text"
                value={exclusionsOther}
                onChange={(e) => setExclusionsOther(e.target.value)}
                placeholder="Please specify"
                style={{ ...inputStyle, marginTop: "8px" }}
              />
            )}
          </div>

          {/* Priority */}
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Priority Level</h3>
            <RadioButton
              label="Future (6+ days)"
              selected={priorityLevel === "future"}
              onClick={() => setPriorityLevel("future")}
            />
            <RadioButton
              label="Normal (3-5 business days)"
              selected={priorityLevel === "normal"}
              onClick={() => setPriorityLevel("normal")}
            />
            <RadioButton
              label="Urgent (1-2 days)"
              selected={priorityLevel === "urgent"}
              onClick={() => setPriorityLevel("urgent")}
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
            {submitMutation.isPending ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import useUser from "@/utils/useUser";
import useUpload from "@/utils/useUpload";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Camera, Upload } from "lucide-react";

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getDefaultFY() {
  const now = new Date();
  const fiscalYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `FY${String(fiscalYear).slice(-2)}`;
}

export default function NewConstituentPage() {
  const { data: user, loading } = useUser();
  const [upload, { loading: uploadLoading }] = useUpload();
  const fileInputRef = useRef(null);

  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [assignToMe, setAssignToMe] = useState("yes");
  const [businessCardUrl, setBusinessCardUrl] = useState(null);
  const [businessCardPreview, setBusinessCardPreview] = useState(null);
  const [error, setError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [success, setSuccess] = useState(false);
  const [existingProspects, setExistingProspects] = useState([]);
  const [blackbaudMatches, setBlackbaudMatches] = useState([]);
  const [loadingProspects, setLoadingProspects] = useState(true);
  const [addToProspects, setAddToProspects] = useState(false);
  const [prospectError, setProspectError] = useState("");
  const [prospectAdded, setProspectAdded] = useState(false);
  const [selectedBlackbaudMatch, setSelectedBlackbaudMatch] = useState(null);
  const [existingMatchActions, setExistingMatchActions] = useState({
    dataUpdate: false,
    assignToMe: false,
    addToProspects: false,
  });

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function loadProspects() {
      setLoadingProspects(true);
      try {
        const response = await fetch("/api/prospects");
        if (!response.ok) {
          throw new Error("Failed to load prospects");
        }
        const data = await response.json();
        if (active) {
          setExistingProspects(Array.isArray(data) ? data : []);
        }
      } catch (prospectLoadError) {
        console.error("Prospect lookup error:", prospectLoadError);
      } finally {
        if (active) {
          setLoadingProspects(false);
        }
      }
    }

    loadProspects();
    return () => {
      active = false;
    };
  }, [user]);

  const normalizedName = normalizeName(name);
  const alreadyTrackedAsProspect =
    normalizedName &&
    existingProspects.some(
      (prospect) => normalizeName(prospect.prospect_name) === normalizedName,
    );
  const blackbaudExactMatch =
    normalizedName &&
    blackbaudMatches.find((match) => normalizeName(match?.name) === normalizedName);
  const activeBlackbaudMatch = selectedBlackbaudMatch || blackbaudExactMatch || null;

  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      setBlackbaudMatches([]);
      setSelectedBlackbaudMatch(null);
      setExistingMatchActions({
        dataUpdate: false,
        assignToMe: false,
        addToProspects: false,
      });
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(query)}`,
        );
        if (!response.ok) {
          if (active) setBlackbaudMatches([]);
          return;
        }

        const data = await response.json();
        if (active) {
          const results = Array.isArray(data?.results) ? data.results : [];
          setBlackbaudMatches(results);
          setSelectedBlackbaudMatch((current) =>
            results.find(
              (match) =>
                match.blackbaudConstituentId === current?.blackbaudConstituentId,
            ) || null,
          );
        }
      } catch (searchError) {
        console.error("Blackbaud constituent lookup error:", searchError);
        if (active) setBlackbaudMatches([]);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [name]);

  const handleFileSelected = async (file) => {
    if (!file) return;
    setError("");
    setUploadWarning("");
    setSuccess(false);

    const previewUrl = URL.createObjectURL(file);
    setBusinessCardPreview(previewUrl);

    const { url, error: uploadError } = await upload({ file });
    if (uploadError) {
      setBusinessCardUrl(null);
      setUploadWarning(
        "Business card image could not be attached. You can still submit this constituent manually.",
      );
      return;
    }

    setBusinessCardUrl(url);
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("capture", "");
      fileInputRef.current.removeAttribute("capture");
      fileInputRef.current.click();
    }
  };

  const handleCameraClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("capture", "environment");
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelected(file);
    }
    // Reset so the same file can be selected again
    e.target.value = "";
  };

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/submissions/constituent-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error || "Failed to submit constituent suggestion",
        );
      }
      return res.json();
    },
    onSuccess: async (data) => {
      setSuccess(true);
      setProspectError("");
      setProspectAdded(false);
      const submittedConstituentId = data?.constituent_id || null;
      const shouldAddToProspects = addToProspects && !alreadyTrackedAsProspect;
      const submittedProspect = {
        prospectName: name.trim(),
        constituentId: submittedConstituentId,
        askAmount: null,
        expectedCloseFY: getDefaultFY(),
        askType: "Major Gift",
        blackbaudConstituentId:
          data?.blackbaud_constituent_id ||
          selectedBlackbaudMatch?.blackbaudConstituentId ||
          null,
      };
      setName("");
      setOrganization("");
      setEmail("");
      setPhone("");
      setNotes("");
      setAssignToMe("yes");
      setBusinessCardUrl(null);
      setBusinessCardPreview(null);
      setUploadWarning("");
      setAddToProspects(false);
      setSelectedBlackbaudMatch(null);

      if (shouldAddToProspects) {
        try {
          const createdProspect = await addProspectMutation.mutateAsync(
            submittedProspect,
          );
          setProspectAdded(true);
          setExistingProspects((current) => [...current, createdProspect]);
        } catch {
          // handled in mutation onError
        }
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
      setProspectError("");
    },
    onError: (err) => {
      console.error(err);
      setProspectError(err?.message || "Failed to add prospect.");
    },
  });

  const donorUpdateMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/submissions/donor-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to submit donor update");
      }
      return res.json();
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
    setProspectError("");
    setProspectAdded(false);

    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }

    if (activeBlackbaudMatch) {
      const {
        dataUpdate,
        assignToMe: requestAssignment,
        addToProspects: shouldAddToProspects,
      } = existingMatchActions;

      if (!dataUpdate && !requestAssignment && !shouldAddToProspects) {
        setError(
          "This person may already exist in Raiser's Edge NXT. Select at least one action or clear the existing match.",
        );
        return;
      }

      const updateNotes = [
        notes?.trim() || null,
        requestAssignment ? "Assignment request: please assign me to this constituent." : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      donorUpdateMutation.mutate(
        {
          donorName: activeBlackbaudMatch.name || name,
          interactionType: dataUpdate ? "Data Update" : "Existing Constituent Request",
          transcript: null,
          notes: updateNotes || null,
          nextStep: requestAssignment ? "Please assign me to this constituent." : null,
          estimatedAmount: null,
          blackbaudConstituentId: activeBlackbaudMatch.blackbaudConstituentId,
          createNewConstituent: false,
        },
        {
          onSuccess: async (data) => {
            setSuccess(true);
            setProspectError("");
            setProspectAdded(false);

            if (shouldAddToProspects && !alreadyTrackedAsProspect) {
              try {
                const createdProspect = await addProspectMutation.mutateAsync({
                  prospectName: activeBlackbaudMatch.name || name.trim(),
                  constituentId: data?.constituent_id || null,
                  askAmount: null,
                  expectedCloseFY: getDefaultFY(),
                  askType: "Major Gift",
                  blackbaudConstituentId: activeBlackbaudMatch.blackbaudConstituentId,
                });
                setProspectAdded(true);
                setExistingProspects((current) => [...current, createdProspect]);
              } catch {
                // handled in mutation onError
              }
            }

            setName("");
            setOrganization("");
            setEmail("");
            setPhone("");
            setNotes("");
            setAssignToMe("yes");
            setBusinessCardUrl(null);
            setBusinessCardPreview(null);
            setUploadWarning("");
            setAddToProspects(false);
            setSelectedBlackbaudMatch(null);
            setExistingMatchActions({
              dataUpdate: false,
              assignToMe: false,
              addToProspects: false,
            });
          },
        },
      );
      return;
    }

    submitMutation.mutate({
      name,
      organization,
      email,
      phone,
      notes,
      assignToMe,
      businessCardUrl,
      blackbaudConstituentId: null,
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

  const isProcessing = uploadLoading;

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
            Suggest New Constituent
          </h1>
        </div>
      </header>

      <main style={{ maxWidth: "700px", margin: "0 auto", padding: "24px 24px 140px" }}>
        {(submitMutation.isPending || donorUpdateMutation.isPending) && (
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
            Sending your submission to the review queue...
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
            Constituent suggestion submitted successfully.{" "}
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

        {uploadWarning && (
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
            {uploadWarning}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          {/* Business Card Photo Section */}
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
              Business Card Photo
            </label>

            {/* Preview area */}
            <div
              style={{
                width: "100%",
                height: "180px",
                backgroundColor: businessCardPreview ? "#F9FAFB" : "#F3F4F6",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                marginBottom: "16px",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {businessCardPreview ? (
                <img
                  src={businessCardPreview}
                  alt="Business card"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div style={{ textAlign: "center" }}>
                  <Camera
                    size={36}
                    color="#9CA3AF"
                    style={{ margin: "0 auto 8px" }}
                  />
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#9CA3AF",
                      margin: 0,
                    }}
                  >
                    No photo selected
                  </p>
                </div>
              )}
            </div>

            <div
              style={{
                marginBottom: "16px",
                padding: "10px 12px",
                borderRadius: "10px",
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
                color: "#6B7280",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              Business card AI autofill is temporarily unavailable. You can still attach a card image for reviewer context and submit the constituent manually.
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="button"
                onClick={handleCameraClick}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "12px",
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#374151",
                  cursor: isProcessing ? "not-allowed" : "pointer",
                  opacity: isProcessing ? 0.5 : 1,
                }}
              >
                <Camera size={18} />
                Take Photo
              </button>
              <button
                type="button"
                onClick={handleUploadClick}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "12px",
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#374151",
                  cursor: isProcessing ? "not-allowed" : "pointer",
                  opacity: isProcessing ? 0.5 : 1,
                }}
              >
                <Upload size={18} />
                Upload
              </button>
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
                marginBottom: "10px",
              }}
            >
              Top Prospects
            </label>

            {activeBlackbaudMatch ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                  color: "#6B7280",
                  fontSize: "14px",
                }}
              >
                Use the existing NXT options in the match warning below if this person should also be added to top prospects.
              </div>
            ) : alreadyTrackedAsProspect ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  backgroundColor: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  color: "#065F46",
                  fontSize: "14px",
                }}
              >
                This constituent is already on your top prospects list.
              </div>
            ) : (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                  cursor: loadingProspects ? "wait" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={addToProspects}
                  disabled={loadingProspects || !name.trim()}
                  onChange={(event) => setAddToProspects(event.target.checked)}
                  style={{ marginTop: "2px" }}
                />
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                    Add to top prospects list after submission
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
                    Use this when the suggested constituent should move directly into your active prospect pipeline.
                  </div>
                </div>
              </label>
            )}
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
              Name <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSelectedBlackbaudMatch(null);
                setExistingMatchActions({
                  dataUpdate: false,
                  assignToMe: false,
                  addToProspects: false,
                });
              }}
              placeholder="Full name"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
            {blackbaudMatches.length > 0 ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
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
                    marginBottom: "8px",
                  }}
                >
                  Blackbaud matches
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {blackbaudMatches.slice(0, 3).map((match) => {
                    const selected =
                      selectedBlackbaudMatch?.blackbaudConstituentId ===
                        match.blackbaudConstituentId ||
                      (!selectedBlackbaudMatch &&
                        blackbaudExactMatch?.blackbaudConstituentId ===
                          match.blackbaudConstituentId);
                    return (
                      <div
                        key={match.blackbaudConstituentId || match.name}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: selected
                            ? "2px solid #2563EB"
                            : "1px solid #DBEAFE",
                          backgroundColor: selected ? "#DBEAFE" : "white",
                        }}
                      >
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
                          {match.name || "Unnamed constituent"}
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#4B5563" }}>
                          Blackbaud ID: {match.blackbaudConstituentId || "Unknown"}
                        </div>
                        {match.lookupId ? (
                          <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
                            Lookup ID: {match.lookupId}
                          </div>
                        ) : null}
                        {match.email ? (
                          <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
                            Email: {match.email}
                          </div>
                        ) : null}
                        {match.phone ? (
                          <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
                            Phone: {match.phone}
                          </div>
                        ) : null}
                        {match.address ? (
                          <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563", whiteSpace: "pre-line" }}>
                            Address: {match.address}
                          </div>
                        ) : null}
                        <div style={{ marginTop: "10px" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBlackbaudMatch(match);
                              setName(match.name || name);
                              setEmail(match.email || email);
                              setPhone(match.phone || phone);
                            }}
                            style={{
                              padding: "7px 12px",
                              borderRadius: "999px",
                              border: selected
                                ? "1px solid #1D4ED8"
                                : "1px solid #93C5FD",
                              backgroundColor: selected ? "#1D4ED8" : "white",
                              color: selected ? "white" : "#1D4ED8",
                              fontSize: "12px",
                              fontWeight: "700",
                              cursor: "pointer",
                            }}
                          >
                            {selected
                              ? "Existing NXT match selected"
                              : "Use this existing NXT constituent"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {activeBlackbaudMatch ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #FDE68A",
                  backgroundColor: "#FFFBEB",
                  fontSize: "13px",
                  color: "#92400E",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                  This person may already exist in Raiser's Edge NXT.
                </div>
                <div style={{ marginBottom: "10px" }}>
                  Selected match: <strong>{activeBlackbaudMatch.name}</strong>{" "}
                  ({activeBlackbaudMatch.blackbaudConstituentId})
                </div>
                <div style={{ marginBottom: "8px", fontWeight: 600 }}>
                  Do you have an update to add on this constituent?
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={existingMatchActions.dataUpdate}
                      onChange={(event) =>
                        setExistingMatchActions((current) => ({
                          ...current,
                          dataUpdate: event.target.checked,
                        }))
                      }
                      style={{ marginTop: "2px" }}
                    />
                    <span>It&apos;s a data update</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={existingMatchActions.assignToMe}
                      onChange={(event) =>
                        setExistingMatchActions((current) => ({
                          ...current,
                          assignToMe: event.target.checked,
                        }))
                      }
                      style={{ marginTop: "2px" }}
                    />
                    <span>Assign me to them</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={existingMatchActions.addToProspects}
                      disabled={alreadyTrackedAsProspect}
                      onChange={(event) =>
                        setExistingMatchActions((current) => ({
                          ...current,
                          addToProspects: event.target.checked,
                        }))
                      }
                      style={{ marginTop: "2px" }}
                    />
                    <span>
                      Add to top prospects
                      {alreadyTrackedAsProspect ? " (already on your list)" : ""}
                    </span>
                  </label>
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
                marginBottom: "8px",
              }}
            >
              Organization
            </label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Company or organization"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                boxSizing: "border-box",
                marginBottom: "16px",
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                boxSizing: "border-box",
                marginBottom: "16px",
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
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
              placeholder="How did you meet them? Why should they be added?"
              rows={4}
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
              Assign to me?
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {["yes", "no"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAssignToMe(opt)}
                  style={{
                    padding: "8px 24px",
                    borderRadius: "999px",
                    fontSize: "13px",
                    fontWeight: "600",
                    border:
                      assignToMe === opt
                        ? "2px solid #6A5BFF"
                        : "1px solid #E5E7EB",
                    backgroundColor: assignToMe === opt ? "#EDE9FE" : "white",
                    color: assignToMe === opt ? "#6A5BFF" : "#6B7280",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              position: "sticky",
              bottom: "16px",
              marginTop: "20px",
              padding: "14px 16px",
              borderRadius: "16px",
              border: "1px solid #E5E7EB",
              backgroundColor: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: "220px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#6B7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: "4px",
                }}
              >
                Ready to send
              </div>
              <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.5 }}>
                Submit this constituent suggestion into the shared review queue.
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginLeft: "auto" }}>
              <a
                href="/"
                style={{
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid #D1D5DB",
                  backgroundColor: "white",
                  color: "#374151",
                  fontSize: "14px",
                  fontWeight: "600",
                  textDecoration: "none",
                }}
              >
                Cancel
              </a>
              <button
                type="submit"
                disabled={
                  submitMutation.isPending ||
                  donorUpdateMutation.isPending ||
                  isProcessing
                }
                style={{
                  minWidth: "180px",
                  padding: "12px 18px",
                  backgroundColor:
                    submitMutation.isPending ||
                    donorUpdateMutation.isPending ||
                    isProcessing
                      ? "#9CA3AF"
                      : "#6A5BFF",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: "700",
                  cursor:
                    submitMutation.isPending ||
                    donorUpdateMutation.isPending ||
                    isProcessing
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {submitMutation.isPending || donorUpdateMutation.isPending
                  ? "Submitting..."
                  : activeBlackbaudMatch
                    ? "Submit Existing Constituent Request"
                    : "Submit Suggestion"}
              </button>
            </div>
          </div>
        </form>
      </main>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

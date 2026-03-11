"use client";

import { useState, useRef } from "react";
import useUser from "@/utils/useUser";
import useUpload from "@/utils/useUpload";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Camera, Upload } from "lucide-react";

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
    onSuccess: () => {
      setSuccess(true);
      setName("");
      setOrganization("");
      setEmail("");
      setPhone("");
      setNotes("");
      setAssignToMe("yes");
      setBusinessCardUrl(null);
      setBusinessCardPreview(null);
      setUploadWarning("");
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

    if (!name.trim()) {
      setError("Please enter a name.");
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
            Sending your constituent suggestion to the submission tracker...
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
                marginBottom: "8px",
              }}
            >
              Name <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
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

          <button
            type="submit"
            disabled={submitMutation.isPending || isProcessing}
            style={{
              width: "100%",
              padding: "14px",
              backgroundColor:
                submitMutation.isPending || isProcessing
                  ? "#9CA3AF"
                  : "#6A5BFF",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: "600",
              cursor:
                submitMutation.isPending || isProcessing
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Suggestion"}
          </button>
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

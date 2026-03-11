"use client";

import { useState, useRef, useCallback } from "react";
import useUser from "@/utils/useUser";
import useUpload from "@/utils/useUpload";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Camera, Upload, Loader2 } from "lucide-react";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to process image"));
    image.src = dataUrl;
  });
}

async function shrinkImageDataUrl(dataUrl) {
  const image = await loadImage(dataUrl);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is unavailable in this browser");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const maxLength = 900_000;
  let quality = 0.78;
  let compressed = canvas.toDataURL("image/jpeg", quality);

  while (compressed.length > maxLength && quality > 0.35) {
    quality -= 0.08;
    compressed = canvas.toDataURL("image/jpeg", quality);
  }

  return compressed;
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
  const [isScanningCard, setIsScanningCard] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [success, setSuccess] = useState(false);

  const readBusinessCard = useCallback(
    async ({ imageUrl, imageDataUrl }) => {
      setIsScanningCard(true);
      setScanMessage("Scanning business card and filling form fields...");
      try {
        const response = await fetch("/api/read-business-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl, imageDataUrl }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            payload?.details || payload?.error || "Failed to read business card",
          );
        }

        const data = await response.json();

        if (data.extractedFields) {
          const fields = data.extractedFields;
          if (fields.name && !name) setName(fields.name);
          if (fields.organization && !organization)
            setOrganization(fields.organization);
          if (fields.email && !email) setEmail(fields.email);
          if (fields.phone && !phone) setPhone(fields.phone);
          if (fields.notes && !notes) setNotes(fields.notes);
          setScanMessage("Business card scanned. Review the suggested fields.");
        } else {
          setScanMessage("Card uploaded, but no contact fields were detected.");
        }
      } catch (err) {
        console.error("Business card scan error:", err);
        setError(err?.message || "Could not read the business card.");
        setScanMessage("");
      } finally {
        setIsScanningCard(false);
      }
    },
    [name, organization, email, phone, notes],
  );

  const handleFileSelected = useCallback(
    async (file) => {
      if (!file) return;
      setError("");
      setUploadWarning("");
      setSuccess(false);
      setScanMessage("");

      // Show preview
      const previewUrl = URL.createObjectURL(file);
      setBusinessCardPreview(previewUrl);

      let imageDataUrl;
      try {
        const originalDataUrl = await fileToDataUrl(file);
        imageDataUrl = await shrinkImageDataUrl(originalDataUrl);
      } catch (readError) {
        setError("Could not read the selected image. Please try another file.");
        setBusinessCardPreview(null);
        return;
      }

      // Upload
      const base64Payload = imageDataUrl.split(",")[1];
      const { url, error: uploadError } = await upload({
        base64: base64Payload,
      });
      if (uploadError) {
        setBusinessCardUrl(null);
        setUploadWarning(
          "Business card image could not be attached, but the card can still be scanned and submitted.",
        );
        await readBusinessCard({ imageUrl: null, imageDataUrl });
        return;
      }

      setBusinessCardUrl(url);
      readBusinessCard({ imageUrl: url, imageDataUrl });
    },
    [upload, readBusinessCard],
  );

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

  const isProcessing = uploadLoading || isScanningCard;

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
                marginBottom: isScanningCard ? "8px" : "16px",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {businessCardPreview ? (
                <>
                  <img
                    src={businessCardPreview}
                    alt="Business card"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  {isScanningCard && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: "white",
                          borderRadius: "12px",
                          padding: "16px 24px",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <Loader2
                          size={20}
                          color="#6A5BFF"
                          style={{ animation: "spin 1s linear infinite" }}
                        />
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "#111827",
                          }}
                        >
                          Reading card...
                        </span>
                      </div>
                    </div>
                  )}
                </>
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

            {/* Scanning indicator */}
            {isScanningCard && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    borderRadius: "8px",
                    backgroundColor: "#EDE9FE",
                    color: "#6A5BFF",
                    fontSize: "13px",
                    fontWeight: "500",
                  }}
                >
                  {scanMessage || "Scanning business card & auto-filling fields..."}
                </span>
              </div>
            )}

            {!isScanningCard && scanMessage ? (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  backgroundColor: "#ECFDF5",
                  color: "#065F46",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {scanMessage}
              </div>
            ) : null}

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

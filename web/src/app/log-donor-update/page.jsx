"use client";

import { useState, useRef, useEffect } from "react";
import useUser from "@/utils/useUser";
import useUpload from "@/utils/useUpload";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Mic, Square, Loader } from "lucide-react";

const INTERACTION_TYPES = ["visit", "call", "email", "event"];

export default function LogDonorUpdatePage() {
  const { data: user, loading } = useUser();
  const [upload, { loading: uploadLoading }] = useUpload();
  const [donorName, setDonorName] = useState("");
  const [interactionType, setInteractionType] = useState("visit");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = mediaRecorder.mimeType;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await transcribeAudio(blob, mimeType);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone error:", err);
      setError(
        "Could not access your microphone. Please allow microphone access and try again.",
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const transcribeAudio = async (blob, mimeType) => {
    setIsTranscribing(true);
    setError("");

    try {
      // Determine file extension from mime type
      let ext = "webm";
      if (mimeType.includes("mp4")) ext = "m4a";
      else if (mimeType.includes("ogg")) ext = "ogg";
      else if (mimeType.includes("wav")) ext = "wav";

      const file = new File([blob], `recording.${ext}`, { type: mimeType });

      // Upload the audio file
      const uploadResult = await upload({ file });

      if (uploadResult.error) {
        throw new Error("Failed to upload audio: " + uploadResult.error);
      }

      const audioUrl = uploadResult.url;

      // Send to transcribe endpoint
      const transcriptionResponse = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl }),
      });

      if (!transcriptionResponse.ok) {
        throw new Error("Transcription failed");
      }

      const data = await transcriptionResponse.json();
      const transcriptText = data.transcript || "";
      setTranscript(transcriptText);

      // Append transcript to notes
      if (transcriptText) {
        setNotes((prev) => {
          if (prev.trim()) {
            return prev.trim() + "\n\n" + transcriptText;
          }
          return transcriptText;
        });
      }

      // Auto-fill fields from extracted data
      if (data.extractedFields) {
        const fields = data.extractedFields;
        if (fields.donorName && !donorName) {
          setDonorName(fields.donorName);
        }
        if (
          fields.interactionType &&
          INTERACTION_TYPES.includes(fields.interactionType)
        ) {
          setInteractionType(fields.interactionType);
        }
        if (fields.estimatedAmount && !estimatedAmount) {
          setEstimatedAmount(fields.estimatedAmount.toString());
        }
        if (fields.nextStep && !nextStep) {
          setNextStep(fields.nextStep);
        }
      }
    } catch (err) {
      console.error("Transcription error:", err);
      setError("Failed to transcribe audio. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/submissions/donor-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to submit donor update");
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      setDonorName("");
      setInteractionType("visit");
      setNotes("");
      setTranscript("");
      setNextStep("");
      setEstimatedAmount("");
    },
    onError: (err) => {
      console.error(err);
      setError("Failed to submit. Please try again.");
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

    submitMutation.mutate({
      donorName,
      interactionType,
      notes,
      nextStep,
      estimatedAmount: estimatedAmount ? parseFloat(estimatedAmount) : null,
      transcript,
      attachments: [],
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
            Log Donor Update
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
            Donor update submitted successfully!{" "}
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
          {/* Donor Name */}
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
              onChange={(e) => setDonorName(e.target.value)}
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
          </div>

          {/* Interaction Type */}
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
              Interaction Type
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {INTERACTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setInteractionType(type)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "999px",
                    fontSize: "13px",
                    fontWeight: "600",
                    border:
                      interactionType === type
                        ? "2px solid #6A5BFF"
                        : "1px solid #E5E7EB",
                    backgroundColor:
                      interactionType === type ? "#EDE9FE" : "white",
                    color: interactionType === type ? "#6A5BFF" : "#6B7280",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Interaction Notes with Mic */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "24px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <label
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#374151",
                }}
              >
                Interaction Notes
              </label>
              {transcript && (
                <span
                  style={{
                    padding: "2px 8px",
                    backgroundColor: "#D1FAE5",
                    color: "#065F46",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "700",
                    letterSpacing: "0.5px",
                  }}
                >
                  TRANSCRIBED
                </span>
              )}
            </div>

            <div style={{ position: "relative" }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tap the mic to dictate, or type your notes..."
                rows={6}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  paddingBottom: "56px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  minHeight: "150px",
                }}
              />

              {/* Mic bar at bottom of textarea */}
              <div
                style={{
                  position: "absolute",
                  bottom: "1px",
                  left: "1px",
                  right: "1px",
                  height: "48px",
                  borderBottomLeftRadius: "7px",
                  borderBottomRightRadius: "7px",
                  backgroundColor: "#F9FAFB",
                  borderTop: "1px solid #E5E7EB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                {isTranscribing ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Loader
                      size={16}
                      color="#6A5BFF"
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: "#6A5BFF",
                      }}
                    >
                      Transcribing...
                    </span>
                  </div>
                ) : isRecording ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      width: "100%",
                      padding: "0 12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        flex: 1,
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: "#DC2626",
                          animation: "pulse 1s ease-in-out infinite",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: "500",
                          color: "#DC2626",
                        }}
                      >
                        Listening... {formatDuration(recordingDuration)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={stopRecording}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        backgroundColor: "#DC2626",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <Square size={14} color="white" fill="white" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "6px 12px",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        backgroundColor: "#6A5BFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Mic size={16} color="white" />
                    </div>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: "#6A5BFF",
                      }}
                    >
                      Tap to dictate
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Next Step */}
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
              Next Step
            </label>
            <input
              type="text"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="What's the next step?"
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

          {/* Estimated Amount */}
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
              Estimated Ask Amount
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

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

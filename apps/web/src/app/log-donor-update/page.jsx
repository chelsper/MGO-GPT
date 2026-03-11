"use client";

import { useState, useRef, useEffect } from "react";
import useUser from "@/utils/useUser";
import useUpload from "@/utils/useUpload";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Mic, Square, Loader, Upload } from "lucide-react";

const INTERACTION_TYPES = ["visit", "call", "email", "event"];
const SUPPORTED_AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
];

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
  const [transcriptionStatus, setTranscriptionStatus] = useState("");
  const [transcriptionError, setTranscriptionError] = useState("");
  const [lastAudioFileName, setLastAudioFileName] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionTranscriptRef = useRef("");
  const recognitionDisplayRef = useRef("");
  const recognitionFinalizedRef = useRef(false);
  const notesBeforeDictationRef = useRef("");

  const supportsMediaRecording =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined";

  const supportsSpeechRecognition =
    typeof window !== "undefined" &&
    (typeof window.SpeechRecognition !== "undefined" ||
      typeof window.webkitSpeechRecognition !== "undefined");

  const getSupportedMimeType = () => {
    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
      return "";
    }

    return (
      SUPPORTED_AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || ""
    );
  };

  const buildTranscriptionMessage = (stage, details) => {
    const stageLabel = {
      upload: "uploading the recording",
      download: "preparing the uploaded audio",
      transcription: "transcribing the audio",
      request: "sending the audio",
      unsupported: "starting microphone recording",
      unknown: "processing the recording",
    }[stage || "unknown"];

    return details
      ? `There was a problem ${stageLabel}: ${details}`
      : `There was a problem ${stageLabel}.`;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      }
    };
  }, []);

  const stopRecordingTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecordingTimer = () => {
    stopRecordingTimer();
    setRecordingDuration(0);
    timerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  };

  const appendTranscriptToNotes = (transcriptText) => {
    if (!transcriptText) return;

    setTranscript(transcriptText);
    setNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${transcriptText}` : transcriptText));
    setTranscriptionStatus("Transcript added to notes.");
    setTranscriptionError("");
  };

  const finishLiveTranscript = (text) => {
    stopRecordingTimer();
    setIsRecording(false);
    setLastAudioFileName("Live dictation");

    const transcriptText = text.trim();
    setLiveTranscript("");
    recognitionDisplayRef.current = "";

    if (!transcriptText) {
      setTranscriptionStatus("");
      setTranscriptionError("No speech was detected. Try again or upload an audio file.");
      return;
    }

    setTranscript(transcriptText);
    setNotes((prev) => {
      const liveNotes = prev.trim();
      const baseNotes = notesBeforeDictationRef.current.trim();
      return liveNotes || baseNotes || transcriptText;
    });
    setTranscriptionStatus("Transcript added to notes.");
    setTranscriptionError("");
  };

  const startRecording = async () => {
    setError("");
    setTranscriptionError("");
    setTranscriptionStatus("");
    setLastAudioFileName("");
    setLiveTranscript("");
    recognitionDisplayRef.current = "";
    notesBeforeDictationRef.current = notes;

    if (supportsSpeechRecognition) {
      try {
        const SpeechRecognition =
          window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognitionTranscriptRef.current = "";
        recognitionDisplayRef.current = "";
        recognitionFinalizedRef.current = false;
        speechRecognitionRef.current = recognition;

        recognition.onresult = (event) => {
          let finalTranscript = "";
          let interimTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const text = result[0]?.transcript || "";
            if (result.isFinal) {
              finalTranscript += text;
            } else {
              interimTranscript += text;
            }
          }

          if (finalTranscript) {
            recognitionTranscriptRef.current = `${recognitionTranscriptRef.current} ${finalTranscript}`.trim();
          }

          const combinedTranscript = `${recognitionTranscriptRef.current} ${interimTranscript}`.trim();
          recognitionDisplayRef.current = combinedTranscript;
          setLiveTranscript(combinedTranscript);
          setNotes(() => {
            const baseNotes = notesBeforeDictationRef.current.trim();
            return baseNotes ? `${baseNotes}\n\n${combinedTranscript}` : combinedTranscript;
          });
        };

        recognition.onerror = (event) => {
          recognitionFinalizedRef.current = true;
          speechRecognitionRef.current = null;
          stopRecordingTimer();
          setIsRecording(false);
          setLiveTranscript("");
          recognitionDisplayRef.current = "";
          setTranscriptionStatus("");

          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            setTranscriptionError(
              "Microphone access was blocked by the browser. If Chrome keeps prompting, allow microphone access for this site in browser settings.",
            );
            return;
          }

          if (event.error === "no-speech") {
            setTranscriptionError("No speech was detected. Try again.");
            return;
          }

          setTranscriptionError("Live dictation failed. Try again or upload an audio file instead.");
        };

        recognition.onend = () => {
          speechRecognitionRef.current = null;
          if (recognitionFinalizedRef.current) return;
          recognitionFinalizedRef.current = true;
          finishLiveTranscript(recognitionDisplayRef.current || recognitionTranscriptRef.current);
        };

        recognition.start();
        setIsRecording(true);
        setTranscriptionStatus("Listening and transcribing as you speak...");
        startRecordingTimer();
        return;
      } catch (err) {
        console.error("Speech recognition error:", err);
      }
    }

    if (!supportsMediaRecording) {
      setTranscriptionError(
        "This browser does not support live dictation or in-app recording. Upload an audio file instead.",
      );
      return;
    }

    try {
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        setTranscriptionError(
          "This browser cannot record a supported audio format. Upload an audio file instead.",
        );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
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
        await transcribeAudio(blob, mimeType, "Voice recording");
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTranscriptionStatus("Listening...");
      startRecordingTimer();
    } catch (err) {
      console.error("Microphone error:", err);
      setTranscriptionError(
        "Could not access your microphone. Allow microphone access or upload an audio file instead.",
      );
    }
  };

  const stopRecording = () => {
    if (speechRecognitionRef.current && isRecording) {
      recognitionFinalizedRef.current = true;
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
      finishLiveTranscript(
        recognitionDisplayRef.current || recognitionTranscriptRef.current || liveTranscript,
      );
      return;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setTranscriptionStatus("Preparing audio...");
      stopRecordingTimer();
    }
  };

  const transcribeAudio = async (blob, mimeType, sourceLabel = "Audio file") => {
    setIsTranscribing(true);
    setError("");
    setTranscriptionError("");
    setLastAudioFileName(sourceLabel);

    try {
      // Determine file extension from mime type
      let ext = "webm";
      if (mimeType.includes("mp4")) ext = "m4a";
      else if (mimeType.includes("ogg")) ext = "ogg";
      else if (mimeType.includes("wav")) ext = "wav";
      else if (mimeType.includes("mpeg") || mimeType.includes("mp3")) ext = "mp3";

      const file = new File([blob], `recording.${ext}`, { type: mimeType });

      // Upload the audio file
      setTranscriptionStatus(`Uploading ${sourceLabel.toLowerCase()}...`);
      const uploadResult = await upload({ file });

      if (uploadResult.error) {
        const uploadError = new Error(uploadResult.error);
        uploadError.stage = "upload";
        throw uploadError;
      }

      const audioUrl = uploadResult.url;

      // Send to transcribe endpoint
      setTranscriptionStatus("Transcribing audio...");
      const transcriptionResponse = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl }),
      });

      if (!transcriptionResponse.ok) {
        const errorData = await transcriptionResponse.json().catch(() => null);
        const transcriptionError = new Error(
          errorData?.details || errorData?.error || "Transcription failed"
        );
        transcriptionError.stage = errorData?.stage || "transcription";
        throw transcriptionError;
      }

      const data = await transcriptionResponse.json();
      const transcriptText = data.transcript || "";
      setTranscriptionStatus(
        transcriptText
          ? "Transcript added to notes."
          : "No speech was detected. Try again or upload a clearer recording."
      );

      appendTranscriptToNotes(transcriptText);

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
      setTranscriptionError(
        buildTranscriptionMessage(err?.stage, err?.message || "Please try again."),
      );
      setTranscriptionStatus("");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleAudioFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setTranscriptionError("");

    if (!file.type.startsWith("audio/")) {
      setTranscriptionError("Please choose an audio file.");
      event.target.value = "";
      return;
    }

    await transcribeAudio(file, file.type || "audio/webm", file.name);
    event.target.value = "";
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
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to submit donor update");
      }
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
            Sending your donor update to the submission tracker...
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
            Donor update submitted successfully.{" "}
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
            <p
              style={{
                margin: "0 0 12px",
                color: "#6B7280",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              Record a voice note or upload an audio file. The transcript will be appended to
              your notes for review before submit.
            </p>

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
                        {supportsSpeechRecognition
                          ? `Dictating... ${formatDuration(recordingDuration)}`
                          : `Listening... ${formatDuration(recordingDuration)}`}
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
                  <>
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={!supportsSpeechRecognition && !supportsMediaRecording}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "none",
                        border: "none",
                        cursor:
                          supportsSpeechRecognition || supportsMediaRecording
                            ? "pointer"
                            : "not-allowed",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        opacity: supportsSpeechRecognition || supportsMediaRecording ? 1 : 0.45,
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
                        {supportsSpeechRecognition
                          ? "Start live dictation"
                          : supportsMediaRecording
                            ? "Record and transcribe"
                            : "Recording unavailable"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "white",
                        border: "1px solid #D1D5DB",
                        cursor: "pointer",
                        padding: "6px 12px",
                        borderRadius: "8px",
                      }}
                    >
                      <Upload size={16} color="#374151" />
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: "500",
                          color: "#374151",
                        }}
                      >
                        Upload audio
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioFileSelected}
                      style={{ display: "none" }}
                    />
                  </>
                )}
              </div>
            </div>
            {(uploadLoading ||
              transcriptionStatus ||
              transcriptionError ||
              lastAudioFileName ||
              liveTranscript) && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  backgroundColor: transcriptionError ? "#FEF2F2" : "#F9FAFB",
                  border: `1px solid ${transcriptionError ? "#FECACA" : "#E5E7EB"}`,
                }}
              >
                {lastAudioFileName && !transcriptionError && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      marginBottom: transcriptionStatus ? "6px" : 0,
                    }}
                  >
                    Source: {lastAudioFileName}
                  </div>
                )}
                {transcriptionStatus && (
                  <div style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>
                    {transcriptionStatus}
                  </div>
                )}
                {liveTranscript && (
                  <div
                    style={{
                      marginTop: transcriptionStatus ? "8px" : 0,
                      fontSize: "13px",
                      color: "#111827",
                      lineHeight: 1.5,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      backgroundColor: "#FFFFFF",
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    {liveTranscript}
                  </div>
                )}
                {uploadLoading && !transcriptionStatus && (
                  <div style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>
                    Uploading audio...
                  </div>
                )}
                {transcriptionError && (
                  <div style={{ fontSize: "13px", color: "#991B1B", fontWeight: 500 }}>
                    {transcriptionError}
                  </div>
                )}
              </div>
            )}
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

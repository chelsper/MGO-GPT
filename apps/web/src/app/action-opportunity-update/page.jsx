"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Mic, Square } from "lucide-react";
import useUser from "@/utils/useUser";

const UPDATE_MODES = [
  {
    value: "action",
    label: "Action",
    description: "Log an interaction, visit, call, or follow-up step.",
  },
  {
    value: "opportunity",
    label: "Opportunity",
    description: "Update gift stage, amount, and opportunity notes.",
  },
  {
    value: "both",
    label: "Both",
    description: "Capture the interaction and the opportunity update together.",
  },
];

const INTERACTION_TYPES = ["visit", "call", "email", "event"];
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

function getSuccessLabel(mode) {
  if (mode === "both") return "Action and opportunity update submitted successfully.";
  if (mode === "opportunity") return "Opportunity update submitted successfully.";
  return "Action update submitted successfully.";
}

function DictationButton({
  target,
  label,
  dictationTarget,
  isRecording,
  onStart,
  onStop,
}) {
  const active = isRecording && dictationTarget === target;

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
      <button
        type="button"
        onClick={() => (active ? onStop() : onStart(target))}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "999px",
          border: active ? "1px solid #FCA5A5" : "1px solid #D1D5DB",
          backgroundColor: active ? "#FEF2F2" : "white",
          color: active ? "#B91C1C" : "#374151",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 700,
        }}
      >
        {active ? <Square size={14} /> : <Mic size={14} />}
        {active ? `Stop ${label}` : `Dictate ${label}`}
      </button>
    </div>
  );
}

export default function ActionOpportunityUpdatePage() {
  const { data: user, loading } = useUser();
  const [updateMode, setUpdateMode] = useState("action");
  const [donorName, setDonorName] = useState("");
  const [interactionType, setInteractionType] = useState("visit");
  const [sharedSummary, setSharedSummary] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [opportunityStage, setOpportunityStage] = useState("Identification");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [opportunityNotes, setOpportunityNotes] = useState("");
  const [newOpportunityTitle, setNewOpportunityTitle] = useState("");
  const [constituentMatches, setConstituentMatches] = useState([]);
  const [blackbaudMatches, setBlackbaudMatches] = useState([]);
  const [matchDecision, setMatchDecision] = useState("");
  const [linkedProspectContext, setLinkedProspectContext] = useState(null);
  const [opportunityLinkMode, setOpportunityLinkMode] = useState("create");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [prospectPrompt, setProspectPrompt] = useState(null);
  const [prospectError, setProspectError] = useState("");
  const [prospectAdded, setProspectAdded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [dictationTarget, setDictationTarget] = useState("");
  const [dictationStatus, setDictationStatus] = useState("");
  const [dictationError, setDictationError] = useState("");
  const speechRecognitionRef = useRef(null);
  const timerRef = useRef(null);
  const recognitionTranscriptRef = useRef("");
  const recognitionDisplayRef = useRef("");
  const recognitionFinalizedRef = useRef(false);
  const dictationBaseValueRef = useRef("");

  const includeAction = updateMode === "action" || updateMode === "both";
  const includeOpportunity = updateMode === "opportunity" || updateMode === "both";
  const supportsSpeechRecognition =
    typeof window !== "undefined" &&
    (typeof window.SpeechRecognition !== "undefined" ||
      typeof window.webkitSpeechRecognition !== "undefined");

  function getFieldValue(target) {
    switch (target) {
      case "summary":
        return sharedSummary;
      case "actionNotes":
        return actionNotes;
      case "nextStep":
        return nextStep;
      case "opportunityNotes":
        return opportunityNotes;
      default:
        return "";
    }
  }

  function setFieldValue(target, value) {
    switch (target) {
      case "summary":
        setSharedSummary(value);
        break;
      case "actionNotes":
        setActionNotes(value);
        break;
      case "nextStep":
        setNextStep(value);
        break;
      case "opportunityNotes":
        setOpportunityNotes(value);
        break;
      default:
        break;
    }
  }

  function stopRecordingTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startRecordingTimer() {
    stopRecordingTimer();
    setRecordingDuration(0);
    timerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function finishDictation(text, targetOverride) {
    const target = targetOverride || dictationTarget;
    stopRecordingTimer();
    setIsRecording(false);
    setDictationTarget("");

    const transcriptText = String(text || "").trim();
    if (!transcriptText || !target) {
      setDictationStatus("");
      setDictationError("No speech was detected. Try again.");
      return;
    }

    setFieldValue(target, transcriptText);
    setDictationStatus("Transcript added.");
    setDictationError("");
  }

  useEffect(() => {
    const query = donorName.trim();
    if (query.length < 2) {
      setConstituentMatches([]);
      setBlackbaudMatches([]);
      setMatchDecision("");
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const [localResponse, blackbaudResponse] = await Promise.allSettled([
          fetch(`/api/constituents/search?q=${encodeURIComponent(query)}`),
          fetch(`/api/blackbaud/constituents/search?q=${encodeURIComponent(query)}`),
        ]);

        if (!active) return;

        if (localResponse.status === "fulfilled" && localResponse.value.ok) {
          const data = await localResponse.value.json();
          if (active) {
            setConstituentMatches(Array.isArray(data) ? data : []);
          }
        }

        if (blackbaudResponse.status === "fulfilled" && blackbaudResponse.value.ok) {
          const data = await blackbaudResponse.value.json();
          if (active) {
            setBlackbaudMatches(Array.isArray(data?.results) ? data.results : []);
          }
        } else if (active) {
          setBlackbaudMatches([]);
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

  useEffect(() => {
    return () => {
      stopRecordingTimer();
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      }
    };
  }, []);

  const exactMatch = useMemo(
    () =>
      constituentMatches.find(
        (item) => item.normalized_name === normalizeName(donorName),
      ),
    [constituentMatches, donorName],
  );

  const blackbaudExactMatch = useMemo(
    () =>
      blackbaudMatches.find(
        (item) => normalizeName(item?.name) === normalizeName(donorName),
      ),
    [blackbaudMatches, donorName],
  );

  useEffect(() => {
    if (!includeOpportunity || !exactMatch || matchDecision === "new") {
      setLinkedProspectContext(null);
      setOpportunityLinkMode("create");
      setSelectedOpportunityId("");
      return;
    }

    let active = true;

    async function loadContext() {
      try {
        const prospectsResponse = await fetch("/api/prospects");
        if (!prospectsResponse.ok) return;

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
          return;
        }

        const detailResponse = await fetch(`/api/prospects/${matchedProspect.id}`);
        if (!detailResponse.ok) return;

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
    }

    loadContext();

    return () => {
      active = false;
    };
  }, [donorName, exactMatch, includeOpportunity, matchDecision]);

  function startDictation(target) {
    setError("");
    setDictationError("");
    setDictationStatus("");

    if (!supportsSpeechRecognition) {
      setDictationError("This browser does not support live dictation.");
      return;
    }

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
      dictationBaseValueRef.current = getFieldValue(target).trim();
      speechRecognitionRef.current = recognition;
      setDictationTarget(target);

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
          recognitionTranscriptRef.current =
            `${recognitionTranscriptRef.current} ${finalTranscript}`.trim();
        }

        const combinedTranscript =
          `${recognitionTranscriptRef.current} ${interimTranscript}`.trim();
        recognitionDisplayRef.current = combinedTranscript;
        const baseValue = dictationBaseValueRef.current;
        setFieldValue(
          target,
          baseValue ? `${baseValue}\n\n${combinedTranscript}` : combinedTranscript,
        );
      };

      recognition.onerror = (event) => {
        recognitionFinalizedRef.current = true;
        speechRecognitionRef.current = null;
        stopRecordingTimer();
        setIsRecording(false);
        setDictationTarget("");
        setDictationStatus("");

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setDictationError(
            "Microphone access was blocked by the browser. Allow microphone access for this site.",
          );
          return;
        }

        if (event.error === "no-speech") {
          setDictationError("No speech was detected. Try again.");
          return;
        }

        setDictationError("Live dictation failed. Try again.");
      };

      recognition.onend = () => {
        speechRecognitionRef.current = null;
        if (recognitionFinalizedRef.current) return;
        recognitionFinalizedRef.current = true;
        finishDictation(
          recognitionDisplayRef.current || recognitionTranscriptRef.current,
          target,
        );
      };

      recognition.start();
      setIsRecording(true);
      setDictationStatus("Listening and transcribing as you speak...");
      startRecordingTimer();
    } catch (dictationStartError) {
      console.error("Speech recognition error:", dictationStartError);
      setDictationError("Live dictation could not start in this browser.");
    }
  }

  function stopDictation() {
    if (!speechRecognitionRef.current || !isRecording) return;
    recognitionFinalizedRef.current = true;
    speechRecognitionRef.current.stop();
    speechRecognitionRef.current = null;
    finishDictation(
      recognitionDisplayRef.current || recognitionTranscriptRef.current,
      dictationTarget,
    );
  }

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

  const submitMutation = useMutation({
    mutationFn: async (payload) => {
      const results = {};

      if (payload.includeAction) {
        const donorResponse = await fetch("/api/submissions/donor-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.actionBody),
        });

        if (!donorResponse.ok) {
          const errorData = await donorResponse.json().catch(() => null);
          throw new Error(errorData?.error || "Failed to submit action update");
        }

        results.action = await donorResponse.json();
      }

      if (payload.includeOpportunity) {
        const opportunityResponse = await fetch("/api/submissions/opportunity-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.opportunityBody),
        });

        if (!opportunityResponse.ok) {
          const errorData = await opportunityResponse.json().catch(() => null);
          if (results.action) {
            throw new Error(
              `Action update saved, but the opportunity update failed: ${
                errorData?.error || "Unknown error"
              }`,
            );
          }
          throw new Error(errorData?.error || "Failed to submit opportunity update");
        }

        results.opportunity = await opportunityResponse.json();
      }

      return results;
    },
    onSuccess: async (data) => {
      setSuccessMessage(getSuccessLabel(updateMode));
      setProspectError("");
      setProspectAdded(false);

      const submittedName = donorName.trim();
      const submittedAmount = estimatedAmount ? parseFloat(estimatedAmount) : null;
      const submittedConstituentId =
        data?.opportunity?.constituent_id || data?.action?.constituent_id || null;
      const alreadyTracked = Boolean(data?.opportunity?.prospect_id);

      setDonorName("");
      setInteractionType("visit");
      setSharedSummary("");
      setActionNotes("");
      setNextStep("");
      setOpportunityStage("Identification");
      setEstimatedAmount("");
      setOpportunityNotes("");
      setNewOpportunityTitle("");
      setConstituentMatches([]);
      setMatchDecision("");
      setLinkedProspectContext(null);
      setOpportunityLinkMode("create");
      setSelectedOpportunityId("");
      setDictationTarget("");
      setDictationStatus("");
      setDictationError("");

      try {
        const response = await fetch("/api/prospects");
        if (!response.ok) {
          setProspectPrompt(null);
          return;
        }

        const prospects = await response.json();
        const normalizedSubmittedName = normalizeName(submittedName);
        const trackedInList =
          alreadyTracked ||
          (Array.isArray(prospects) &&
            prospects.some((prospect) => {
              if (submittedConstituentId && prospect.constituent_id) {
                return Number(prospect.constituent_id) === Number(submittedConstituentId);
              }
              return normalizeName(prospect.prospect_name) === normalizedSubmittedName;
            }));

        setProspectPrompt(
          trackedInList
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

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
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

    if (includeAction && !sharedSummary.trim() && !actionNotes.trim()) {
      setError("Please add a summary or action note for the action update.");
      return;
    }

    if (includeOpportunity && !estimatedAmount) {
      setError("Please enter an estimated amount for the opportunity update.");
      return;
    }

    if (
      includeOpportunity &&
      linkedProspectContext?.prospect &&
      opportunityLinkMode === "update" &&
      !selectedOpportunityId
    ) {
      setError("Please choose the linked opportunity you want to update.");
      return;
    }

    if (
      includeOpportunity &&
      linkedProspectContext?.prospect &&
      opportunityLinkMode === "create" &&
      !newOpportunityTitle.trim()
    ) {
      setError("Please give the new linked opportunity a title.");
      return;
    }

    const constituentId = matchDecision === "link" ? exactMatch?.id || null : null;
    const createNewConstituent = matchDecision === "new";
    const combinedOpportunityNotes = [sharedSummary.trim(), opportunityNotes.trim()]
      .filter(Boolean)
      .join("\n\n");
    const combinedActionNotes = [sharedSummary.trim(), actionNotes.trim()]
      .filter(Boolean)
      .join("\n\n");

    submitMutation.mutate({
      includeAction,
      includeOpportunity,
      actionBody: includeAction
        ? {
            donorName,
            constituentId,
            createNewConstituent,
            interactionType,
            notes: combinedActionNotes,
            nextStep,
            estimatedAmount: estimatedAmount ? parseFloat(estimatedAmount) : null,
            transcript: null,
            attachments: [],
          }
        : null,
      opportunityBody: includeOpportunity
        ? {
            donorName,
            constituentId,
            createNewConstituent,
            opportunityStage,
            estimatedAmount: estimatedAmount ? parseFloat(estimatedAmount) : null,
            notes: combinedOpportunityNotes,
            attachments: [],
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
          }
        : null,
    });
  }

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
            maxWidth: "760px",
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
              fontWeight: 700,
              color: "#111827",
              margin: 0,
            }}
          >
            Action &amp; Opportunity Updates
          </h1>
        </div>
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "24px 24px 140px" }}>
        {supportsSpeechRecognition ? (
          <div
            style={{
              padding: "14px 16px",
              backgroundColor: "#F5F3FF",
              color: "#5B21B6",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
              border: "1px solid #DDD6FE",
            }}
          >
            Use the microphone buttons beside Summary, Action-specific notes, Next step, and Opportunity-specific notes to dictate directly into those fields.
          </div>
        ) : null}

        {submitMutation.isPending ? (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#EDE9FE",
              color: "#5B21B6",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Sending your update to the submission tracker...
          </div>
        ) : null}

        {successMessage ? (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#D1FAE5",
              color: "#065F46",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {successMessage}{" "}
            <a
              href="/submissions"
              style={{ color: "#065F46", textDecoration: "underline", marginRight: "8px" }}
            >
              View submission tracker
            </a>
            or{" "}
            <a href="/" style={{ color: "#065F46", textDecoration: "underline" }}>
              Back to dashboard
            </a>
          </div>
        ) : null}

        {prospectPrompt ? (
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
                  fontWeight: 600,
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
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Not now
              </button>
            </div>
          </div>
        ) : null}

        {prospectAdded ? (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#DBEAFE",
              color: "#1D4ED8",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Prospect added to{" "}
            <a href="/my-top-prospects" style={{ color: "#1D4ED8", textDecoration: "underline" }}>
              My Top Prospects
            </a>
            .
          </div>
        ) : null}

        {prospectError ? (
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
        ) : null}

        {error ? (
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
        ) : null}

        {dictationError ? (
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
            {dictationError}
          </div>
        ) : null}

        {dictationStatus ? (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#EDE9FE",
              color: "#5B21B6",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {dictationStatus}
            {isRecording && dictationTarget
              ? ` (${formatDuration(recordingDuration)} on ${dictationTarget})`
              : ""}
          </div>
        ) : null}

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
            <div style={{ marginBottom: "18px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "#6B7280",
                  marginBottom: "10px",
                }}
              >
                What are you updating?
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                {UPDATE_MODES.map((option) => {
                  const active = updateMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setUpdateMode(option.value)}
                      style={{
                        textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: "12px",
                        border: active ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                        backgroundColor: active ? "#F5F3FF" : "white",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                        {option.label}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                        {option.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Donor Name <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <input
              type="text"
              value={donorName}
              onChange={(event) => {
                setDonorName(event.target.value);
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
                  Do you want to tie this update to that existing person?
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
                    const exact = blackbaudExactMatch?.blackbaudConstituentId === match.blackbaudConstituentId;
                    return (
                      <div
                        key={match.blackbaudConstituentId || match.name}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: exact ? "1px solid #60A5FA" : "1px solid #DBEAFE",
                          backgroundColor: exact ? "#DBEAFE" : "white",
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
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: "8px", fontSize: "12px", color: "#4B5563" }}>
                  These are read-only Blackbaud search results for verification. They do not link the update yet.
                </div>
              </div>
            ) : null}

            {linkedProspectContext?.prospect && includeOpportunity ? (
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
                <div style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.5 }}>
                  This update can be tied to <strong>{linkedProspectContext.prospect.prospect_name}</strong> in
                  your Top Prospects list.
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
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

                {opportunityLinkMode === "update" &&
                linkedProspectContext.opportunities?.length ? (
                  <div style={{ marginTop: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#6B7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "8px",
                      }}
                    >
                      Linked opportunity
                    </label>
                    <select
                      value={selectedOpportunityId}
                      onChange={(event) => setSelectedOpportunityId(event.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid #BFDBFE",
                        backgroundColor: "white",
                        fontSize: "14px",
                      }}
                    >
                      {linkedProspectContext.opportunities.map((opportunity) => (
                        <option key={opportunity.id} value={opportunity.id}>
                          {opportunity.title} · ${Number(opportunity.estimated_amount || 0).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {opportunityLinkMode === "create" ? (
                  <div style={{ marginTop: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#6B7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "8px",
                      }}
                    >
                      New linked opportunity title
                    </label>
                    <input
                      type="text"
                      value={newOpportunityTitle}
                      onChange={(event) => setNewOpportunityTitle(event.target.value)}
                      placeholder={`${donorName.trim() || "Donor"} opportunity`}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid #BFDBFE",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                ) : null}
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
                fontWeight: 600,
                color: "#374151",
                marginBottom: "8px",
              }}
            >
              Shared summary
            </label>
            {supportsSpeechRecognition ? (
              <DictationButton
                target="summary"
                label="summary"
                dictationTarget={dictationTarget}
                isRecording={isRecording}
                onStart={startDictation}
                onStop={stopDictation}
              />
            ) : null}
            <textarea
              value={sharedSummary}
              onChange={(event) => setSharedSummary(event.target.value)}
              placeholder="What happened, what changed, and what should the team know?"
              rows={5}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {includeAction ? (
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "24px",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#111827" }}>
                Action details
              </h2>

              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "8px",
                }}
              >
                Interaction type
              </label>
              <select
                value={interactionType}
                onChange={(event) => setInteractionType(event.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  backgroundColor: "white",
                  boxSizing: "border-box",
                  marginBottom: "16px",
                }}
              >
                {INTERACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>

              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "8px",
                }}
              >
                Action-specific notes
              </label>
              {supportsSpeechRecognition ? (
                <DictationButton
                  target="actionNotes"
                  label="notes"
                  dictationTarget={dictationTarget}
                  isRecording={isRecording}
                  onStart={startDictation}
                  onStop={stopDictation}
                />
              ) : null}
              <textarea
                value={actionNotes}
                onChange={(event) => setActionNotes(event.target.value)}
                placeholder="Relationship details, meeting notes, or context that belongs on the action update."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  resize: "vertical",
                  boxSizing: "border-box",
                  marginBottom: "16px",
                }}
              />

              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "8px",
                }}
              >
                Next step
              </label>
              {supportsSpeechRecognition ? (
                <DictationButton
                  target="nextStep"
                  label="next step"
                  dictationTarget={dictationTarget}
                  isRecording={isRecording}
                  onStart={startDictation}
                  onStop={stopDictation}
                />
              ) : null}
              <textarea
                value={nextStep}
                onChange={(event) => setNextStep(event.target.value)}
                placeholder="What follow-up should happen next?"
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>
          ) : null}

          {includeOpportunity ? (
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "24px",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#111827" }}>
                Opportunity details
              </h2>

              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "8px",
                }}
              >
                Opportunity stage
              </label>
              <select
                value={opportunityStage}
                onChange={(event) => setOpportunityStage(event.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  backgroundColor: "white",
                  boxSizing: "border-box",
                  marginBottom: "16px",
                }}
              >
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>

              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "8px",
                }}
              >
                Estimated amount
              </label>
              <input
                type="number"
                value={estimatedAmount}
                onChange={(event) => setEstimatedAmount(event.target.value)}
                placeholder="Enter amount"
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
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "8px",
                }}
              >
                Opportunity-specific notes
              </label>
              {supportsSpeechRecognition ? (
                <DictationButton
                  target="opportunityNotes"
                  label="notes"
                  dictationTarget={dictationTarget}
                  isRecording={isRecording}
                  onStart={startDictation}
                  onStop={stopDictation}
                />
              ) : null}
              <textarea
                value={opportunityNotes}
                onChange={(event) => setOpportunityNotes(event.target.value)}
                placeholder="Stage changes, objection notes, ask framing, or timing details."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>
          ) : null}

          <div
            style={{
              position: "sticky",
              bottom: "18px",
              zIndex: 9,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              padding: "14px 16px",
              borderRadius: "16px",
              backgroundColor: "rgba(255, 255, 255, 0.96)",
              border: "1px solid #E5E7EB",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
              Submit one combined update and route it into the shared review queue.
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <a
                href="/"
                style={{
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid #D1D5DB",
                  backgroundColor: "white",
                  color: "#374151",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Cancel
              </a>
              <button
                type="submit"
                disabled={submitMutation.isPending}
                style={{
                  padding: "12px 18px",
                  backgroundColor: submitMutation.isPending ? "#C7D2FE" : "#6A5BFF",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: submitMutation.isPending ? "not-allowed" : "pointer",
                }}
              >
                {submitMutation.isPending ? "Submitting..." : "Submit update"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

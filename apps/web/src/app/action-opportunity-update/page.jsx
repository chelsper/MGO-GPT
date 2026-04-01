"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Mic, Square } from "lucide-react";
import useUser from "@/utils/useUser";

const UPDATE_MODES = [
  {
    value: "action",
    label: "Action",
    description: "Log a completed fundraising action and any follow-up step.",
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

const ACTION_CATEGORIES = ["Meeting", "Phone Call", "Email", "Mail", "Task"];
const INTERACTION_TYPES = [
  "Cultivation",
  "Identification/Discovery",
  "Other",
  "Qualification/Re-engagement",
  "Solicitation",
  "Stewardship",
];
const COMMON_NEXT_STEPS = [
  "Send recap email",
  "Schedule next visit",
  "Call to follow up",
  "Prepare ask strategy",
];
const STAGES = [
  "Identification",
  "Qualification",
  "Cultivation",
  "Solicitation",
  "Solicitation - Verbal",
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

function getFiscalYearLabel(value) {
  if (!value) return getDefaultFY();
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return getDefaultFY();
  const fiscalYear =
    parsedDate.getUTCMonth() >= 6
      ? parsedDate.getUTCFullYear() + 1
      : parsedDate.getUTCFullYear();
  return `FY${String(fiscalYear).slice(-2)}`;
}

function getSuccessLabel(mode) {
  if (mode === "both") return "Action and opportunity update submitted successfully.";
  if (mode === "opportunity") return "Opportunity update submitted successfully.";
  return "Action update submitted successfully.";
}

function buildOutlookCalendarUrl({ subject, notes, dueDate }) {
  if (!dueDate) return null;

  const start = new Date(`${dueDate}T09:00:00`);
  const end = new Date(`${dueDate}T09:30:00`);

  return `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(notes || "")}&startdt=${encodeURIComponent(start.toISOString())}&enddt=${encodeURIComponent(end.toISOString())}`;
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
  const [actionCategory, setActionCategory] = useState(ACTION_CATEGORIES[0]);
  const [interactionType, setInteractionType] = useState(INTERACTION_TYPES[0]);
  const [actionNotes, setActionNotes] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [opportunityStage, setOpportunityStage] = useState("Identification");
  const [askAmount, setAskAmount] = useState("");
  const [askDate, setAskDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [opportunityNotes, setOpportunityNotes] = useState("");
  const [opportunityTitle, setOpportunityTitle] = useState("");
  const [constituentMatches, setConstituentMatches] = useState([]);
  const [blackbaudMatches, setBlackbaudMatches] = useState([]);
  const [selectedBlackbaudMatch, setSelectedBlackbaudMatch] = useState(null);
  const [blackbaudSearchLoading, setBlackbaudSearchLoading] = useState(false);
  const [blackbaudSearchError, setBlackbaudSearchError] = useState("");
  const [blackbaudSearchWarning, setBlackbaudSearchWarning] = useState("");
  const [selectedBlackbaudSummary, setSelectedBlackbaudSummary] = useState(null);
  const [selectedBlackbaudSummaryLoading, setSelectedBlackbaudSummaryLoading] =
    useState(false);
  const [selectedBlackbaudSummaryError, setSelectedBlackbaudSummaryError] =
    useState("");
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
  const [toast, setToast] = useState(null);
  const [actionDetailsOpen, setActionDetailsOpen] = useState(true);
  const [opportunityDetailsOpen, setOpportunityDetailsOpen] = useState(false);
  const [nextStepPrompt, setNextStepPrompt] = useState(null);
  const [nextStepDueDate, setNextStepDueDate] = useState("");
  const [nextStepSaved, setNextStepSaved] = useState(false);
  const [nextStepError, setNextStepError] = useState("");
  const [createActionItem, setCreateActionItem] = useState(false);
  const [actionItemText, setActionItemText] = useState("");
  const [actionItemTextEdited, setActionItemTextEdited] = useState(false);
  const [createOutlookReminder, setCreateOutlookReminder] = useState(false);
  const [isJointSolicitation, setIsJointSolicitation] = useState(false);
  const [jointMgoOptions, setJointMgoOptions] = useState([]);
  const [jointMgoLoading, setJointMgoLoading] = useState(false);
  const [jointMgoLoaded, setJointMgoLoaded] = useState(false);
  const [jointMgoError, setJointMgoError] = useState("");
  const [selectedJointMgoIds, setSelectedJointMgoIds] = useState([]);
  const [createDiscussionItem, setCreateDiscussionItem] = useState(false);
  const [discussionSubject, setDiscussionSubject] = useState("");
  const [discussionSubjectEdited, setDiscussionSubjectEdited] = useState(false);
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionDueDate, setDiscussionDueDate] = useState("");
  const [discussionAssignedUserId, setDiscussionAssignedUserId] = useState("");
  const [discussionFeedback, setDiscussionFeedback] = useState(null);
  const [teamDiscussionOpen, setTeamDiscussionOpen] = useState(false);
  const speechRecognitionRef = useRef(null);
  const timerRef = useRef(null);
  const recognitionTranscriptRef = useRef("");
  const recognitionDisplayRef = useRef("");
  const recognitionFinalizedRef = useRef(false);
  const dictationBaseValueRef = useRef("");

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const includeAction = updateMode === "action" || updateMode === "both";
  const includeOpportunity = updateMode === "opportunity" || updateMode === "both";
  const supportsSpeechRecognition =
    typeof window !== "undefined" &&
    (typeof window.SpeechRecognition !== "undefined" ||
      typeof window.webkitSpeechRecognition !== "undefined");

  function getFieldValue(target) {
    switch (target) {
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

  useEffect(() => {
    if (updateMode === "action") {
      setActionDetailsOpen(true);
      setOpportunityDetailsOpen(false);
      return;
    }
    if (updateMode === "opportunity") {
      setActionDetailsOpen(false);
      setOpportunityDetailsOpen(true);
      return;
    }
    setActionDetailsOpen(true);
    setOpportunityDetailsOpen(false);
  }, [updateMode]);

  useEffect(() => {
    if (!includeOpportunity && !createDiscussionItem) {
      setIsJointSolicitation(false);
      setSelectedJointMgoIds([]);
      setJointMgoLoaded(false);
      setJointMgoError("");
      return;
    }
    if (!(isJointSolicitation || createDiscussionItem) || jointMgoLoaded || jointMgoLoading) {
      return;
    }

    let active = true;
    setJointMgoLoading(true);
    setJointMgoLoaded(false);
    setJointMgoError("");

    async function loadMgoOptions() {
      try {
        let mgoOptions = [];
        let primaryError = "";
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 4500);

        try {
          const response = await fetch("/api/users/mgos", {
            signal: controller.signal,
          });
          const payload = await response.json().catch(() => null);
          window.clearTimeout(timeoutId);
          if (!active) return;

          if (response.ok) {
            const options = Array.isArray(payload) ? payload : [];
            mgoOptions = options.filter(
              (option) => Number(option.id) !== Number(user?.id || 0),
            );
          } else {
            primaryError = payload?.error || "Teammate options are unavailable right now.";
          }
        } catch (_primaryLoadError) {
          window.clearTimeout(timeoutId);
          primaryError = "Teammate options are unavailable right now.";
        }

        if (!active) return;

        if (mgoOptions.length === 0) {
          try {
            const response = await fetch("/api/admin/access");
            const payload = await response.json().catch(() => null);
            if (!active) return;

            if (response.ok) {
              const adminUsers = Array.isArray(payload?.users) ? payload.users : [];
              mgoOptions = adminUsers.filter(
                (option) =>
                  option.active !== false &&
                  option.role === "mgo" &&
                  Number(option.id) !== Number(user?.id || 0),
              );
            }
          } catch (_fallbackError) {
            if (!primaryError) {
              primaryError = "Teammate options are unavailable right now.";
            }
          }
        }

        setJointMgoOptions(mgoOptions);
        setJointMgoLoaded(true);
        setJointMgoError(mgoOptions.length === 0 ? primaryError : "");
      } catch (loadError) {
        console.error("Joint solicitation MGO lookup error:", loadError);
        if (!active) return;
        setJointMgoOptions([]);
        setJointMgoLoaded(true);
        setJointMgoError("Teammate options are unavailable right now.");
      } finally {
        if (active) {
          setJointMgoLoading(false);
        }
      }
    }

    loadMgoOptions();

    return () => {
      active = false;
    };
  }, [
    createDiscussionItem,
    includeOpportunity,
    isJointSolicitation,
    jointMgoLoaded,
    jointMgoLoading,
    user?.id,
  ]);

  useEffect(() => {
    if (discussionSubjectEdited) return;

    if (includeOpportunity && opportunityTitle.trim()) {
      setDiscussionSubject(`Discuss ${opportunityTitle.trim()}`);
      return;
    }

    if (donorName.trim()) {
      setDiscussionSubject(`Follow up with ${donorName.trim()}`);
      return;
    }

    setDiscussionSubject("");
  }, [
    discussionSubjectEdited,
    donorName,
    includeOpportunity,
    opportunityTitle,
  ]);

  useEffect(() => {
    if (!includeAction) {
      setCreateActionItem(false);
      setActionItemText("");
      setActionItemTextEdited(false);
      setCreateOutlookReminder(false);
      setNextStepDueDate("");
      return;
    }

    if (!nextStep.trim()) {
      return;
    }

    if (!actionItemTextEdited) {
      setActionItemText(nextStep.trim());
    }
  }, [actionItemTextEdited, includeAction, nextStep]);

  useEffect(() => {
    if (createDiscussionItem) {
      setTeamDiscussionOpen(true);
    }
  }, [createDiscussionItem]);

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
      setSelectedBlackbaudMatch(null);
      setBlackbaudSearchLoading(false);
      setBlackbaudSearchError("");
      setBlackbaudSearchWarning("");
      setSelectedBlackbaudSummary(null);
      setSelectedBlackbaudSummaryLoading(false);
      setSelectedBlackbaudSummaryError("");
      setMatchDecision("");
      return;
    }

    let active = true;
    setBlackbaudSearchLoading(true);
    setBlackbaudSearchError("");
    setBlackbaudSearchWarning("");
    const timeoutId = setTimeout(async () => {
      try {
        const localResponse = await fetch(
          `/api/constituents/search?q=${encodeURIComponent(query)}`,
        );

        if (!active) return;

        let localMatches = [];
        if (localResponse.ok) {
          const data = await localResponse.json();
          localMatches = Array.isArray(data) ? data : [];
          setConstituentMatches(localMatches);
        }

        const exactLocalLinkedMatch = localMatches.find(
          (item) =>
            item?.blackbaudConstituentId &&
            item.normalized_name === normalizeName(query),
        );

        if (exactLocalLinkedMatch) {
          setBlackbaudMatches([]);
          setBlackbaudSearchError("");
          setBlackbaudSearchWarning(
            "Using the linked Raiser's Edge NXT record from your existing workflow history.",
          );
          return;
        }

        const blackbaudResponse = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(query)}`,
        );

        if (!active) return;

        if (blackbaudResponse.ok) {
          const data = await blackbaudResponse.json();
          setBlackbaudMatches(Array.isArray(data?.results) ? data.results : []);
          setBlackbaudSearchWarning(data?.warning || "");
        } else {
          setBlackbaudMatches([]);
          const errorPayload = await blackbaudResponse.json().catch(() => null);
          setBlackbaudSearchError(
            errorPayload?.error || "Could not search Raiser's Edge NXT right now.",
          );
        }
      } catch (searchError) {
        console.error("Constituent lookup error:", searchError);
        if (active) {
          setBlackbaudMatches([]);
          setBlackbaudSearchError("Could not search Raiser's Edge NXT right now.");
          setBlackbaudSearchWarning("");
        }
      } finally {
        if (active) {
          setBlackbaudSearchLoading(false);
        }
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [donorName]);

  useEffect(() => {
    const constituentId = selectedBlackbaudMatch?.blackbaudConstituentId;
    if (!constituentId) {
      setSelectedBlackbaudSummary(null);
      setSelectedBlackbaudSummaryLoading(false);
      setSelectedBlackbaudSummaryError("");
      return;
    }

    let active = true;
    setSelectedBlackbaudSummaryLoading(true);
    setSelectedBlackbaudSummaryError("");

    async function loadBlackbaudSummary() {
      try {
        const response = await fetch(
          `/api/blackbaud/constituents/${encodeURIComponent(constituentId)}/summary?lookupId=${encodeURIComponent(
            selectedBlackbaudMatch?.blackbaudLookupId || selectedBlackbaudMatch?.lookupId || "",
          )}&recordId=${encodeURIComponent(
            selectedBlackbaudMatch?.blackbaudRecordId || "",
          )}&name=${encodeURIComponent(selectedBlackbaudMatch?.name || "")}`,
        );
        const data = await response.json().catch(() => null);

        if (!active) return;

        if (!response.ok) {
          setSelectedBlackbaudSummary(null);
          setSelectedBlackbaudSummaryError(
            data?.error || "Could not load constituent data from Raiser's Edge NXT.",
          );
          return;
        }

        setSelectedBlackbaudSummary(data || null);
      } catch (summaryError) {
        if (!active) return;
        console.error("Blackbaud constituent summary lookup error:", summaryError);
        setSelectedBlackbaudSummary(null);
        setSelectedBlackbaudSummaryError(
          "Could not load constituent data from Raiser's Edge NXT.",
        );
      } finally {
        if (active) {
          setSelectedBlackbaudSummaryLoading(false);
        }
      }
    }

    loadBlackbaudSummary();

    return () => {
      active = false;
    };
  }, [selectedBlackbaudMatch?.blackbaudConstituentId]);

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

  const hasConfirmedMatch = Boolean(
    selectedBlackbaudMatch ||
      matchDecision === "link" ||
      matchDecision === "new" ||
      (!exactMatch && donorName.trim().length >= 2),
  );
  const hasUpdateDetails = Boolean(
    (includeAction && (actionNotes.trim() || nextStep.trim())) ||
      (includeOpportunity &&
        (opportunityNotes.trim() ||
          askAmount.trim() ||
          opportunityTitle.trim() ||
          askDate.trim() ||
          expectedDate.trim())),
  );
  const steps = [
    { label: "What are you updating?", done: Boolean(updateMode) },
    { label: "Identify donor", done: Boolean(donorName.trim()) },
    { label: "Add details", done: hasUpdateDetails },
    { label: "Next step", done: Boolean(nextStep.trim() || nextStepDueDate || createActionItem) },
    {
      label: "Submit",
      done: Boolean(successMessage),
      current: Boolean(donorName.trim()) && hasConfirmedMatch && hasUpdateDetails && !successMessage,
    },
  ];
  const blackbaudConstituent =
    selectedBlackbaudSummary?.mapped?.constituent || null;
  const blackbaudLifetimeGiving =
    selectedBlackbaudSummary?.mapped?.lifetimeGiving || null;
  const blackbaudFundraiserAssignments =
    selectedBlackbaudSummary?.mapped?.fundraiserAssignments || [];

  useEffect(() => {
    if (selectedBlackbaudMatch) return;
    if (!exactMatch?.blackbaudConstituentId) return;

    setSelectedBlackbaudMatch({
      blackbaudConstituentId: exactMatch.blackbaudConstituentId,
      name: exactMatch.name,
      lookupId: null,
      email: null,
      phone: null,
      address: null,
    });
  }, [exactMatch, selectedBlackbaudMatch]);

  useEffect(() => {
    if (selectedBlackbaudMatch || blackbaudMatches.length === 0) return;

    if (blackbaudExactMatch) {
      setSelectedBlackbaudMatch(blackbaudExactMatch);
      return;
    }

    if (blackbaudMatches.length === 1) {
      setSelectedBlackbaudMatch(blackbaudMatches[0]);
    }
  }, [blackbaudExactMatch, blackbaudMatches, selectedBlackbaudMatch]);

  useEffect(() => {
    if (!(includeAction || includeOpportunity) || !exactMatch || matchDecision === "new") {
      setLinkedProspectContext(null);
      if (!includeOpportunity) {
        setOpportunityLinkMode("create");
        setSelectedOpportunityId("");
      }
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
          if (!includeOpportunity) {
            setOpportunityLinkMode("create");
            setSelectedOpportunityId("");
          }
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
        if (!includeOpportunity) {
          return;
        }

        if (opportunities.length > 0) {
          setOpportunityLinkMode("update");
          setSelectedOpportunityId(String(opportunities[0].id));
        } else {
          setOpportunityLinkMode("create");
          setSelectedOpportunityId("");
          setOpportunityTitle(`${donorName.trim()} opportunity`);
        }
      } catch (contextError) {
        console.error("Linked opportunity lookup error:", contextError);
      }
    }

    loadContext();

    return () => {
      active = false;
    };
  }, [donorName, exactMatch, includeAction, includeOpportunity, matchDecision]);

  useEffect(() => {
    if (!includeOpportunity) return;

    if (
      linkedProspectContext?.opportunities?.length &&
      opportunityLinkMode === "update" &&
      selectedOpportunityId
    ) {
      const selectedOpportunity = linkedProspectContext.opportunities.find(
        (opportunity) => String(opportunity.id) === String(selectedOpportunityId),
      );

      if (selectedOpportunity) {
        setOpportunityTitle(selectedOpportunity.title || `${donorName.trim()} opportunity`);
        setOpportunityStage(selectedOpportunity.current_stage || "Identification");
        setAskAmount(
          selectedOpportunity.estimated_amount != null
            ? String(selectedOpportunity.estimated_amount)
            : "",
        );
        setAskDate(selectedOpportunity.ask_date || "");
        setExpectedDate(selectedOpportunity.expected_date || "");
        setOpportunityNotes(selectedOpportunity.latest_notes || "");
      }
      return;
    }

    if (opportunityLinkMode === "create" && donorName.trim() && !opportunityTitle.trim()) {
      setOpportunityTitle(`${donorName.trim()} opportunity`);
    }
  }, [
    donorName,
    includeOpportunity,
    linkedProspectContext,
    opportunityLinkMode,
    selectedOpportunityId,
  ]);

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
    onSuccess: (createdProspect) => {
      setProspectAdded(true);
      setProspectError("");
      setProspectPrompt(null);
      setToast({ tone: "success", message: "Prospect added to My Top Prospects." });
      if (nextStepPrompt?.nextActionText && createdProspect?.id) {
        setNextStepPrompt((current) =>
          current
            ? {
                ...current,
                prospectId: createdProspect.id,
              }
            : current,
        );
      }
    },
    onError: (err) => {
      console.error(err);
      const message = err?.message || "Failed to add prospect.";
      setProspectError(message);
      setToast({ tone: "error", message });
    },
  });

  const saveNextStepMutation = useMutation({
    mutationFn: async ({ prospectId, nextActionText, nextActionDueDate }) => {
      const res = await fetch(`/api/prospects/${prospectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextActionText,
          nextActionDueDate: nextActionDueDate || null,
          nextActionCompletedAt: null,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to save next step");
      }
      return payload;
    },
    onSuccess: () => {
      setNextStepSaved(true);
      setNextStepError("");
      setToast({ tone: "success", message: "Next step saved to My Top Prospects." });
    },
    onError: (err) => {
      const message = err?.message || "Failed to save next step.";
      setNextStepError(message);
      setToast({ tone: "error", message });
    },
  });

  const createDiscussionMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await fetch("/api/discussion-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responsePayload?.error || "Failed to create team discussion");
      }
      return responsePayload;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload) => {
      const results = {};

      if (payload.includeAction) {
        const useDirectProspectAction = Boolean(payload.actionBody?.linkedProspectId);
        const actionEndpoint = useDirectProspectAction
          ? `/api/prospects/${payload.actionBody.linkedProspectId}/actions`
          : "/api/submissions/donor-update";
        const actionRequestBody = useDirectProspectAction
          ? {
              actionDate: new Date().toISOString().split("T")[0],
              actionCategory: payload.actionBody.actionCategory,
              interactionType: payload.actionBody.interactionType,
              summary: payload.actionBody.summary || "",
              notes: payload.actionBody.notes,
              nextStep: payload.actionBody.nextStep,
              nextActionDueDate: payload.actionBody.nextActionDueDate || null,
              linkedOpportunityId: payload.actionBody.linkedOpportunityId || null,
            }
          : payload.actionBody;

        const donorResponse = await fetch(actionEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(actionRequestBody),
        });

        if (!donorResponse.ok) {
          const errorData = await donorResponse.json().catch(() => null);
          throw new Error(
            errorData?.error ||
              (useDirectProspectAction
                ? "Failed to save action to the prospect record"
                : "Failed to submit action update"),
          );
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
      setToast({ tone: "success", message: getSuccessLabel(updateMode) });
      setProspectError("");
      setProspectAdded(false);
      setNextStepSaved(false);
      setNextStepError("");
      setDiscussionFeedback(null);

      const submittedName = donorName.trim();
      const submittedAmount = askAmount ? parseFloat(askAmount) : null;
      const submittedExpectedDate = expectedDate || null;
      const submittedNextStep = nextStep.trim();
      const submittedActionItemText =
        createActionItem && actionItemText.trim() ? actionItemText.trim() : "";
      const submittedActionItemDueDate = nextStepDueDate || null;
      const submittedOutlookReminder = createOutlookReminder;
      const submittedConstituentId =
        data?.opportunity?.constituent_id || data?.action?.constituent_id || null;
      const alreadyTracked = Boolean(data?.opportunity?.prospect_id);
      const submittedDiscussionItem =
        createDiscussionItem && discussionSubject.trim()
          ? {
              subject: discussionSubject.trim(),
              body: discussionBody.trim() || null,
              dueDate: discussionDueDate || null,
              assignedUserId: discussionAssignedUserId || null,
            }
          : null;

      setDonorName("");
      setActionCategory(ACTION_CATEGORIES[0]);
      setInteractionType(INTERACTION_TYPES[0]);
      setActionNotes("");
      setNextStep("");
      setOpportunityStage("Identification");
      setAskAmount("");
      setAskDate("");
      setExpectedDate("");
      setOpportunityNotes("");
      setOpportunityTitle("");
      setConstituentMatches([]);
      setBlackbaudMatches([]);
      setSelectedBlackbaudMatch(null);
      setMatchDecision("");
      setLinkedProspectContext(null);
      setOpportunityLinkMode("create");
      setSelectedOpportunityId("");
      setDictationTarget("");
      setDictationStatus("");
      setDictationError("");
      setCreateActionItem(false);
      setActionItemText("");
      setActionItemTextEdited(false);
      setCreateOutlookReminder(false);
      setNextStepDueDate("");
      setIsJointSolicitation(false);
      setSelectedJointMgoIds([]);
      setCreateDiscussionItem(false);
      setDiscussionSubject("");
      setDiscussionSubjectEdited(false);
      setDiscussionBody("");
      setDiscussionDueDate("");
      setDiscussionAssignedUserId("");

      try {
        const response = await fetch("/api/prospects");
        if (!response.ok) {
          setProspectPrompt(null);
          setNextStepPrompt(null);
          return;
        }

        const prospects = await response.json();
        const normalizedSubmittedName = normalizeName(submittedName);
        const matchedProspect =
          Array.isArray(prospects) &&
          prospects.find((prospect) => {
            if (submittedConstituentId && prospect.constituent_id) {
              return Number(prospect.constituent_id) === Number(submittedConstituentId);
            }
            return normalizeName(prospect.prospect_name) === normalizedSubmittedName;
          });
        const trackedInList =
          alreadyTracked ||
          Boolean(matchedProspect);

        setProspectPrompt(
          trackedInList
            ? null
            : {
                prospectName: submittedName,
                constituentId: submittedConstituentId,
                askAmount: submittedAmount,
                expectedCloseFY: getFiscalYearLabel(submittedExpectedDate),
                askType: "Major Gift",
                nextActionText: submittedActionItemText || null,
                nextActionDueDate: submittedActionItemDueDate,
              },
        );
        setNextStepPrompt(
          submittedActionItemText
            ? {
                prospectId: matchedProspect?.id || null,
                prospectName: submittedName,
                nextActionText: submittedActionItemText,
                nextActionDueDate: submittedActionItemDueDate,
                shouldOpenOutlook: submittedOutlookReminder,
              }
            : null,
        );

        if (submittedDiscussionItem) {
          const resolvedProspectId =
            matchedProspect?.id || data?.opportunity?.prospect_id || null;
          try {
            await createDiscussionMutation.mutateAsync({
              subject: submittedDiscussionItem.subject,
              body: submittedDiscussionItem.body,
              dueDate: submittedDiscussionItem.dueDate,
              assignedUserId: submittedDiscussionItem.assignedUserId,
              prospectId: resolvedProspectId,
              constituentId: submittedConstituentId,
            });
            setDiscussionFeedback({
              tone: "success",
              message: "Team discussion added to the discussion hub.",
            });
          } catch (discussionError) {
            setDiscussionFeedback({
              tone: "error",
              message:
                discussionError?.message ||
                "The update was submitted, but the team discussion could not be created.",
            });
          }
        }
      } catch (prospectLookupError) {
        console.error("Prospect lookup error:", prospectLookupError);
        setProspectPrompt(null);
        setNextStepPrompt(null);
        if (submittedDiscussionItem) {
          try {
            await createDiscussionMutation.mutateAsync({
              subject: submittedDiscussionItem.subject,
              body: submittedDiscussionItem.body,
              dueDate: submittedDiscussionItem.dueDate,
              assignedUserId: submittedDiscussionItem.assignedUserId,
              constituentId: submittedConstituentId,
            });
            setDiscussionFeedback({
              tone: "success",
              message: "Team discussion added to the discussion hub.",
            });
          } catch (discussionError) {
            setDiscussionFeedback({
              tone: "error",
              message:
                discussionError?.message ||
                "The update was submitted, but the team discussion could not be created.",
            });
          }
        }
      }
    },
    onError: (err) => {
      console.error(err);
      const message = err?.message || "Failed to submit. Please try again.";
      setError(message);
      setToast({ tone: "error", message });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setProspectPrompt(null);
    setProspectError("");
    setProspectAdded(false);
    setNextStepPrompt(null);
    setNextStepSaved(false);
    setNextStepError("");
    setDiscussionFeedback(null);

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

    if (includeAction && !actionNotes.trim()) {
      setError("Please add action notes for the action update.");
      return;
    }

    if (includeAction && createActionItem && !actionItemText.trim()) {
      setError("Please enter the action item you want to save as a reminder.");
      return;
    }

    if (createDiscussionItem && !discussionSubject.trim()) {
      setError("Please add a discussion subject before you submit.");
      return;
    }

    if (includeOpportunity && !opportunityTitle.trim()) {
      setError("Please enter the opportunity name.");
      return;
    }

    if (includeOpportunity && !askAmount) {
      setError("Please enter the ask amount for the opportunity update.");
      return;
    }

    if (includeOpportunity && !expectedDate) {
      setError("Please enter the expected date.");
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
      !opportunityTitle.trim()
    ) {
      setError("Please give the linked opportunity a name.");
      return;
    }

    const constituentId = matchDecision === "link" ? exactMatch?.id || null : null;
    const blackbaudConstituentId =
      selectedBlackbaudMatch?.blackbaudConstituentId || null;
    const createNewConstituent = matchDecision === "new";
    const combinedOpportunityNotes = opportunityNotes.trim();
    const combinedActionNotes = actionNotes.trim();
    const jointMgoUserIds = isJointSolicitation ? selectedJointMgoIds : [];
    const sharedOpportunityKey = opportunityTitle.trim()
      ? `joint:${blackbaudConstituentId || normalizeName(donorName)}:${opportunityTitle
          .trim()
          .toLowerCase()}`
      : null;

    submitMutation.mutate({
      includeAction,
      includeOpportunity,
      actionBody: includeAction
        ? {
            donorName,
            constituentId,
            blackbaudConstituentId,
            createNewConstituent,
            interactionType,
            actionCategory,
            summary: donorName.trim() ? `${donorName.trim()} action` : "",
            notes: combinedActionNotes,
            nextStep,
            nextActionDueDate: nextStepDueDate || null,
            estimatedAmount: askAmount ? parseFloat(askAmount) : null,
            transcript: null,
            attachments: [],
            linkedProspectId: linkedProspectContext?.prospect?.id || null,
            linkedOpportunityId:
              linkedProspectContext?.prospect && opportunityLinkMode === "update"
                ? Number(selectedOpportunityId) || null
                : null,
          }
        : null,
      opportunityBody: includeOpportunity
        ? {
            donorName,
            constituentId,
            blackbaudConstituentId,
            createNewConstituent,
            opportunityTitle: opportunityTitle.trim(),
            opportunityStage,
            askAmount: askAmount ? parseFloat(askAmount) : null,
            askDate: askDate || null,
            expectedDate: expectedDate || null,
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
            jointMgoUserIds,
            sharedOpportunityKey,
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
        {toast ? (
          <div
            style={{
              position: "fixed",
              right: "24px",
              bottom: "24px",
              zIndex: 30,
              maxWidth: "320px",
              padding: "14px 16px",
              borderRadius: "14px",
              border:
                toast.tone === "success" ? "1px solid #86EFAC" : "1px solid #FCA5A5",
              backgroundColor:
                toast.tone === "success" ? "rgba(236,253,245,0.98)" : "rgba(254,242,242,0.98)",
              color: toast.tone === "success" ? "#166534" : "#991B1B",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.14)",
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            {toast.message}
          </div>
        ) : null}

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
            Use the microphone buttons beside Action-specific notes, Next step, and Opportunity-specific notes to dictate directly into those fields.
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
            <div style={{ fontSize: "15px", fontWeight: "700", marginBottom: "6px" }}>
              Action needed
            </div>
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
              padding: "20px 24px",
              marginBottom: "20px",
            }}
          >
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
              Update snapshot
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "999px",
                  backgroundColor: "#EEF2FF",
                  color: "#4338CA",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                {UPDATE_MODES.find((option) => option.value === updateMode)?.label || "Update"}
              </div>
              {donorName.trim() ? (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    backgroundColor: "#F3F4F6",
                    color: "#111827",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Donor: {donorName.trim()}
                </div>
              ) : null}
              {selectedBlackbaudMatch?.lookupId ? (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    backgroundColor: "#EFF6FF",
                    color: "#1D4ED8",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  Lookup ID: {selectedBlackbaudMatch.lookupId}
                </div>
              ) : null}
              {linkedProspectContext?.prospect?.prospect_name ? (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    backgroundColor: "#ECFDF5",
                    color: "#047857",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  Linked prospect: {linkedProspectContext.prospect.prospect_name}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
              {steps.map((step, index) => (
                <div
                  key={step.label}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    backgroundColor: step.done
                      ? "#DCFCE7"
                      : step.current
                        ? "#EEF2FF"
                        : "#F9FAFB",
                    color: step.done ? "#166534" : step.current ? "#4338CA" : "#6B7280",
                    border: step.current ? "1px solid #C7D2FE" : "1px solid #E5E7EB",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {index + 1}. {step.label}
                </div>
              ))}
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
            <div style={{ marginBottom: "18px" }}>
              <h2 style={{ margin: "0 0 6px", fontSize: "18px", color: "#111827" }}>
                Who is this update about?
              </h2>
              <div style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.5 }}>
                Start with the donor, then decide whether this update should link to an
                existing workflow person, a Blackbaud constituent, or a current opportunity.
              </div>
            </div>

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
                setSelectedBlackbaudMatch(null);
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
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#6B7280",
                    marginBottom: "8px",
                  }}
                >
                  Workflow match
                </div>
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
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#6B7280",
                    marginBottom: "8px",
                  }}
                >
                  Blackbaud match
                </div>
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
                    const exact =
                      blackbaudExactMatch?.blackbaudConstituentId ===
                      match.blackbaudConstituentId;
                    const selected =
                      selectedBlackbaudMatch?.blackbaudConstituentId ===
                      match.blackbaudConstituentId;
                    return (
                      <div
                        key={match.blackbaudConstituentId || match.name}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: selected
                            ? "2px solid #2563EB"
                            : exact
                              ? "1px solid #60A5FA"
                              : "1px solid #DBEAFE",
                          backgroundColor: selected
                            ? "#DBEAFE"
                            : exact
                              ? "#DBEAFE"
                              : "white",
                        }}
                      >
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
                          {match.name || "Unnamed constituent"}
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
                              if (match.name) {
                                setDonorName(match.name);
                                if (
                                  !opportunityTitle.trim() ||
                                  normalizeName(opportunityTitle) ===
                                    `${normalizeName(donorName)} opportunity`
                                ) {
                                  setOpportunityTitle(`${match.name} opportunity`);
                                }
                              }
                            }}
                            style={{
                              padding: "7px 12px",
                              borderRadius: "999px",
                              border: selected ? "1px solid #1D4ED8" : "1px solid #93C5FD",
                              backgroundColor: selected ? "#1D4ED8" : "white",
                              color: selected ? "white" : "#1D4ED8",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {selected ? "Blackbaud match selected" : "Use this Blackbaud match"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: "8px", fontSize: "12px", color: "#4B5563" }}>
                  Choose a match to save its Blackbaud constituent ID onto the local constituent.
                </div>
              </div>
            ) : null}

            {!blackbaudMatches.length &&
            !selectedBlackbaudMatch &&
            donorName.trim().length >= 2 ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#6B7280",
                    marginBottom: "8px",
                  }}
                >
                  Blackbaud match
                </div>
                <div style={{ fontSize: "13px", color: "#4B5563" }}>
                  {blackbaudSearchLoading
                    ? "Searching Raiser's Edge NXT..."
                    : blackbaudSearchError ||
                      blackbaudSearchWarning ||
                      "No Raiser's Edge NXT match found yet."}
                </div>
              </div>
            ) : null}

            {selectedBlackbaudMatch ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #93C5FD",
                  backgroundColor: "#EFF6FF",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#6B7280",
                    marginBottom: "8px",
                  }}
                >
                  Selected match
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1D4ED8" }}>
                  Selected Blackbaud match
                </div>
                {blackbaudSearchWarning ? (
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "12px",
                      color: "#1D4ED8",
                    }}
                  >
                    {blackbaudSearchWarning}
                  </div>
                ) : null}
                <div style={{ marginTop: "6px", fontSize: "13px", color: "#1F2937" }}>
                  {selectedBlackbaudMatch.name} will be linked
                  {selectedBlackbaudMatch.lookupId ? (
                    <>
                      {" "}with Lookup ID <strong>{selectedBlackbaudMatch.lookupId}</strong>.
                    </>
                  ) : (
                    "."
                  )}
                </div>
              </div>
            ) : null}

            {selectedBlackbaudMatch ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #BFDBFE",
                  backgroundColor: "#F8FBFF",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#6B7280",
                    marginBottom: "8px",
                  }}
                >
                  Blackbaud Summary
                </div>
                {selectedBlackbaudSummaryLoading ? (
                  <div style={{ fontSize: "13px", color: "#4B5563" }}>
                    Loading constituent data from Raiser's Edge NXT...
                  </div>
                ) : selectedBlackbaudSummaryError ? (
                  <div style={{ fontSize: "13px", color: "#991B1B" }}>
                    {selectedBlackbaudSummaryError}
                  </div>
                ) : blackbaudConstituent ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div
                      style={{
                        display: "grid",
                        gap: "4px",
                        fontSize: "13px",
                        color: "#1F2937",
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                        {blackbaudConstituent.name || selectedBlackbaudMatch.name}
                      </div>
                      {blackbaudConstituent.lookupId ? (
                        <div>
                          Lookup ID: <strong>{blackbaudConstituent.lookupId}</strong>
                        </div>
                      ) : null}
                      {blackbaudConstituent.email ? (
                        <div>Email: {blackbaudConstituent.email}</div>
                      ) : null}
                      {blackbaudConstituent.phone ? (
                        <div>Phone: {blackbaudConstituent.phone}</div>
                      ) : null}
                      {blackbaudConstituent.address ? (
                        <div style={{ whiteSpace: "pre-line" }}>
                          Address: {blackbaudConstituent.address}
                        </div>
                      ) : null}
                    </div>

                    {(blackbaudLifetimeGiving ||
                      blackbaudFundraiserAssignments.length > 0) ? (
                      <div
                        style={{
                          display: "grid",
                          gap: "8px",
                          paddingTop: "12px",
                          borderTop: "1px solid #DBEAFE",
                          fontSize: "13px",
                          color: "#1F2937",
                        }}
                      >
                        {blackbaudLifetimeGiving ? (
                          <div>
                            Lifetime giving:{" "}
                            <strong>
                              {blackbaudLifetimeGiving.totalGiving == null
                                ? "Unavailable"
                                : `$${Number(
                                    blackbaudLifetimeGiving.totalGiving,
                                  ).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}`}
                            </strong>
                          </div>
                        ) : null}
                        {blackbaudFundraiserAssignments.length > 0 ? (
                          <div>
                            Assigned fundraiser:{" "}
                            <strong>
                              {blackbaudFundraiserAssignments[0]?.fundraiserId || "Assigned"}
                            </strong>
                            {blackbaudFundraiserAssignments[0]?.type
                              ? ` (${blackbaudFundraiserAssignments[0].type})`
                              : ""}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "#4B5563" }}>
                    No Raiser's Edge NXT summary is available for this constituent yet.
                  </div>
                )}
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
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#6B7280",
                    marginBottom: "8px",
                  }}
                >
                  Linked opportunity context
                </div>
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
                      New linked opportunity
                    </label>
                    <div style={{ fontSize: "13px", color: "#4B5563" }}>
                      This update will create a linked opportunity under the opportunity name below.
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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
              <button
                type="button"
                onClick={() => setActionDetailsOpen((current) => !current)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  padding: 0,
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "#6B7280",
                      marginBottom: "6px",
                    }}
                  >
                    Action update
                  </div>
                  <h2 style={{ margin: "0 0 8px", fontSize: "18px", color: "#111827" }}>
                    Action details
                  </h2>
                  <div style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.5 }}>
                    Record the interaction itself, then capture any follow-up the team should
                    carry forward.
                  </div>
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#4338CA" }}>
                  {actionDetailsOpen ? "Hide" : "Show"}
                </div>
              </button>
              {actionDetailsOpen ? (
                <div style={{ marginTop: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: "8px",
                    }}
                  >
                    Action category
                  </label>
                  <select
                    value={actionCategory}
                    onChange={(event) => setActionCategory(event.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "1px solid #D1D5DB",
                      backgroundColor: "white",
                      color: "#111827",
                      fontSize: "14px",
                      fontWeight: 600,
                      marginBottom: "12px",
                    }}
                  >
                    {ACTION_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
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
                    Action type
                  </label>
                  <select
                    value={interactionType}
                    onChange={(event) => setInteractionType(event.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "1px solid #D1D5DB",
                      backgroundColor: "white",
                      color: "#111827",
                      fontSize: "14px",
                      fontWeight: 600,
                      marginBottom: "16px",
                    }}
                  >
                    {INTERACTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
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
                    Common follow-ups
                  </label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
                    {COMMON_NEXT_STEPS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setNextStep(item)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "999px",
                          border: "1px solid #D1D5DB",
                          backgroundColor: "white",
                          color: "#374151",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {item}
                      </button>
                    ))}
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
              <button
                type="button"
                onClick={() => setOpportunityDetailsOpen((current) => !current)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  padding: 0,
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "#6B7280",
                      marginBottom: "6px",
                    }}
                  >
                    Opportunity update
                  </div>
                  <h2 style={{ margin: "0 0 8px", fontSize: "18px", color: "#111827" }}>
                    Opportunity details
                  </h2>
                  <div style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.5 }}>
                    Update the current opportunity status, ask details, and any solicitation context that should
                    change the opportunity record.
                  </div>
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#4338CA" }}>
                  {opportunityDetailsOpen ? "Hide" : "Show"}
                </div>
              </button>
              {opportunityDetailsOpen ? (
                <div style={{ marginTop: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: "8px",
                    }}
                  >
                    Opportunity name
                  </label>
                  <input
                    type="text"
                    value={opportunityTitle}
                    onChange={(event) => setOpportunityTitle(event.target.value)}
                    placeholder={`${donorName.trim() || "Donor"} opportunity`}
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
                    Status
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

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "16px",
                      marginBottom: "16px",
                    }}
                  >
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#374151",
                            marginBottom: "8px",
                          }}
                        >
                          Ask Date
                        </label>
                        <input
                          type="date"
                          value={askDate}
                          onChange={(event) => setAskDate(event.target.value)}
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
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#374151",
                            marginBottom: "8px",
                          }}
                        >
                          Date Expected
                        </label>
                        <input
                          type="date"
                          value={expectedDate}
                          onChange={(event) => setExpectedDate(event.target.value)}
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
                    Ask Amount
                  </label>
                  <input
                    type="number"
                    value={askAmount}
                    onChange={(event) => setAskAmount(event.target.value)}
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
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isJointSolicitation}
                      onChange={(event) => {
                        setIsJointSolicitation(event.target.checked);
                        if (!event.target.checked) {
                          setSelectedJointMgoIds([]);
                        }
                      }}
                    />
                    Is this a joint solicitation?
                  </label>
                  {isJointSolicitation ? (
                    <div
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        border: "1px solid #E5E7EB",
                        backgroundColor: "#F9FAFB",
                        marginBottom: "16px",
                      }}
                    >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "#111827",
                            marginBottom: "8px",
                          }}
                        >
                          Add other MGOs
                        </div>
                        {jointMgoLoading ? (
                          <div style={{ fontSize: "13px", color: "#6B7280" }}>
                            Loading MGO options...
                          </div>
                        ) : jointMgoError ? (
                          <div style={{ fontSize: "13px", color: "#991B1B" }}>
                            {jointMgoError}
                          </div>
                        ) : jointMgoOptions.length === 0 ? (
                          <div style={{ fontSize: "13px", color: "#6B7280" }}>
                            No other active MGO users are available to add right now.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "8px" }}>
                            {jointMgoOptions.map((option) => {
                              const checked = selectedJointMgoIds.includes(Number(option.id));
                              return (
                                <label
                                  key={option.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    fontSize: "14px",
                                    color: "#374151",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                      const optionId = Number(option.id);
                                      setSelectedJointMgoIds((current) =>
                                        event.target.checked
                                          ? [...current, optionId]
                                          : current.filter((value) => value !== optionId),
                                      );
                                    }}
                                  />
                                  <span>
                                    {option.name} <span style={{ color: "#6B7280" }}>({option.email})</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ marginTop: "10px", fontSize: "12px", color: "#6B7280" }}>
                          Selected MGOs will get this opportunity in their own opportunities and top prospects list.
                        </div>
                    </div>
                  ) : null}

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
            </div>
          ) : null}

          {includeAction ? (
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "20px 24px",
                marginBottom: "20px",
              }}
            >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  Optional internal coordination
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
                  Follow-up reminder
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6B7280",
                    lineHeight: 1.5,
                  }}
                >
                  Turn the next step into a reminder only if you need it in your companion to-do flow.
                </div>
              <div style={{ marginTop: "16px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  fontSize: "14px",
                  color: "#111827",
                  fontWeight: 600,
                  marginBottom: createActionItem ? "16px" : 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={createActionItem}
                  onChange={(event) => setCreateActionItem(event.target.checked)}
                  style={{ marginTop: "2px" }}
                />
                Create a follow-up reminder from this update
              </label>
              {createActionItem ? (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: "8px",
                      }}
                    >
                      Action item
                    </label>
                    <textarea
                      value={actionItemText}
                      onChange={(event) => {
                        setActionItemText(event.target.value);
                        setActionItemTextEdited(true);
                      }}
                      placeholder="Example: Call donor next Tuesday to confirm visit date."
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
                    {nextStep.trim() && !actionItemTextEdited ? (
                      <div style={{ marginTop: "8px", fontSize: "12px", color: "#6B7280" }}>
                        Pulled from the <strong>Next step</strong> field. Edit it here if the
                        reminder should be shorter or more specific.
                      </div>
                    ) : null}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(180px, 220px) 1fr",
                      gap: "16px",
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#374151",
                          marginBottom: "8px",
                        }}
                      >
                        Due date
                      </label>
                      <input
                        type="date"
                        value={nextStepDueDate}
                        onChange={(event) => setNextStepDueDate(event.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #D1D5DB",
                          fontSize: "14px",
                          boxSizing: "border-box",
                          backgroundColor: "white",
                        }}
                      />
                    </div>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "14px",
                        color: "#111827",
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={createOutlookReminder}
                        onChange={(event) =>
                          setCreateOutlookReminder(event.target.checked)
                        }
                      />
                      Add an Outlook calendar reminder after submit
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
            </div>
          ) : null}

          <details
            open={teamDiscussionOpen}
            onToggle={(event) => setTeamDiscussionOpen(event.currentTarget.open)}
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "20px 24px",
              marginBottom: "20px",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
              }}
            >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "6px",
              }}
            >
              <MessageSquare size={16} color="#4F46E5" />
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "#6B7280",
                }}
              >
                Optional internal coordination
              </div>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
              Team discussion
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#6B7280",
                lineHeight: 1.5,
              }}
            >
              Capture a teammate follow-up or internal discussion point alongside this
              update so it lands in the Team Discussion hub.
            </div>
            </summary>
            <div style={{ marginTop: "16px" }}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                fontSize: "14px",
                color: "#111827",
                fontWeight: 600,
                marginBottom: createDiscussionItem ? "16px" : 0,
              }}
            >
              <input
                type="checkbox"
                checked={createDiscussionItem}
                onChange={(event) => setCreateDiscussionItem(event.target.checked)}
                style={{ marginTop: "2px" }}
              />
              Add an internal team discussion item from this update
            </label>
            {createDiscussionItem ? (
              <div style={{ display: "grid", gap: "16px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: "8px",
                    }}
                  >
                    Discussion subject
                  </label>
                  <input
                    type="text"
                    value={discussionSubject}
                    onChange={(event) => {
                      setDiscussionSubject(event.target.value);
                      setDiscussionSubjectEdited(true);
                    }}
                    placeholder="Example: Talk through ask timing for this opportunity"
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
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: "8px",
                    }}
                  >
                    Discussion notes
                  </label>
                  <textarea
                    value={discussionBody}
                    onChange={(event) => setDiscussionBody(event.target.value)}
                    placeholder="Add context, what you want input on, or what should be discussed at the next team check-in."
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
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 220px) minmax(220px, 1fr)",
                    gap: "16px",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: "8px",
                      }}
                    >
                      Discuss by
                    </label>
                    <input
                      type="date"
                      value={discussionDueDate}
                      onChange={(event) => setDiscussionDueDate(event.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #D1D5DB",
                        fontSize: "14px",
                        boxSizing: "border-box",
                        backgroundColor: "white",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: "8px",
                      }}
                    >
                      Share with teammate
                    </label>
                    <select
                      value={discussionAssignedUserId}
                      onChange={(event) => setDiscussionAssignedUserId(event.target.value)}
                      disabled={jointMgoLoading}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #D1D5DB",
                        backgroundColor: "white",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="">Keep on my discussion list</option>
                      {jointMgoOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {jointMgoLoading ? (
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#6B7280" }}>
                        Loading teammate options...
                      </div>
                    ) : jointMgoError ? (
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#6B7280" }}>
                        {jointMgoError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            </div>
          </details>

          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "24px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "#6B7280",
                marginBottom: "6px",
              }}
            >
              Review and submit
            </div>
            <div style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.5, marginBottom: "16px" }}>
              Save the update, keep the next step current, and only add internal coordination if needed.
            </div>
            {submitMutation.isPending ? (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#EDE9FE",
                  color: "#5B21B6",
                  borderRadius: "12px",
                  marginBottom: "16px",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Saving update...
              </div>
            ) : null}
            {successMessage ? (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#D1FAE5",
                  color: "#065F46",
                  borderRadius: "12px",
                  marginBottom: "16px",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <div style={{ fontSize: "15px", fontWeight: "700", marginBottom: "6px" }}>
                  Saved
                </div>
                {successMessage}
                <div style={{ marginTop: "8px", fontSize: "13px", fontWeight: 700 }}>
                  Synced to NXT where linked.
                </div>
              </div>
            ) : null}
            {prospectPrompt ? (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#FEF3C7",
                  color: "#92400E",
                  borderRadius: "12px",
                  marginBottom: "16px",
                  fontSize: "14px",
                }}
              >
                Would you like to add <strong>{prospectPrompt.prospectName}</strong> to My Top
                Prospects?
                <div style={{ marginTop: "10px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() =>
                      addProspectMutation.mutate({
                        ...prospectPrompt,
                        nextActionDueDate: prospectPrompt.nextActionDueDate || null,
                      })
                    }
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
            {nextStepPrompt ? (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#EEF2FF",
                  color: "#3730A3",
                  borderRadius: "12px",
                  marginBottom: "16px",
                  fontSize: "14px",
                }}
              >
                <div style={{ fontSize: "15px", fontWeight: "700", marginBottom: "6px" }}>
                  Make this next step actionable
                </div>
                <div style={{ lineHeight: 1.5, marginBottom: "12px" }}>
                  Save <strong>{nextStepPrompt.nextActionText}</strong> as a follow-up for{" "}
                  <strong>{nextStepPrompt.prospectName}</strong>.
                </div>
                {nextStepPrompt.nextActionDueDate ? (
                  <div
                    style={{
                      marginBottom: "12px",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#4338CA",
                    }}
                  >
                    Due date: {nextStepPrompt.nextActionDueDate}
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    alignItems: "end",
                    marginBottom: "12px",
                  }}
                >
                  {nextStepPrompt.prospectId ? (
                    <button
                      type="button"
                      onClick={() =>
                        saveNextStepMutation.mutate({
                          prospectId: nextStepPrompt.prospectId,
                          nextActionText: nextStepPrompt.nextActionText,
                          nextActionDueDate: nextStepPrompt.nextActionDueDate || null,
                        })
                      }
                      disabled={saveNextStepMutation.isPending}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "none",
                        backgroundColor: saveNextStepMutation.isPending ? "#C7D2FE" : "#4F46E5",
                        color: "white",
                        fontWeight: 700,
                        cursor: saveNextStepMutation.isPending ? "not-allowed" : "pointer",
                      }}
                    >
                      {saveNextStepMutation.isPending ? "Saving..." : "Save reminder"}
                    </button>
                  ) : null}
                  {nextStepPrompt.shouldOpenOutlook && nextStepPrompt.nextActionDueDate ? (
                    <a
                      href={buildOutlookCalendarUrl({
                        subject: `${nextStepPrompt.prospectName} follow-up`,
                        notes: nextStepPrompt.nextActionText,
                        dueDate: nextStepPrompt.nextActionDueDate,
                      })}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #C7D2FE",
                        backgroundColor: "white",
                        color: "#4338CA",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Add to Outlook
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setNextStepPrompt(null);
                      setNextStepError("");
                      setNextStepSaved(false);
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #C7D2FE",
                      backgroundColor: "white",
                      color: "#4338CA",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Not now
                  </button>
                </div>
                {!nextStepPrompt.prospectId ? (
                  <div style={{ fontSize: "12px", color: "#5B21B6" }}>
                    Add this person to My Top Prospects first if you want the next step to show in
                    your follow-up list.
                  </div>
                ) : null}
                {nextStepSaved ? (
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>
                    Reminder saved. It will now appear on My Top Prospects as the next action.
                  </div>
                ) : null}
                {nextStepError ? (
                  <div style={{ fontSize: "12px", color: "#991B1B" }}>{nextStepError}</div>
                ) : null}
              </div>
            ) : null}
            {prospectAdded ? (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#DBEAFE",
                  color: "#1D4ED8",
                  borderRadius: "12px",
                  marginBottom: "16px",
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
                  marginBottom: "16px",
                  fontSize: "14px",
                }}
              >
                {prospectError}
              </div>
            ) : null}
            {discussionFeedback ? (
              <div
                style={{
                  padding: "16px",
                  backgroundColor:
                    discussionFeedback.tone === "error" ? "#FEF2F2" : "#EEF2FF",
                  color: discussionFeedback.tone === "error" ? "#991B1B" : "#3730A3",
                  borderRadius: "12px",
                  marginBottom: "16px",
                  fontSize: "14px",
                  fontWeight: discussionFeedback.tone === "error" ? 600 : 700,
                }}
              >
                {discussionFeedback.message}{" "}
                {discussionFeedback.tone !== "error" ? (
                  <a
                    href="/team-discussion"
                    style={{ color: "#3730A3", textDecoration: "underline" }}
                  >
                    Open Team Discussion
                  </a>
                ) : null}
              </div>
            ) : null}
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
                {submitMutation.isPending
                  ? "Saving..."
                  : nextStep.trim() || createActionItem
                    ? "Save + set next step"
                    : "Save update"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

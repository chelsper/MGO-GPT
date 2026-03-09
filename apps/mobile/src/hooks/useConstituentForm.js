import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DRAFT_KEY = "new-constituent-draft";

export function useConstituentForm() {
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [assignToMe, setAssignToMe] = useState("");
  const [businessCardUrl, setBusinessCardUrl] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [recordingUri, setRecordingUri] = useState(null);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, []);

  // Save draft whenever form fields change
  useEffect(() => {
    saveDraft();
  }, [
    name,
    organization,
    email,
    phone,
    notes,
    assignToMe,
    businessCardUrl,
    transcript,
    recordingUri,
  ]);

  const loadDraft = async () => {
    try {
      const draft = await AsyncStorage.getItem(DRAFT_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        setName(parsed.name || "");
        setOrganization(parsed.organization || "");
        setEmail(parsed.email || "");
        setPhone(parsed.phone || "");
        setNotes(parsed.notes || "");
        setAssignToMe(parsed.assignToMe || "");
        setBusinessCardUrl(parsed.businessCardUrl || null);
        setTranscript(parsed.transcript || "");
        setRecordingUri(parsed.recordingUri || null);
      }
    } catch (error) {
      console.error("Failed to load draft:", error);
    }
  };

  const saveDraft = async () => {
    try {
      const draft = {
        name,
        organization,
        email,
        phone,
        notes,
        assignToMe,
        businessCardUrl,
        transcript,
        recordingUri,
      };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error("Failed to save draft:", error);
    }
  };

  const clearDraft = async () => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      console.error("Failed to clear draft:", error);
    }
  };

  const updateFromExtractedFields = (fields) => {
    if (fields.name) setName(fields.name);
    if (fields.organization) setOrganization(fields.organization);
    if (fields.email) setEmail(fields.email);
    if (fields.phone) setPhone(fields.phone);
    if (fields.notes) setNotes(fields.notes);
  };

  return {
    formData: {
      name,
      organization,
      email,
      phone,
      notes,
      assignToMe,
      businessCardUrl,
      transcript,
      recordingUri,
    },
    setters: {
      setName,
      setOrganization,
      setEmail,
      setPhone,
      setNotes,
      setAssignToMe,
      setBusinessCardUrl,
      setTranscript,
      setRecordingUri,
    },
    updateFromExtractedFields,
    clearDraft,
  };
}

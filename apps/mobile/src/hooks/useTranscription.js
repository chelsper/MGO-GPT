import { useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";

export function useTranscription(onFieldsExtracted) {
  const [isTranscribing, setIsTranscribing] = useState(false);

  const transcribeAudio = async (audioUri) => {
    setIsTranscribing(true);
    try {
      // Upload the audio file using direct FormData upload to the platform endpoint
      // The useUpload hook's Uploadcare fallback doesn't work reliably for audio files
      const formData = new FormData();
      formData.append("file", {
        uri: audioUri,
        type: "audio/m4a",
        name: "recording.m4a",
      });

      const uploadResponse = await fetch("/_create/api/upload/", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        console.error("Audio upload failed:", uploadResponse.status);
        throw new Error("Failed to upload audio");
      }

      const uploadData = await uploadResponse.json();
      const audioUrl = uploadData.url;

      if (!audioUrl) {
        console.error("Audio upload returned no URL");
        throw new Error("Failed to upload audio");
      }

      // Send the uploaded URL to the backend for transcription
      const transcriptionResponse = await fetch("/api/transcribe-constituent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl }),
      });

      if (!transcriptionResponse.ok) {
        const errorData = await transcriptionResponse.text();
        console.error(
          "Transcription API error:",
          transcriptionResponse.status,
          errorData,
        );
        throw new Error("Transcription failed");
      }

      const data = await transcriptionResponse.json();
      const transcript = data.transcript || "";

      // Auto-fill fields from extracted data
      if (data.extractedFields) {
        onFieldsExtracted(data.extractedFields);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return transcript;
    } catch (error) {
      console.error("Transcription error:", error);
      Alert.alert("Error", "Failed to transcribe audio. Please try again.");
      throw error;
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
    isTranscribing,
    transcribeAudio,
  };
}

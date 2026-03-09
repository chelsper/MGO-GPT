import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { ArrowLeft, Mic, Square } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/components/useColors";
import { StatusBar } from "expo-status-bar";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";
import useUpload from "@/utils/useUpload";

const DRAFT_KEY = "opportunity-update-draft";

export default function UpdateOpportunityScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const [upload] = useUpload();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const [donorName, setDonorName] = useState("");
  const [opportunityStage, setOpportunityStage] = useState("Identification");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const scaleAnim = useState(new Animated.Value(1))[0];

  // Waveform animation
  const waveformAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3)),
  ).current;

  const stages = [
    "Identification",
    "Qualification",
    "Cultivation",
    "Solicitation",
    "Stewardship",
  ];

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, []);

  // Save draft whenever form fields change
  useEffect(() => {
    saveDraft();
  }, [donorName, opportunityStage, estimatedAmount, notes, transcript]);

  const loadDraft = async () => {
    try {
      const draft = await AsyncStorage.getItem(DRAFT_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        setDonorName(parsed.donorName || "");
        setOpportunityStage(parsed.opportunityStage || "Identification");
        setEstimatedAmount(parsed.estimatedAmount || "");
        setNotes(parsed.notes || "");
        setTranscript(parsed.transcript || "");
      }
    } catch (error) {
      console.error("Failed to load draft:", error);
    }
  };

  const saveDraft = async () => {
    try {
      const draft = {
        donorName,
        opportunityStage,
        estimatedAmount,
        notes,
        transcript,
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

  const animateWaveform = () => {
    const animations = waveformAnims.map((anim, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 200 + index * 50,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 200 + index * 50,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    Animated.parallel(animations).start();
  };

  const stopWaveform = () => {
    waveformAnims.forEach((anim) => {
      anim.stopAnimation();
      anim.setValue(0.3);
    });
  };

  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please enable microphone access to record audio.",
        );
        return;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      animateWaveform();

      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } catch (err) {
      console.error("Failed to start recording", err);
      Alert.alert("Error", "Failed to start recording");
    }
  };

  const stopRecording = async () => {
    if (!recorderState.isRecording) return;

    try {
      stopWaveform();
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);

      await recorder.stop();
      const uri = recorder.uri;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (uri) {
        await transcribeAudio(uri);
      }
    } catch (err) {
      console.error("Failed to stop recording", err);
      Alert.alert("Error", "Failed to stop recording");
    }
  };

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

      const transcriptionResponse = await fetch("/api/transcribe-opportunity", {
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
      const transcriptText = data.transcript || "";
      setTranscript(transcriptText);

      // Append the new transcript to existing notes
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
          fields.opportunityStage &&
          stages.includes(fields.opportunityStage)
        ) {
          setOpportunityStage(fields.opportunityStage);
        }

        if (fields.estimatedAmount && !estimatedAmount) {
          setEstimatedAmount(fields.estimatedAmount.toString());
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Transcription error:", error);
      Alert.alert("Error", "Failed to transcribe audio. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSubmit = async () => {
    if (!donorName.trim()) {
      Alert.alert("Required Field", "Please enter a donor name");
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const response = await fetch("/api/submissions/opportunity-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donorName,
          opportunityStage,
          estimatedAmount: estimatedAmount ? parseFloat(estimatedAmount) : null,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit");
      }

      await clearDraft();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Opportunity update submitted successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Submit error:", error);
      Alert.alert("Error", "Failed to submit update. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <KeyboardAvoidingAnimatedView
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <StatusBar style="dark" />

      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.outline,
          backgroundColor: colors.background,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}
        >
          <TouchableOpacity
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.cardBackground,
              borderWidth: 1,
              borderColor: colors.outline,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 20,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
            }}
          >
            Update Opportunity
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Donor Name */}
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Poppins_500Medium",
            color: colors.text,
            marginBottom: 8,
          }}
        >
          Donor Name *
        </Text>
        <TextInput
          style={{
            height: 48,
            backgroundColor: colors.fieldFill,
            borderRadius: 12,
            paddingHorizontal: 16,
            fontSize: 15,
            fontFamily: "Poppins_400Regular",
            color: colors.text,
            marginBottom: 24,
          }}
          placeholder="Enter donor name"
          placeholderTextColor={colors.textPlaceholder}
          value={donorName}
          onChangeText={setDonorName}
        />

        {/* Opportunity Stage */}
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Poppins_500Medium",
            color: colors.text,
            marginBottom: 12,
          }}
        >
          Opportunity Stage
        </Text>
        <View style={{ marginBottom: 24 }}>
          {stages.map((stage, index) => (
            <TouchableOpacity
              key={stage}
              style={{
                height: 56,
                backgroundColor:
                  opportunityStage === stage
                    ? colors.primaryUltraLight
                    : colors.cardBackground,
                borderWidth: 1,
                borderColor:
                  opportunityStage === stage ? colors.primary : colors.outline,
                borderRadius: 12,
                paddingHorizontal: 16,
                justifyContent: "center",
                marginBottom: index < stages.length - 1 ? 12 : 0,
              }}
              onPress={() => {
                setOpportunityStage(stage);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: "Poppins_500Medium",
                    color:
                      opportunityStage === stage ? colors.primary : colors.text,
                  }}
                >
                  {stage}
                </Text>
                {opportunityStage === stage && (
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: colors.primary,
                    }}
                  />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Estimated Amount */}
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Poppins_500Medium",
            color: colors.text,
            marginBottom: 8,
          }}
        >
          Estimated Amount
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginRight: 8,
            }}
          >
            $
          </Text>
          <TextInput
            style={{
              flex: 1,
              height: 48,
              backgroundColor: colors.fieldFill,
              borderRadius: 12,
              paddingHorizontal: 16,
              fontSize: 15,
              fontFamily: "Poppins_400Regular",
              color: colors.text,
            }}
            placeholder="0.00"
            placeholderTextColor={colors.textPlaceholder}
            value={estimatedAmount}
            onChangeText={setEstimatedAmount}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Notes with dictation */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
            }}
          >
            Notes
          </Text>
          {transcript ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: colors.success + "20",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.success,
                }}
              >
                TRANSCRIBED
              </Text>
            </View>
          ) : null}
        </View>

        {/* Notes field with integrated mic button */}
        <View style={{ marginBottom: 32 }}>
          <TextInput
            style={{
              minHeight: 120,
              backgroundColor: colors.fieldFill,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 60,
              fontSize: 15,
              fontFamily: "Poppins_400Regular",
              color: colors.text,
              textAlignVertical: "top",
            }}
            placeholder="Tap the mic to dictate, or type your notes..."
            placeholderTextColor={colors.textPlaceholder}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          {/* Dictate button bar at bottom of text field */}
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 52,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
              backgroundColor: colors.fieldFill,
              borderTopWidth: 1,
              borderTopColor: colors.outline,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
            }}
          >
            {isTranscribing ? (
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Poppins_500Medium",
                    color: colors.primary,
                  }}
                >
                  Transcribing...
                </Text>
              </View>
            ) : recorderState.isRecording ? (
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* Waveform */}
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    height: 30,
                  }}
                >
                  {waveformAnims.map((anim, index) => (
                    <Animated.View
                      key={index}
                      style={{
                        width: 3,
                        backgroundColor: colors.error,
                        borderRadius: 2,
                        opacity: 0.8,
                        transform: [{ scaleY: anim }],
                        height: 24,
                      }}
                    />
                  ))}
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins_500Medium",
                      color: colors.error,
                      marginLeft: 8,
                    }}
                  >
                    Listening...
                  </Text>
                </View>

                {/* Stop button */}
                <TouchableOpacity
                  onPress={stopRecording}
                  activeOpacity={0.8}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.error,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Square
                    size={16}
                    color={colors.background}
                    fill={colors.background}
                  />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={startRecording}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Animated.View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    transform: [{ scale: scaleAnim }],
                  }}
                >
                  <Mic size={18} color={colors.background} />
                </Animated.View>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Poppins_500Medium",
                    color: colors.primary,
                  }}
                >
                  Tap to dictate
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={{
            height: 56,
            backgroundColor: colors.primary,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: insets.bottom + 20,
          }}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          <Text
            style={{
              fontSize: 16,
              fontFamily: "Poppins_600SemiBold",
              color: colors.background,
            }}
          >
            {isSubmitting ? "Submitting..." : "Submit Update"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingAnimatedView>
  );
}

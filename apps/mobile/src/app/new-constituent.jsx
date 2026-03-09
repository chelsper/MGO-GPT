import React, { useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import * as Haptics from "expo-haptics";
import { useColors } from "@/components/useColors";
import { StatusBar } from "expo-status-bar";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";
import useUpload from "@/utils/useUpload";
import { useConstituentForm } from "@/hooks/useConstituentForm";
import { useBusinessCard } from "@/hooks/useBusinessCard";
import { ScreenHeader } from "@/components/NewConstituent/ScreenHeader";
import { BusinessCardSection } from "@/components/NewConstituent/BusinessCardSection";
import { FormFields } from "@/components/NewConstituent/FormFields";
import { SubmitButton } from "@/components/NewConstituent/SubmitButton";

export default function NewConstituentScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const [upload, { loading: uploadLoading }] = useUpload();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { formData, setters, updateFromExtractedFields, clearDraft } =
    useConstituentForm();

  const { businessCardImage, isScanningCard, pickImage, takePhoto } =
    useBusinessCard(upload, updateFromExtractedFields);

  const handlePickImage = async () => {
    const url = await pickImage();
    if (url) {
      setters.setBusinessCardUrl(url);
    }
  };

  const handleTakePhoto = async () => {
    const url = await takePhoto();
    if (url) {
      setters.setBusinessCardUrl(url);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      Alert.alert("Required Field", "Please enter a name");
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const response = await fetch("/api/submissions/constituent-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          organization: formData.organization,
          email: formData.email,
          phone: formData.phone,
          notes: formData.notes,
          assignToMe: formData.assignToMe,
          businessCardUrl: formData.businessCardUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit");
      }

      await clearDraft();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Constituent suggestion submitted successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Submit error:", error);
      Alert.alert("Error", "Failed to submit suggestion. Please try again.");
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

      <ScreenHeader
        colors={colors}
        insets={insets}
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <BusinessCardSection
          colors={colors}
          businessCardImage={businessCardImage}
          isScanningCard={isScanningCard}
          uploadLoading={uploadLoading}
          onTakePhoto={handleTakePhoto}
          onPickImage={handlePickImage}
        />

        <FormFields colors={colors} formData={formData} setters={setters} />

        <SubmitButton
          colors={colors}
          insets={insets}
          isSubmitting={isSubmitting}
          uploadLoading={uploadLoading}
          onSubmit={handleSubmit}
        />
      </ScrollView>
    </KeyboardAvoidingAnimatedView>
  );
}

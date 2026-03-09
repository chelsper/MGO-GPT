import { useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

export function useBusinessCard(upload, onFieldsExtracted) {
  const [businessCardImage, setBusinessCardImage] = useState(null);
  const [isScanningCard, setIsScanningCard] = useState(false);

  const readBusinessCard = async (imageUrl) => {
    setIsScanningCard(true);
    try {
      const response = await fetch("/api/read-business-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) {
        throw new Error("Failed to read business card");
      }

      const data = await response.json();

      if (data.extractedFields) {
        onFieldsExtracted(data.extractedFields);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Business card scan error:", error);
      // Don't show an alert - just silently fail, user can still fill manually
    } finally {
      setIsScanningCard(false);
    }
  };

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      const selectedImage = result.assets[0];
      setBusinessCardImage(selectedImage);

      const { url, error } = await upload({ reactNativeAsset: selectedImage });
      if (error) {
        Alert.alert("Error", "Failed to upload image");
        return null;
      }
      readBusinessCard(url);
      return url;
    }
    return null;
  };

  const takePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Request camera permissions
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please enable camera access to take photos.",
      );
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      const selectedImage = result.assets[0];
      setBusinessCardImage(selectedImage);

      const { url, error } = await upload({ reactNativeAsset: selectedImage });
      if (error) {
        Alert.alert("Error", "Failed to upload image");
        return null;
      }
      readBusinessCard(url);
      return url;
    }
    return null;
  };

  return {
    businessCardImage,
    isScanningCard,
    pickImage,
    takePhoto,
  };
}

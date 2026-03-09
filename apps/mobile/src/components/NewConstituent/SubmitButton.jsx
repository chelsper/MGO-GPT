import React from "react";
import { TouchableOpacity, Text } from "react-native";

export function SubmitButton({
  colors,
  insets,
  isSubmitting,
  uploadLoading,
  onSubmit,
}) {
  return (
    <TouchableOpacity
      style={{
        height: 56,
        backgroundColor: colors.primary,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: insets.bottom + 20,
      }}
      onPress={onSubmit}
      disabled={isSubmitting || uploadLoading}
      activeOpacity={0.8}
    >
      <Text
        style={{
          fontSize: 16,
          fontFamily: "Poppins_600SemiBold",
          color: colors.background,
        }}
      >
        {isSubmitting
          ? "Submitting..."
          : uploadLoading
            ? "Uploading..."
            : "Submit Suggestion"}
      </Text>
    </TouchableOpacity>
  );
}

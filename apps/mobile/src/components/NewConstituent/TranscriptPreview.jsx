import React from "react";
import { View, Text } from "react-native";
import { FileText } from "lucide-react-native";

export function TranscriptPreview({ transcript, colors }) {
  if (!transcript) return null;

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <FileText size={16} color={colors.textSecondary} />
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Poppins_500Medium",
            color: colors.text,
            marginLeft: 8,
          }}
        >
          Transcript
        </Text>
        <View
          style={{
            marginLeft: 8,
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
            AUTO-FILLED
          </Text>
        </View>
      </View>
      <View
        style={{
          backgroundColor: colors.fieldFill,
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Poppins_400Regular",
            color: colors.text,
            lineHeight: 20,
          }}
        >
          {transcript}
        </Text>
      </View>
    </>
  );
}

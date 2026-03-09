import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ArrowLeft } from "lucide-react-native";

export function ScreenHeader({ colors, insets, onBack }) {
  return (
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
          onPress={onBack}
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
          New Constituent
        </Text>
      </View>
    </View>
  );
}

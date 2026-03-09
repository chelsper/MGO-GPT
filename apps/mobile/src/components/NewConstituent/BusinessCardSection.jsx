import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Camera, Upload, FileText } from "lucide-react-native";
import { Image } from "expo-image";

export function BusinessCardSection({
  colors,
  businessCardImage,
  isScanningCard,
  uploadLoading,
  onTakePhoto,
  onPickImage,
}) {
  return (
    <>
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Poppins_500Medium",
          color: colors.text,
          marginBottom: 12,
        }}
      >
        Business Card Photo
      </Text>
      <View
        style={{
          height: 180,
          backgroundColor: businessCardImage
            ? colors.background
            : colors.fieldFill,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.outline,
          marginBottom: isScanningCard ? 8 : 24,
          overflow: "hidden",
        }}
      >
        {businessCardImage ? (
          <View style={{ width: "100%", height: "100%" }}>
            <Image
              source={{ uri: businessCardImage.uri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
            {isScanningCard && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0, 0, 0, 0.45)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    backgroundColor: colors.background,
                    borderRadius: 16,
                    paddingHorizontal: 24,
                    paddingVertical: 16,
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <FileText size={24} color={colors.primary} />
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.text,
                    }}
                  >
                    Reading card...
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Camera size={40} color={colors.textSecondary} />
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Poppins_400Regular",
                color: colors.textSecondary,
                marginTop: 12,
              }}
            >
              No photo selected
            </Text>
          </View>
        )}
      </View>

      {isScanningCard && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
            gap: 8,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: colors.primary + "15",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Poppins_500Medium",
                color: colors.primary,
              }}
            >
              Scanning business card & auto-filling fields...
            </Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 12, marginBottom: 32 }}>
        <TouchableOpacity
          style={{
            flex: 1,
            height: 48,
            backgroundColor: colors.cardBackground,
            borderWidth: 1,
            borderColor: colors.outline,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          onPress={onTakePhoto}
          disabled={uploadLoading}
        >
          <Camera size={20} color={colors.text} />
          <Text
            style={{
              fontSize: 15,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
            }}
          >
            Take Photo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            height: 48,
            backgroundColor: colors.cardBackground,
            borderWidth: 1,
            borderColor: colors.outline,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          onPress={onPickImage}
          disabled={uploadLoading}
        >
          <Upload size={20} color={colors.text} />
          <Text
            style={{
              fontSize: 15,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
            }}
          >
            Upload
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

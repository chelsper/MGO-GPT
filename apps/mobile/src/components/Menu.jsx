import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { Home, LogOut, X, FileText, BookOpen } from "lucide-react-native";
import { useColors } from "./useColors";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuth } from "@/utils/auth/useAuth";

export default function Menu({ visible, onClose }) {
  const colors = useColors();
  const router = useRouter();
  const { signOut } = useAuth();

  const handleHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push("/(tabs)");
  };

  const handleMySubmissions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push("/(tabs)/submissions");
  };

  const handleKnowledgeBase = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push("/(tabs)/knowledge");
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    await signOut();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "flex-end",
        }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 20,
            paddingBottom: 40,
            paddingHorizontal: 20,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontFamily: "Poppins_600SemiBold",
                color: colors.text,
              }}
            >
              Menu
            </Text>
            <TouchableOpacity
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.fieldFill,
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={onClose}
            >
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Menu Items */}
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.cardBackground,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 16,
                padding: 16,
                gap: 16,
              }}
              onPress={handleHome}
              activeOpacity={0.7}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: colors.primaryUltraLight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Home size={24} color={colors.primary} />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Go to Home
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.cardBackground,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 16,
                padding: 16,
                gap: 16,
              }}
              onPress={handleMySubmissions}
              activeOpacity={0.7}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: colors.primaryUltraLight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FileText size={24} color={colors.primary} />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                My Submissions
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.cardBackground,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 16,
                padding: 16,
                gap: 16,
              }}
              onPress={handleKnowledgeBase}
              activeOpacity={0.7}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: colors.primaryUltraLight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BookOpen size={24} color={colors.primary} />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Knowledge Base
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.error + "15",
                borderWidth: 1,
                borderColor: colors.error + "30",
                borderRadius: 16,
                padding: 16,
                gap: 16,
              }}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: colors.error + "25",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LogOut size={24} color={colors.error} />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.error,
                }}
              >
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

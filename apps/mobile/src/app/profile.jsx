import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { ArrowLeft, User, Mail, Briefcase, LogOut } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/components/useColors";
import { StatusBar } from "expo-status-bar";
import useUser from "@/utils/auth/useUser";
import { useAuth } from "@/utils/auth/useAuth";
import { useQuery } from "@tanstack/react-query";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { data: user, loading } = useUser();
  const { signOut } = useAuth();

  const { data: profileData } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const response = await fetch("/api/users/profile");
      if (!response.ok) {
        throw new Error("Failed to fetch profile");
      }
      return response.json();
    },
  });

  const userRole = profileData?.user?.role || "mgo";
  const userName = profileData?.user?.name || user?.name || "User";
  const userEmail = profileData?.user?.email || user?.email || "No email";

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await signOut();
        },
      },
    ]);
  };

  if (!fontsLoaded || loading) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
            Profile
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View
          style={{
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: colors.primaryUltraLight,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <User size={48} color={colors.primary} />
          </View>
          <Text
            style={{
              fontSize: 24,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
              marginBottom: 4,
            }}
          >
            {userName}
          </Text>
          <Text
            style={{
              fontSize: 15,
              fontFamily: "Poppins_400Regular",
              color: colors.textSecondary,
            }}
          >
            {userRole === "reviewer" ? "REVIEWER" : "MGO"}
          </Text>
        </View>

        {/* Info Cards */}
        <View
          style={{
            backgroundColor: colors.cardBackground,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.outline,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: colors.primaryUltraLight,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Mail size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Poppins_500Medium",
                  color: colors.textSecondary,
                  marginBottom: 2,
                }}
              >
                Email
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  color: colors.text,
                }}
              >
                {userEmail}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: colors.outline,
              marginBottom: 16,
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: colors.primaryUltraLight,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Briefcase size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Poppins_500Medium",
                  color: colors.textSecondary,
                  marginBottom: 2,
                }}
              >
                Role
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  color: colors.text,
                }}
              >
                {userRole === "mgo"
                  ? "Major Gift Officer"
                  : "Advancement Services Reviewer"}
              </Text>
            </View>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={{
            height: 56,
            backgroundColor: colors.error + "15",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.error + "30",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <LogOut size={20} color={colors.error} />
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
      </ScrollView>
    </View>
  );
}

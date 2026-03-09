import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import {
  Mic,
  TrendingUp,
  UserPlus,
  Clock,
  List,
  CheckSquare,
  Target,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/components/useColors";
import Header from "@/components/Header";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

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
  const userName = profileData?.user?.name || "User";

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: async () => {
      const response = await fetch("/api/submissions/my-submissions");
      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }
      return response.json();
    },
    enabled: userRole === "mgo",
  });

  const { data: allSubmissions = [] } = useQuery({
    queryKey: ["all-submissions"],
    queryFn: async () => {
      const response = await fetch("/api/submissions/all");
      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }
      return response.json();
    },
    enabled: userRole === "reviewer",
  });

  const submissions = userRole === "reviewer" ? allSubmissions : mySubmissions;
  const pendingCount = submissions.filter((s) => s.status === "Pending").length;

  const handleCardPress = (route) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route);
  };

  if (!fontsLoaded) {
    return null;
  }

  const mgoCards = [
    {
      id: "top-prospects",
      title: "My Top Prospects",
      description: "Track your deal pipeline",
      icon: Target,
      route: "/my-top-prospects",
      color: colors.primary,
      bgColor: colors.primaryUltraLight,
    },
    {
      id: "donor-update",
      title: "Log Donor Update",
      description: "Record a donor interaction",
      icon: Mic,
      route: "/log-donor-update",
      color: colors.primary,
      bgColor: colors.primaryUltraLight,
    },
    {
      id: "opportunity",
      title: "Update Opportunity",
      description: "Update pipeline stage",
      icon: TrendingUp,
      route: "/update-opportunity",
      color: colors.success,
      bgColor: "#D1FAE5",
    },
    {
      id: "constituent",
      title: "Suggest New Constituent",
      description: "Add a new contact",
      icon: UserPlus,
      route: "/new-constituent",
      color: colors.warning,
      bgColor: "#FEF3C7",
    },
    {
      id: "request-list",
      title: "Request List from DevData",
      description: "Request a custom data list",
      icon: List,
      route: "/request-list",
      color: "#8B5CF6",
      bgColor: "#EDE9FE",
    },
  ];

  const reviewerCards = [
    {
      id: "review",
      title: "Review Submissions",
      description: "Approve or reject pending submissions",
      icon: CheckSquare,
      route: "/(tabs)/review",
      color: colors.primary,
      bgColor: colors.primaryUltraLight,
    },
  ];

  const actionCards = userRole === "reviewer" ? reviewerCards : mgoCards;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <Header title="MGO-GPT" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: insets.bottom + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <Text
          style={{
            fontSize: 22,
            fontFamily: "Poppins_600SemiBold",
            color: colors.text,
            marginBottom: 4,
          }}
        >
          Welcome, {userName.split(" ")[0]}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Poppins_400Regular",
            color: colors.textSecondary,
            marginBottom: 20,
          }}
        >
          {userRole === "reviewer"
            ? "Advancement Services Reviewer"
            : "Major Gift Officer"}
        </Text>

        {/* Quick Stats */}
        <View
          style={{
            backgroundColor: colors.cardBackground,
            borderWidth: 1,
            borderColor: colors.outline,
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Clock size={20} color={colors.textSecondary} />
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Poppins_500Medium",
                color: colors.textSecondary,
                marginLeft: 8,
              }}
            >
              {userRole === "reviewer"
                ? "Submissions to Review"
                : "Pending Submissions"}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 32,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
            }}
          >
            {pendingCount}
          </Text>
        </View>

        {/* Action Cards */}
        <Text
          style={{
            fontSize: 18,
            fontFamily: "Poppins_600SemiBold",
            color: colors.text,
            marginBottom: 16,
          }}
        >
          Quick Actions
        </Text>

        <View style={{ gap: 16 }}>
          {actionCards.map((card) => (
            <TouchableOpacity
              key={card.id}
              style={{
                backgroundColor: colors.cardBackground,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 16,
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
              }}
              onPress={() => handleCardPress(card.route)}
              activeOpacity={0.7}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  backgroundColor: card.bgColor,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 16,
                }}
              >
                <card.icon size={28} color={card.color} />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Poppins_600SemiBold",
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  {card.title}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Poppins_400Regular",
                    color: colors.textSecondary,
                  }}
                >
                  {card.description}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

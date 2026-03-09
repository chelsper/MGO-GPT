import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Share,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  User,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import { useColors } from "@/components/useColors";
import Header from "@/components/Header";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";

export default function MySubmissionsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const [isExporting, setIsExporting] = useState(false);

  const {
    data: submissions = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: async () => {
      const response = await fetch("/api/submissions/my-submissions");
      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }
      return response.json();
    },
  });

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const response = await fetch("/api/submissions/export-my-csv");

      if (!response.ok) {
        throw new Error("Failed to export CSV");
      }

      const csvContent = await response.text();
      const filename = `my-submissions-${new Date().toISOString().split("T")[0]}.csv`;
      const fileUri = FileSystem.documentDirectory + filename;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (Platform.OS === "ios" || Platform.OS === "android") {
        await Share.share({
          url: fileUri,
          message: `My submissions export: ${filename}`,
        });
      } else {
        Alert.alert("Success", `CSV exported to ${fileUri}`);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Error", "Failed to export CSV. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "Approved":
        return <CheckCircle size={20} color={colors.success} />;
      case "Needs Clarification":
        return <AlertCircle size={20} color={colors.warning} />;
      case "Ready for CRM":
        return <CheckCircle size={20} color={colors.primary} />;
      default:
        return <Clock size={20} color={colors.textSecondary} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Approved":
        return colors.success;
      case "Needs Clarification":
        return colors.warning;
      case "Ready for CRM":
        return colors.primary;
      default:
        return colors.textSecondary;
    }
  };

  const getSubmissionTypeLabel = (type) => {
    switch (type) {
      case "donor_update":
        return "Donor Update";
      case "opportunity_update":
        return "Opportunity Update";
      case "constituent_suggestion":
        return "Constituent Suggestion";
      default:
        return type;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (!fontsLoaded) {
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
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
            }}
          >
            My Submissions
          </Text>
          <TouchableOpacity
            style={{
              height: 40,
              paddingHorizontal: 16,
              backgroundColor: colors.cardBackground,
              borderWidth: 1,
              borderColor: colors.outline,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            onPress={handleExportCSV}
            disabled={isExporting}
            activeOpacity={0.8}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Download size={18} color={colors.primary} />
            )}
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Poppins_500Medium",
                color: colors.primary,
              }}
            >
              {isExporting ? "Exporting..." : "Export"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: insets.bottom + 80,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <View style={{ paddingTop: 60, alignItems: "center" }}>
            <Text
              style={{
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.textSecondary,
              }}
            >
              Loading submissions...
            </Text>
          </View>
        ) : submissions.length === 0 ? (
          <View
            style={{
              paddingTop: 60,
              alignItems: "center",
              paddingHorizontal: 40,
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.accentLilac,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <FileText size={36} color={colors.primary} />
            </View>
            <Text
              style={{
                fontSize: 18,
                fontFamily: "Poppins_600SemiBold",
                color: colors.text,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              No Submissions Yet
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.textSecondary,
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              Your submitted updates will appear here
            </Text>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {submissions.map((submission) => (
              <View
                key={submission.id}
                style={{
                  backgroundColor: colors.cardBackground,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {submission.donor_name || submission.constituent_name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        color: colors.textSecondary,
                      }}
                    >
                      {getSubmissionTypeLabel(submission.submission_type)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {getStatusIcon(submission.status)}
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_500Medium",
                        color: getStatusColor(submission.status),
                      }}
                    >
                      {submission.status}
                    </Text>
                  </View>
                </View>

                {submission.transcript && (
                  <View
                    style={{
                      backgroundColor: colors.fieldFill,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        color: colors.text,
                        lineHeight: 18,
                      }}
                      numberOfLines={2}
                    >
                      {submission.transcript}
                    </Text>
                  </View>
                )}

                {/* Review Information */}
                {submission.reviewed_at && submission.reviewer_name && (
                  <View
                    style={{
                      backgroundColor: colors.accentLilac,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <User size={16} color={colors.primary} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Poppins_400Regular",
                        color: colors.text,
                        flex: 1,
                      }}
                    >
                      Reviewed by {submission.reviewer_name} on{" "}
                      {formatDateTime(submission.reviewed_at)}
                    </Text>
                  </View>
                )}

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: "Poppins_400Regular",
                      color: colors.textSecondary,
                    }}
                  >
                    Submitted {formatDate(submission.date_submitted)}
                  </Text>

                  {submission.estimated_ask_amount ||
                  submission.estimated_amount ? (
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                      }}
                    >
                      $
                      {(
                        submission.estimated_ask_amount ||
                        submission.estimated_amount
                      ).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

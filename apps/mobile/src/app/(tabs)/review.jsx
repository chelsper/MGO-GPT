import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { CheckSquare, X, Check, Edit3, Download } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import { useColors } from "@/components/useColors";
import Header from "@/components/Header";
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function ReviewDashboardScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();

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
    queryKey: ["all-submissions"],
    queryFn: async () => {
      const response = await fetch("/api/submissions/all");
      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }
      return response.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const response = await fetch("/api/submissions/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) {
        throw new Error("Failed to update status");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-submissions"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => {
      Alert.alert("Error", "Failed to update submission status");
    },
  });

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const response = await fetch("/api/submissions/export-csv");

      if (!response.ok) {
        throw new Error("Failed to export CSV");
      }

      const csvContent = await response.text();
      const filename = `submissions-${new Date().toISOString().split("T")[0]}.csv`;
      const fileUri = FileSystem.documentDirectory + filename;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (Platform.OS === "ios" || Platform.OS === "android") {
        await Share.share({
          url: fileUri,
          message: `Submissions export: ${filename}`,
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

  const handleApprove = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateStatusMutation.mutate({ id, status: "Approved" });
  };

  const handleReject = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Reject Submission",
      "Are you sure you want to reject this submission?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: () =>
            updateStatusMutation.mutate({ id, status: "Needs Clarification" }),
        },
      ],
    );
  };

  const handleMarkReady = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateStatusMutation.mutate({ id, status: "Ready for CRM" });
  };

  const getSubmissionTypeLabel = (type) => {
    switch (type) {
      case "donor_update":
        return "Action";
      case "opportunity_update":
        return "Opportunity";
      case "constituent_suggestion":
        return "Constituent";
      default:
        return type;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
            Review Dashboard
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
              <CheckSquare size={36} color={colors.primary} />
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
              No Submissions to Review
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
              All submissions have been processed
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
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Poppins_400Regular",
                        color: colors.textSecondary,
                        marginBottom: 4,
                      }}
                    >
                      {submission.officer_name} •{" "}
                      {formatDate(submission.date_submitted)}
                    </Text>
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
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 12,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: colors.primaryUltraLight,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.primary,
                      }}
                    >
                      {getSubmissionTypeLabel(submission.submission_type)}
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
                        fontSize: 10,
                        fontFamily: "Poppins_500Medium",
                        color: colors.textSecondary,
                        marginBottom: 4,
                        textTransform: "uppercase",
                      }}
                    >
                      Transcript
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        color: colors.text,
                        lineHeight: 18,
                      }}
                    >
                      {submission.transcript}
                    </Text>
                  </View>
                )}

                {submission.notes && (
                  <View style={{ marginBottom: 12 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: "Poppins_500Medium",
                        color: colors.textSecondary,
                        marginBottom: 4,
                        textTransform: "uppercase",
                      }}
                    >
                      Notes
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        color: colors.text,
                        lineHeight: 18,
                      }}
                    >
                      {submission.notes}
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  {submission.status === "Pending" && (
                    <>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          height: 44,
                          backgroundColor: colors.success,
                          borderRadius: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                        onPress={() => handleApprove(submission.id)}
                        disabled={updateStatusMutation.isPending}
                      >
                        <Check size={18} color={colors.background} />
                        <Text
                          style={{
                            fontSize: 14,
                            fontFamily: "Poppins_600SemiBold",
                            color: colors.background,
                          }}
                        >
                          Approve
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          height: 44,
                          backgroundColor: colors.cardBackground,
                          borderWidth: 1,
                          borderColor: colors.outline,
                          borderRadius: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                        onPress={() => handleReject(submission.id)}
                        disabled={updateStatusMutation.isPending}
                      >
                        <X size={18} color={colors.error} />
                        <Text
                          style={{
                            fontSize: 14,
                            fontFamily: "Poppins_600SemiBold",
                            color: colors.error,
                          }}
                        >
                          Reject
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {submission.status === "Approved" && (
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        height: 44,
                        backgroundColor: colors.primary,
                        borderRadius: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                      onPress={() => handleMarkReady(submission.id)}
                      disabled={updateStatusMutation.isPending}
                    >
                      <Edit3 size={18} color={colors.background} />
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.background,
                        }}
                      >
                        Mark Ready for CRM
                      </Text>
                    </TouchableOpacity>
                  )}

                  {submission.status === "Ready for CRM" && (
                    <View
                      style={{
                        flex: 1,
                        height: 44,
                        backgroundColor: colors.accentLilac,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.primary,
                        }}
                      >
                        Ready for CRM Entry
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

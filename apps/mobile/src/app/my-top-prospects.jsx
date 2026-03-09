import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import {
  ArrowLeft,
  Plus,
  ChevronUp,
  ChevronDown,
  Target,
  DollarSign,
  Trophy,
  X,
  Pencil,
  MessageSquarePlus,
  CheckCircle,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/components/useColors";
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const ASK_TYPES = [
  "Major Gift",
  "Endowed Scholarship",
  "Capital Project",
  "Program Support",
  "Annual Leadership Gift",
  "Planned Gift",
  "Other",
];

const FY_OPTIONS = ["FY25", "FY26", "FY27", "FY28", "FY29", "FY30"];

function formatCurrency(amount) {
  if (!amount) return "$0";
  return "$" + Number(amount).toLocaleString();
}

function StatusBadge({ status, colors }) {
  const colorMap = {
    Active: { bg: "#D1FAE5", text: "#065F46" },
    "Closed – Gift Secured": { bg: "#DBEAFE", text: "#1E40AF" },
    "Closed – Declined": { bg: "#FEE2E2", text: "#991B1B" },
  };
  const c = colorMap[status] || { bg: "#F3F4F6", text: "#374151" };
  return (
    <View
      style={{
        backgroundColor: c.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Poppins_600SemiBold",
          color: c.text,
        }}
      >
        {status}
      </Text>
    </View>
  );
}

function PickerSelect({ value, options, onChange, colors }) {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <View>
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        style={{
          backgroundColor: colors.fieldFill,
          borderRadius: 12,
          padding: 14,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontFamily: "Poppins_400Regular",
            color: colors.text,
          }}
        >
          {value}
        </Text>
        <ChevronDown size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      <Modal visible={showPicker} transparent animationType="slide">
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
          }}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <View
            style={{
              backgroundColor: colors.cardBackground,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: 400,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.outline,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Select
              </Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => {
                    onChange(opt);
                    setShowPicker(false);
                  }}
                  style={{
                    padding: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.outline,
                    backgroundColor:
                      value === opt ? colors.primaryUltraLight : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily:
                        value === opt
                          ? "Poppins_600SemiBold"
                          : "Poppins_400Regular",
                      color: value === opt ? colors.primary : colors.text,
                    }}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function MyTopProspectsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Add form
  const [newName, setNewName] = useState("");
  const [newFY, setNewFY] = useState("FY26");
  const [newAmount, setNewAmount] = useState("");
  const [newAskType, setNewAskType] = useState("Major Gift");

  // Close form
  const [closeOutcome, setCloseOutcome] = useState("secured");
  const [closedAmount, setClosedAmount] = useState("");
  const [closeDate, setCloseDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [declineReason, setDeclineReason] = useState("");

  // Update form
  const [updateNotes, setUpdateNotes] = useState("");

  // Edit form
  const [editData, setEditData] = useState({});

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ["prospects"],
    queryFn: async () => {
      const res = await fetch("/api/prospects");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["prospect-summary"],
    queryFn: async () => {
      const res = await fetch("/api/prospects/summary");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: detailData } = useQuery({
    queryKey: ["prospect", selectedProspect?.id],
    queryFn: async () => {
      const res = await fetch(`/api/prospects/${selectedProspect.id}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedProspect?.id,
  });

  const addMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      setShowAddModal(false);
      setNewName("");
      setNewAmount("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => Alert.alert("Error", "Failed to add prospect"),
  });

  const reorderMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch("/api/prospects/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/prospects/${selectedProspect.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      queryClient.invalidateQueries({
        queryKey: ["prospect", selectedProspect?.id],
      });
      setShowCloseModal(false);
      setSelectedProspect(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => Alert.alert("Error", "Failed to close prospect"),
  });

  const editMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/prospects/${selectedProspect.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      queryClient.invalidateQueries({
        queryKey: ["prospect", selectedProspect?.id],
      });
      setEditMode(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => Alert.alert("Error", "Failed to update prospect"),
  });

  const addUpdateMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/prospects/${selectedProspect.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["prospect", selectedProspect?.id],
      });
      setShowUpdateForm(false);
      setUpdateNotes("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => Alert.alert("Error", "Failed to add update"),
  });

  if (!fontsLoaded) return null;

  const activeProspects = prospects.filter((p) => p.status === "Active");
  const closedSecured = prospects.filter(
    (p) => p.status === "Closed – Gift Secured",
  );
  const closedDeclined = prospects.filter(
    (p) => p.status === "Closed – Declined",
  );

  const updates = detailData?.updates || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: colors.cardBackground,
          borderBottomWidth: 1,
          borderBottomColor: colors.outline,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: colors.fieldFill,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 17,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
            }}
          >
            My Top Prospects
          </Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Plus size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Cards */}
        {summary && (
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.cardBackground,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.outline,
                padding: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <Target size={14} color={colors.primary} />
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: "Poppins_500Medium",
                    color: colors.textSecondary,
                  }}
                >
                  Active
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontFamily: "Poppins_700Bold",
                  color: colors.text,
                }}
              >
                {summary.activeCount}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.cardBackground,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.outline,
                padding: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <DollarSign size={14} color="#059669" />
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: "Poppins_500Medium",
                    color: colors.textSecondary,
                  }}
                >
                  Pipeline
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: "Poppins_700Bold",
                  color: colors.text,
                }}
                numberOfLines={1}
              >
                {formatCurrency(summary.totalAskPipeline)}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.cardBackground,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.outline,
                padding: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <Trophy size={14} color="#F59E0B" />
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: "Poppins_500Medium",
                    color: colors.textSecondary,
                  }}
                >
                  Closed
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: "Poppins_700Bold",
                  color: colors.text,
                }}
                numberOfLines={1}
              >
                {formatCurrency(summary.closedThisFY)}
              </Text>
            </View>
          </View>
        )}

        {/* Active Prospects */}
        <Text
          style={{
            fontSize: 16,
            fontFamily: "Poppins_600SemiBold",
            color: colors.text,
            marginBottom: 12,
          }}
        >
          Active Prospects ({activeProspects.length})
        </Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : activeProspects.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              padding: 40,
              backgroundColor: colors.cardBackground,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.outline,
              marginBottom: 20,
            }}
          >
            <Target size={36} color={colors.outline} />
            <Text
              style={{
                fontSize: 15,
                fontFamily: "Poppins_500Medium",
                color: colors.textSecondary,
                marginTop: 12,
              }}
            >
              No prospects yet
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Poppins_400Regular",
                color: colors.textPlaceholder,
                marginTop: 4,
                textAlign: "center",
              }}
            >
              Tap + to start building your pipeline
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8, marginBottom: 24 }}>
            {activeProspects.map((p, idx) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  setSelectedProspect(p);
                  setEditMode(false);
                  setShowUpdateForm(false);
                }}
                activeOpacity={0.7}
                style={{
                  backgroundColor: colors.cardBackground,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontFamily: "Poppins_700Bold",
                    color: colors.primary,
                    width: 28,
                    textAlign: "center",
                  }}
                >
                  {idx + 1}
                </Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                      }}
                    >
                      {p.prospect_name}
                    </Text>
                    <StatusBadge status={p.status} colors={colors} />
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins_400Regular",
                      color: colors.textSecondary,
                    }}
                  >
                    {p.expected_close_fy} · {formatCurrency(p.ask_amount)} ·{" "}
                    {p.ask_type}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      reorderMutation.mutate({
                        prospectId: p.id,
                        direction: "up",
                      });
                    }}
                    disabled={idx === 0}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: colors.fieldFill,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: idx === 0 ? 0.3 : 1,
                    }}
                  >
                    <ChevronUp size={14} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      reorderMutation.mutate({
                        prospectId: p.id,
                        direction: "down",
                      });
                    }}
                    disabled={idx === activeProspects.length - 1}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: colors.fieldFill,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: idx === activeProspects.length - 1 ? 0.3 : 1,
                    }}
                  >
                    <ChevronDown size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Closed Prospects */}
        {(closedSecured.length > 0 || closedDeclined.length > 0) && (
          <View>
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Poppins_600SemiBold",
                color: colors.text,
                marginBottom: 12,
              }}
            >
              Closed Prospects
            </Text>

            {closedSecured.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Poppins_600SemiBold",
                    color: "#059669",
                    marginBottom: 8,
                  }}
                >
                  Gift Secured ({closedSecured.length})
                </Text>
                {closedSecured.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      setSelectedProspect(p);
                      setEditMode(false);
                      setShowUpdateForm(false);
                    }}
                    activeOpacity={0.7}
                    style={{
                      backgroundColor: colors.cardBackground,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.outline,
                      borderLeftWidth: 4,
                      borderLeftColor: "#059669",
                      padding: 16,
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {p.prospect_name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        color: colors.textSecondary,
                      }}
                    >
                      {p.expected_close_fy} · {formatCurrency(p.closed_amount)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {closedDeclined.length > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Poppins_600SemiBold",
                    color: "#DC2626",
                    marginBottom: 8,
                  }}
                >
                  Declined ({closedDeclined.length})
                </Text>
                {closedDeclined.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      setSelectedProspect(p);
                      setEditMode(false);
                      setShowUpdateForm(false);
                    }}
                    activeOpacity={0.7}
                    style={{
                      backgroundColor: colors.cardBackground,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.outline,
                      borderLeftWidth: 4,
                      borderLeftColor: "#DC2626",
                      padding: 16,
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {p.prospect_name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        color: colors.textSecondary,
                      }}
                    >
                      {p.expected_close_fy} · {p.ask_type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ===== ADD PROSPECT MODAL ===== */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
          }}
          activeOpacity={1}
          onPress={() => setShowAddModal(false)}
        >
          <View
            style={{
              backgroundColor: colors.cardBackground,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: insets.bottom + 16,
            }}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: colors.outline,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Add Prospect
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ paddingHorizontal: 20, paddingTop: 16, maxHeight: 500 }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.textSecondary,
                  marginBottom: 6,
                }}
              >
                Prospect Name *
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Enter prospect name"
                placeholderTextColor={colors.textPlaceholder}
                style={{
                  backgroundColor: colors.fieldFill,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  color: colors.text,
                  marginBottom: 16,
                }}
              />

              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.textSecondary,
                  marginBottom: 6,
                }}
              >
                Expected Close FY
              </Text>
              <PickerSelect
                value={newFY}
                options={FY_OPTIONS}
                onChange={setNewFY}
                colors={colors}
              />

              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.textSecondary,
                  marginBottom: 6,
                  marginTop: 16,
                }}
              >
                Ask Amount
              </Text>
              <TextInput
                value={newAmount}
                onChangeText={setNewAmount}
                placeholder="$0.00"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="decimal-pad"
                style={{
                  backgroundColor: colors.fieldFill,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  color: colors.text,
                  marginBottom: 16,
                }}
              />

              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.textSecondary,
                  marginBottom: 6,
                }}
              >
                Ask Type
              </Text>
              <PickerSelect
                value={newAskType}
                options={ASK_TYPES}
                onChange={setNewAskType}
                colors={colors}
              />

              <TouchableOpacity
                onPress={() => {
                  if (!newName.trim()) {
                    Alert.alert("Required", "Prospect name is required");
                    return;
                  }
                  addMutation.mutate({
                    prospectName: newName.trim(),
                    expectedCloseFY: newFY,
                    askAmount: newAmount ? parseFloat(newAmount) : null,
                    askType: newAskType,
                  });
                }}
                disabled={addMutation.isPending}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
                  marginTop: 20,
                  marginBottom: 16,
                  opacity: addMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Poppins_600SemiBold",
                    color: "#FFFFFF",
                  }}
                >
                  {addMutation.isPending ? "Adding..." : "Add Prospect"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== PROSPECT DETAIL MODAL ===== */}
      <Modal
        visible={!!selectedProspect && !showCloseModal}
        animationType="slide"
        transparent
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
          }}
          activeOpacity={1}
          onPress={() => setSelectedProspect(null)}
        >
          <View
            style={{
              backgroundColor: colors.cardBackground,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "85%",
              paddingBottom: insets.bottom + 16,
            }}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: colors.outline,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {selectedProspect?.prospect_name}
              </Text>
              <TouchableOpacity onPress={() => setSelectedProspect(null)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              {/* Details Grid */}
              {!editMode && (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 16,
                    marginBottom: 20,
                  }}
                >
                  <View style={{ width: "45%" }}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Close FY
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                      }}
                    >
                      {selectedProspect?.expected_close_fy}
                    </Text>
                  </View>
                  <View style={{ width: "45%" }}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Ask Amount
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                      }}
                    >
                      {formatCurrency(selectedProspect?.ask_amount)}
                    </Text>
                  </View>
                  <View style={{ width: "45%" }}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Ask Type
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                      }}
                    >
                      {selectedProspect?.ask_type}
                    </Text>
                  </View>
                  <View style={{ width: "45%" }}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Status
                    </Text>
                    <StatusBadge
                      status={selectedProspect?.status}
                      colors={colors}
                    />
                  </View>
                  {selectedProspect?.closed_amount != null && (
                    <View style={{ width: "45%" }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.textSecondary,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        Closed Amount
                      </Text>
                      <Text
                        style={{
                          fontSize: 15,
                          fontFamily: "Poppins_600SemiBold",
                          color: "#059669",
                        }}
                      >
                        {formatCurrency(selectedProspect?.closed_amount)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Edit Mode */}
              {editMode && (
                <View style={{ marginBottom: 20 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.textSecondary,
                      marginBottom: 6,
                    }}
                  >
                    Prospect Name
                  </Text>
                  <TextInput
                    defaultValue={selectedProspect?.prospect_name}
                    onChangeText={(v) =>
                      setEditData((p) => ({ ...p, prospectName: v }))
                    }
                    style={{
                      backgroundColor: colors.fieldFill,
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      fontFamily: "Poppins_400Regular",
                      color: colors.text,
                      marginBottom: 12,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.textSecondary,
                      marginBottom: 6,
                    }}
                  >
                    Close FY
                  </Text>
                  <PickerSelect
                    value={
                      editData.expectedCloseFY ||
                      selectedProspect?.expected_close_fy
                    }
                    options={FY_OPTIONS}
                    onChange={(v) =>
                      setEditData((p) => ({ ...p, expectedCloseFY: v }))
                    }
                    colors={colors}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.textSecondary,
                      marginBottom: 6,
                      marginTop: 12,
                    }}
                  >
                    Ask Amount
                  </Text>
                  <TextInput
                    defaultValue={
                      selectedProspect?.ask_amount?.toString() || ""
                    }
                    onChangeText={(v) =>
                      setEditData((p) => ({
                        ...p,
                        askAmount: v ? parseFloat(v) : null,
                      }))
                    }
                    keyboardType="decimal-pad"
                    style={{
                      backgroundColor: colors.fieldFill,
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      fontFamily: "Poppins_400Regular",
                      color: colors.text,
                      marginBottom: 12,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.textSecondary,
                      marginBottom: 6,
                    }}
                  >
                    Ask Type
                  </Text>
                  <PickerSelect
                    value={editData.askType || selectedProspect?.ask_type}
                    options={ASK_TYPES}
                    onChange={(v) => setEditData((p) => ({ ...p, askType: v }))}
                    colors={colors}
                  />

                  <View
                    style={{ flexDirection: "row", gap: 10, marginTop: 16 }}
                  >
                    <TouchableOpacity
                      onPress={() => editMutation.mutate(editData)}
                      disabled={editMutation.isPending}
                      style={{
                        flex: 1,
                        backgroundColor: colors.primary,
                        borderRadius: 12,
                        padding: 14,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: "Poppins_600SemiBold",
                          color: "#FFFFFF",
                        }}
                      >
                        {editMutation.isPending ? "Saving..." : "Save"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setEditMode(false);
                        setEditData({});
                      }}
                      style={{
                        padding: 14,
                        backgroundColor: colors.fieldFill,
                        borderRadius: 12,
                        paddingHorizontal: 20,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.text,
                        }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              {!editMode && (
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginBottom: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setEditMode(true);
                      setEditData({});
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: colors.fieldFill,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Pencil size={14} color={colors.text} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                      }}
                    >
                      Edit
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowUpdateForm(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: colors.primaryUltraLight,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <MessageSquarePlus size={14} color={colors.primary} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.primary,
                      }}
                    >
                      Update
                    </Text>
                  </TouchableOpacity>
                  {selectedProspect?.status === "Active" && (
                    <TouchableOpacity
                      onPress={() => {
                        setClosedAmount(
                          selectedProspect?.ask_amount?.toString() || "",
                        );
                        setCloseDate(new Date().toISOString().split("T")[0]);
                        setDeclineReason("");
                        setCloseOutcome("secured");
                        setShowCloseModal(true);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        backgroundColor: "#FEF3C7",
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <CheckCircle size={14} color="#92400E" />
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: "Poppins_600SemiBold",
                          color: "#92400E",
                        }}
                      >
                        Close
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Add Update Form */}
              {showUpdateForm && (
                <View
                  style={{
                    backgroundColor: colors.fieldFill,
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.text,
                      marginBottom: 10,
                    }}
                  >
                    New Progress Update
                  </Text>
                  <TextInput
                    value={updateNotes}
                    onChangeText={setUpdateNotes}
                    placeholder="e.g. Meeting completed, proposal delivered..."
                    placeholderTextColor={colors.textPlaceholder}
                    multiline
                    style={{
                      backgroundColor: colors.cardBackground,
                      borderRadius: 10,
                      padding: 14,
                      fontSize: 14,
                      fontFamily: "Poppins_400Regular",
                      color: colors.text,
                      minHeight: 80,
                      textAlignVertical: "top",
                      marginBottom: 12,
                    }}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() =>
                        addUpdateMutation.mutate({
                          updateNotes,
                          updateDate: new Date().toISOString().split("T")[0],
                        })
                      }
                      disabled={
                        addUpdateMutation.isPending || !updateNotes.trim()
                      }
                      style={{
                        flex: 1,
                        backgroundColor: colors.primary,
                        borderRadius: 10,
                        padding: 12,
                        alignItems: "center",
                        opacity: !updateNotes.trim() ? 0.5 : 1,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: "Poppins_600SemiBold",
                          color: "#FFFFFF",
                        }}
                      >
                        {addUpdateMutation.isPending ? "Saving..." : "Save"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowUpdateForm(false)}
                      style={{
                        padding: 12,
                        backgroundColor: colors.cardBackground,
                        borderRadius: 10,
                        paddingHorizontal: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.text,
                        }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Progress Log */}
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                  marginBottom: 10,
                }}
              >
                Progress Log
              </Text>
              {updates.length === 0 ? (
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Poppins_400Regular",
                    color: colors.textPlaceholder,
                    fontStyle: "italic",
                    marginBottom: 20,
                  }}
                >
                  No progress updates yet.
                </Text>
              ) : (
                <View style={{ gap: 8, marginBottom: 20 }}>
                  {updates.map((u) => (
                    <View
                      key={u.id}
                      style={{
                        padding: 12,
                        backgroundColor: colors.fieldFill,
                        borderRadius: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.primary,
                          marginBottom: 4,
                        }}
                      >
                        {new Date(u.update_date).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: "Poppins_400Regular",
                          color: colors.text,
                          lineHeight: 20,
                        }}
                      >
                        {u.update_notes}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== CLOSE PROSPECT MODAL ===== */}
      <Modal visible={showCloseModal} animationType="slide" transparent>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
          }}
          activeOpacity={1}
          onPress={() => setShowCloseModal(false)}
        >
          <View
            style={{
              backgroundColor: colors.cardBackground,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: insets.bottom + 16,
            }}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: colors.outline,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Close Prospect
              </Text>
              <TouchableOpacity onPress={() => setShowCloseModal(false)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Poppins_400Regular",
                  color: colors.textSecondary,
                  marginBottom: 16,
                }}
              >
                Closing:{" "}
                <Text
                  style={{
                    fontFamily: "Poppins_600SemiBold",
                    color: colors.text,
                  }}
                >
                  {selectedProspect?.prospect_name}
                </Text>
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                <TouchableOpacity
                  onPress={() => setCloseOutcome("secured")}
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor:
                      closeOutcome === "secured" ? "#059669" : colors.outline,
                    backgroundColor:
                      closeOutcome === "secured" ? "#D1FAE5" : "transparent",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Poppins_600SemiBold",
                      color:
                        closeOutcome === "secured"
                          ? "#059669"
                          : colors.textSecondary,
                    }}
                  >
                    Gift Secured
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setCloseOutcome("declined")}
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor:
                      closeOutcome === "declined" ? "#DC2626" : colors.outline,
                    backgroundColor:
                      closeOutcome === "declined" ? "#FEE2E2" : "transparent",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Poppins_600SemiBold",
                      color:
                        closeOutcome === "declined"
                          ? "#DC2626"
                          : colors.textSecondary,
                    }}
                  >
                    Declined
                  </Text>
                </TouchableOpacity>
              </View>

              {closeOutcome === "secured" && (
                <>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.textSecondary,
                      marginBottom: 6,
                    }}
                  >
                    Closed Amount
                  </Text>
                  <TextInput
                    value={closedAmount}
                    onChangeText={setClosedAmount}
                    placeholder="$0.00"
                    placeholderTextColor={colors.textPlaceholder}
                    keyboardType="decimal-pad"
                    style={{
                      backgroundColor: colors.fieldFill,
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      fontFamily: "Poppins_400Regular",
                      color: colors.text,
                      marginBottom: 16,
                    }}
                  />
                </>
              )}

              {closeOutcome === "declined" && (
                <>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.textSecondary,
                      marginBottom: 6,
                    }}
                  >
                    Decline Reason (optional)
                  </Text>
                  <TextInput
                    value={declineReason}
                    onChangeText={setDeclineReason}
                    placeholder="Why was this declined?"
                    placeholderTextColor={colors.textPlaceholder}
                    multiline
                    style={{
                      backgroundColor: colors.fieldFill,
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 15,
                      fontFamily: "Poppins_400Regular",
                      color: colors.text,
                      minHeight: 80,
                      textAlignVertical: "top",
                      marginBottom: 16,
                    }}
                  />
                </>
              )}

              <TouchableOpacity
                onPress={() => {
                  if (closeOutcome === "secured") {
                    closeMutation.mutate({
                      status: "Closed – Gift Secured",
                      closedAmount: closedAmount
                        ? parseFloat(closedAmount)
                        : null,
                      closeDate,
                    });
                  } else {
                    closeMutation.mutate({
                      status: "Closed – Declined",
                      declineReason: declineReason || null,
                    });
                  }
                }}
                disabled={closeMutation.isPending}
                style={{
                  backgroundColor:
                    closeOutcome === "secured" ? "#059669" : "#DC2626",
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
                  marginBottom: 16,
                  opacity: closeMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Poppins_600SemiBold",
                    color: "#FFFFFF",
                  }}
                >
                  {closeMutation.isPending
                    ? "Saving..."
                    : closeOutcome === "secured"
                      ? "Mark as Gift Secured"
                      : "Mark as Declined"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

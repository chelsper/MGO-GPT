import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/components/useColors";
import Header from "@/components/Header";
import { StatusBar } from "expo-status-bar";
import useUser from "@/utils/auth/useUser";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";

export default function RequestListScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { data: user } = useUser();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  // Form state
  const [requesterName, setRequesterName] = useState(user?.name || "");
  const [dateNeeded, setDateNeeded] = useState("");
  const [purpose, setPurpose] = useState("");
  const [purposeOther, setPurposeOther] = useState("");
  const [outputType, setOutputType] = useState("");
  const [excelFields, setExcelFields] = useState([]);
  const [excelFieldsOther, setExcelFieldsOther] = useState("");
  const [whoIncluded, setWhoIncluded] = useState([]);
  const [whoIncludedOther, setWhoIncludedOther] = useState("");
  const [givingLevel, setGivingLevel] = useState("");
  const [givingLevelCustom, setGivingLevelCustom] = useState("");
  const [giftTimeframe, setGiftTimeframe] = useState("");
  const [giftTimeframeCustomStart, setGiftTimeframeCustomStart] = useState("");
  const [giftTimeframeCustomEnd, setGiftTimeframeCustomEnd] = useState("");
  const [locationFilter, setLocationFilter] = useState("none");
  const [locationState, setLocationState] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationZip, setLocationZip] = useState("");
  const [locationRadiusAddress, setLocationRadiusAddress] = useState("");
  const [locationRadiusMiles, setLocationRadiusMiles] = useState("");
  const [assignedMgo, setAssignedMgo] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [exclusions, setExclusions] = useState([]);
  const [exclusionsOther, setExclusionsOther] = useState("");
  const [priorityLevel, setPriorityLevel] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const purposeOptions = [
    "Donor visit preparation",
    "Event invitation",
    "Solicitation",
    "Stewardship",
    "Prospect research",
    "Hustle",
    "Other",
  ];

  const excelFieldOptions = [
    "Constituent Name",
    "Spouse Name",
    "Address",
    "Email",
    "Phone",
    "Employer",
    "Title",
    "Education",
    "JU Advisory Boards",
    "Assigned MGO",
    "Lifetime Giving",
    "Last Gift Date",
    "Last Gift Amount",
    "NXT Wealth Rating",
    "Other",
  ];

  const whoIncludedOptions = [
    "All contactable constituents",
    "Alumni (all types)",
    "Alumni (only undergraduate)",
    "Parents (current)",
    "Parents (current/former)",
    "Current donors",
    "Lapsed donors",
    "Prospects with ratings",
    "Event attendees",
    "Trustees",
    "Advisory board members",
    "Other",
  ];

  const mgoOptions = [
    "Any",
    "Scott Bacon",
    "Erica Beal",
    "Kaye Glover",
    "Gretchen Picotte",
    "Leslie Redd",
  ];

  const exclusionOptions = [
    "Deceased",
    "No contact",
    "No solicitation",
    "Trustees",
    "Spouses of trustees",
    "Alumni non-graduates",
    "Parent non-graduates",
    "Organizations",
    "Donors in an active pledge",
    "Donors this FY",
    "Other",
  ];

  const toggleSelection = (array, setArray, value) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (array.includes(value)) {
      setArray(array.filter((item) => item !== value));
    } else {
      setArray([...array, value]);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!dateNeeded) {
      Alert.alert("Error", "Please enter the date needed");
      return;
    }
    if (!purpose) {
      Alert.alert("Error", "Please select a purpose");
      return;
    }
    if (purpose === "Other" && !purposeOther) {
      Alert.alert("Error", "Please specify other purpose");
      return;
    }
    if (!outputType) {
      Alert.alert("Error", "Please select an output type");
      return;
    }
    if (!priorityLevel) {
      Alert.alert("Error", "Please select a priority level");
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const response = await fetch("/api/list-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName,
          dateNeeded,
          purpose,
          purposeOther,
          outputType,
          excelFields,
          excelFieldsOther,
          whoIncluded,
          whoIncludedOther,
          givingLevel,
          givingLevelCustom: givingLevelCustom
            ? parseFloat(givingLevelCustom)
            : null,
          giftTimeframe,
          giftTimeframeCustomStart,
          giftTimeframeCustomEnd,
          locationFilter,
          locationState,
          locationCity,
          locationZip,
          locationRadiusAddress,
          locationRadiusMiles: locationRadiusMiles
            ? parseInt(locationRadiusMiles)
            : null,
          assignedMgo,
          specialInstructions,
          exclusions,
          exclusionsOther,
          priorityLevel,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit list request");
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Success",
        "Your list request has been submitted to DevData",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      console.error("Submit error:", error);
      Alert.alert("Error", "Failed to submit list request. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!fontsLoaded) {
    return null;
  }

  const CheckboxItem = ({ label, checked, onPress }) => (
    <TouchableOpacity
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: checked ? colors.primaryUltraLight : colors.fieldFill,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: checked ? colors.primary : colors.outline,
        marginBottom: 8,
      }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.outline,
          backgroundColor: checked ? colors.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        {checked && <Check size={16} color="#FFFFFF" />}
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontFamily: "Poppins_400Regular",
          color: colors.text,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const RadioButton = ({ label, selected, onPress }) => (
    <TouchableOpacity
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: selected ? colors.primaryUltraLight : colors.fieldFill,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.outline,
        marginBottom: 8,
      }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: selected ? colors.primary : colors.outline,
          backgroundColor: "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        {selected && (
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: colors.primary,
            }}
          />
        )}
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontFamily: "Poppins_400Regular",
          color: colors.text,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingAnimatedView style={{ flex: 1 }} behavior="padding">
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="dark" />
        <Header title="Request List from DevData" showBack />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Section 1: Request Basics */}
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
              marginBottom: 16,
            }}
          >
            Request Basics
          </Text>

          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginBottom: 8,
            }}
          >
            Name
          </Text>
          <TextInput
            style={{
              backgroundColor: colors.fieldFill,
              borderWidth: 1,
              borderColor: colors.outline,
              borderRadius: 12,
              padding: 16,
              fontSize: 15,
              fontFamily: "Poppins_400Regular",
              color: colors.text,
              marginBottom: 16,
            }}
            value={requesterName}
            onChangeText={setRequesterName}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary}
          />

          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginBottom: 8,
            }}
          >
            Date Needed
          </Text>
          <TextInput
            style={{
              backgroundColor: colors.fieldFill,
              borderWidth: 1,
              borderColor: colors.outline,
              borderRadius: 12,
              padding: 16,
              fontSize: 15,
              fontFamily: "Poppins_400Regular",
              color: colors.text,
              marginBottom: 16,
            }}
            value={dateNeeded}
            onChangeText={setDateNeeded}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />

          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginBottom: 8,
            }}
          >
            Purpose of List
          </Text>
          {purposeOptions.map((option) => (
            <RadioButton
              key={option}
              label={option}
              selected={purpose === option}
              onPress={() => {
                setPurpose(option);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />
          ))}

          {purpose === "Other" && (
            <TextInput
              style={{
                backgroundColor: colors.fieldFill,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 12,
                padding: 16,
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.text,
                marginTop: 8,
                marginBottom: 16,
              }}
              value={purposeOther}
              onChangeText={setPurposeOther}
              placeholder="Please specify"
              placeholderTextColor={colors.textSecondary}
            />
          )}

          {/* Section 2: Output Type */}
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
              marginTop: 24,
              marginBottom: 16,
            }}
          >
            Output Type
          </Text>

          <RadioButton
            label="NXT List only"
            selected={outputType === "nxt_only"}
            onPress={() => {
              setOutputType("nxt_only");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />
          <RadioButton
            label="Excel spreadsheet only"
            selected={outputType === "excel_only"}
            onPress={() => {
              setOutputType("excel_only");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />
          <RadioButton
            label="Both NXT list and Excel spreadsheet"
            selected={outputType === "both"}
            onPress={() => {
              setOutputType("both");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />

          {/* Section 3: Excel Fields (Conditional) */}
          {(outputType === "excel_only" || outputType === "both") && (
            <>
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                  marginTop: 24,
                  marginBottom: 8,
                }}
              >
                Excel Output Options
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Poppins_400Regular",
                  color: colors.textSecondary,
                  marginBottom: 16,
                }}
              >
                Which fields should be included?
              </Text>

              {excelFieldOptions.map((field) => (
                <CheckboxItem
                  key={field}
                  label={field}
                  checked={excelFields.includes(field)}
                  onPress={() =>
                    toggleSelection(excelFields, setExcelFields, field)
                  }
                />
              ))}

              {excelFields.includes("Other") && (
                <TextInput
                  style={{
                    backgroundColor: colors.fieldFill,
                    borderWidth: 1,
                    borderColor: colors.outline,
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 15,
                    fontFamily: "Poppins_400Regular",
                    color: colors.text,
                    marginTop: 8,
                    marginBottom: 16,
                  }}
                  value={excelFieldsOther}
                  onChangeText={setExcelFieldsOther}
                  placeholder="Please specify other fields"
                  placeholderTextColor={colors.textSecondary}
                />
              )}
            </>
          )}

          {/* Section 4: List Criteria */}
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
              marginTop: 24,
              marginBottom: 8,
            }}
          >
            List Criteria
          </Text>

          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginBottom: 8,
            }}
          >
            Who should be included?
          </Text>
          {whoIncludedOptions.map((option) => (
            <CheckboxItem
              key={option}
              label={option}
              checked={whoIncluded.includes(option)}
              onPress={() =>
                toggleSelection(whoIncluded, setWhoIncluded, option)
              }
            />
          ))}

          {whoIncluded.includes("Other") && (
            <TextInput
              style={{
                backgroundColor: colors.fieldFill,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 12,
                padding: 16,
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.text,
                marginTop: 8,
                marginBottom: 16,
              }}
              value={whoIncludedOther}
              onChangeText={setWhoIncludedOther}
              placeholder="Please specify"
              placeholderTextColor={colors.textSecondary}
            />
          )}

          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            Giving Level
          </Text>
          {[
            "Any giving history",
            "$1+ lifetime",
            "$1,000+",
            "$10,000+",
            "$100,000+",
            "Custom amount",
          ].map((level) => (
            <RadioButton
              key={level}
              label={level}
              selected={givingLevel === level}
              onPress={() => {
                setGivingLevel(level);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />
          ))}

          {givingLevel === "Custom amount" && (
            <TextInput
              style={{
                backgroundColor: colors.fieldFill,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 12,
                padding: 16,
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.text,
                marginTop: 8,
                marginBottom: 16,
              }}
              value={givingLevelCustom}
              onChangeText={setGivingLevelCustom}
              placeholder="Enter amount"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          )}

          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            Gift Timeframe
          </Text>
          {[
            "Any time",
            "Last 12 months",
            "Last 3 years",
            "Last 5 years",
            "Custom range",
          ].map((timeframe) => (
            <RadioButton
              key={timeframe}
              label={timeframe}
              selected={giftTimeframe === timeframe}
              onPress={() => {
                setGiftTimeframe(timeframe);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />
          ))}

          {giftTimeframe === "Custom range" && (
            <View style={{ marginTop: 8, gap: 8 }}>
              <TextInput
                style={{
                  backgroundColor: colors.fieldFill,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  color: colors.text,
                }}
                value={giftTimeframeCustomStart}
                onChangeText={setGiftTimeframeCustomStart}
                placeholder="Start date (YYYY-MM-DD)"
                placeholderTextColor={colors.textSecondary}
              />
              <TextInput
                style={{
                  backgroundColor: colors.fieldFill,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  color: colors.text,
                  marginBottom: 16,
                }}
                value={giftTimeframeCustomEnd}
                onChangeText={setGiftTimeframeCustomEnd}
                placeholder="End date (YYYY-MM-DD)"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          )}

          {/* Geography */}
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            Location Filter
          </Text>
          {["None", "State", "City", "Zip code", "Radius from location"].map(
            (filter) => (
              <RadioButton
                key={filter}
                label={filter}
                selected={locationFilter === filter.toLowerCase()}
                onPress={() => {
                  setLocationFilter(filter.toLowerCase());
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              />
            ),
          )}

          {locationFilter === "state" && (
            <TextInput
              style={{
                backgroundColor: colors.fieldFill,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 12,
                padding: 16,
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.text,
                marginTop: 8,
                marginBottom: 16,
              }}
              value={locationState}
              onChangeText={setLocationState}
              placeholder="State"
              placeholderTextColor={colors.textSecondary}
            />
          )}

          {locationFilter === "city" && (
            <TextInput
              style={{
                backgroundColor: colors.fieldFill,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 12,
                padding: 16,
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.text,
                marginTop: 8,
                marginBottom: 16,
              }}
              value={locationCity}
              onChangeText={setLocationCity}
              placeholder="City"
              placeholderTextColor={colors.textSecondary}
            />
          )}

          {locationFilter === "zip code" && (
            <TextInput
              style={{
                backgroundColor: colors.fieldFill,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 12,
                padding: 16,
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.text,
                marginTop: 8,
                marginBottom: 16,
              }}
              value={locationZip}
              onChangeText={setLocationZip}
              placeholder="Zip code"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          )}

          {locationFilter === "radius from location" && (
            <View style={{ marginTop: 8, gap: 8 }}>
              <TextInput
                style={{
                  backgroundColor: colors.fieldFill,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  color: colors.text,
                }}
                value={locationRadiusAddress}
                onChangeText={setLocationRadiusAddress}
                placeholder="Address"
                placeholderTextColor={colors.textSecondary}
              />
              <TextInput
                style={{
                  backgroundColor: colors.fieldFill,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  color: colors.text,
                  marginBottom: 16,
                }}
                value={locationRadiusMiles}
                onChangeText={setLocationRadiusMiles}
                placeholder="Radius in miles"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
          )}

          {/* Assignment */}
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            Assigned to MGO
          </Text>
          {mgoOptions.map((mgo) => (
            <RadioButton
              key={mgo}
              label={mgo}
              selected={assignedMgo === mgo}
              onPress={() => {
                setAssignedMgo(mgo);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />
          ))}

          {/* Section 5: Special Instructions & Exclusions */}
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
              marginTop: 24,
              marginBottom: 8,
            }}
          >
            Special Instructions
          </Text>

          <TextInput
            style={{
              backgroundColor: colors.fieldFill,
              borderWidth: 1,
              borderColor: colors.outline,
              borderRadius: 12,
              padding: 16,
              fontSize: 15,
              fontFamily: "Poppins_400Regular",
              color: colors.text,
              marginBottom: 16,
              minHeight: 100,
              textAlignVertical: "top",
            }}
            value={specialInstructions}
            onChangeText={setSpecialInstructions}
            placeholder="Anything else we should know?"
            placeholderTextColor={colors.textSecondary}
            multiline
          />

          <Text
            style={{
              fontSize: 14,
              fontFamily: "Poppins_500Medium",
              color: colors.text,
              marginBottom: 8,
            }}
          >
            Exclusions
          </Text>
          {exclusionOptions.map((exclusion) => (
            <CheckboxItem
              key={exclusion}
              label={exclusion}
              checked={exclusions.includes(exclusion)}
              onPress={() =>
                toggleSelection(exclusions, setExclusions, exclusion)
              }
            />
          ))}

          {exclusions.includes("Other") && (
            <TextInput
              style={{
                backgroundColor: colors.fieldFill,
                borderWidth: 1,
                borderColor: colors.outline,
                borderRadius: 12,
                padding: 16,
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.text,
                marginTop: 8,
                marginBottom: 16,
              }}
              value={exclusionsOther}
              onChangeText={setExclusionsOther}
              placeholder="Please specify"
              placeholderTextColor={colors.textSecondary}
            />
          )}

          {/* Section 6: Urgency */}
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
              marginTop: 24,
              marginBottom: 8,
            }}
          >
            Priority Level
          </Text>

          <RadioButton
            label="Future (6+ days)"
            selected={priorityLevel === "future"}
            onPress={() => {
              setPriorityLevel("future");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />
          <RadioButton
            label="Normal (3-5 business days)"
            selected={priorityLevel === "normal"}
            onPress={() => {
              setPriorityLevel("normal");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />
          <RadioButton
            label="Urgent (1-2 days)"
            selected={priorityLevel === "urgent"}
            onPress={() => {
              setPriorityLevel("urgent");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />
        </ScrollView>

        {/* Submit Button */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.outline,
          }}
        >
          <TouchableOpacity
            style={{
              backgroundColor: colors.primary,
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: "center",
              opacity: submitting ? 0.6 : 1,
            }}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Poppins_600SemiBold",
                  color: "#FFFFFF",
                }}
              >
                Submit Request
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingAnimatedView>
  );
}

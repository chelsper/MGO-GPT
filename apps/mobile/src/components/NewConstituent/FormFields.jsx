import React from "react";
import { View, Text, TextInput } from "react-native";

export function FormFields({ colors, formData, setters }) {
  return (
    <>
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Poppins_500Medium",
          color: colors.text,
          marginBottom: 8,
        }}
      >
        Name *
      </Text>
      <TextInput
        style={{
          height: 48,
          backgroundColor: colors.fieldFill,
          borderRadius: 12,
          paddingHorizontal: 16,
          fontSize: 15,
          fontFamily: "Poppins_400Regular",
          color: colors.text,
          marginBottom: 20,
        }}
        placeholder="Enter name"
        placeholderTextColor={colors.textPlaceholder}
        value={formData.name}
        onChangeText={setters.setName}
      />

      <Text
        style={{
          fontSize: 14,
          fontFamily: "Poppins_500Medium",
          color: colors.text,
          marginBottom: 8,
        }}
      >
        Organization
      </Text>
      <TextInput
        style={{
          height: 48,
          backgroundColor: colors.fieldFill,
          borderRadius: 12,
          paddingHorizontal: 16,
          fontSize: 15,
          fontFamily: "Poppins_400Regular",
          color: colors.text,
          marginBottom: 20,
        }}
        placeholder="Enter organization"
        placeholderTextColor={colors.textPlaceholder}
        value={formData.organization}
        onChangeText={setters.setOrganization}
      />

      <Text
        style={{
          fontSize: 14,
          fontFamily: "Poppins_500Medium",
          color: colors.text,
          marginBottom: 8,
        }}
      >
        Email
      </Text>
      <TextInput
        style={{
          height: 48,
          backgroundColor: colors.fieldFill,
          borderRadius: 12,
          paddingHorizontal: 16,
          fontSize: 15,
          fontFamily: "Poppins_400Regular",
          color: colors.text,
          marginBottom: 20,
        }}
        placeholder="email@example.com"
        placeholderTextColor={colors.textPlaceholder}
        value={formData.email}
        onChangeText={setters.setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text
        style={{
          fontSize: 14,
          fontFamily: "Poppins_500Medium",
          color: colors.text,
          marginBottom: 8,
        }}
      >
        Phone
      </Text>
      <TextInput
        style={{
          height: 48,
          backgroundColor: colors.fieldFill,
          borderRadius: 12,
          paddingHorizontal: 16,
          fontSize: 15,
          fontFamily: "Poppins_400Regular",
          color: colors.text,
          marginBottom: 20,
        }}
        placeholder="(555) 123-4567"
        placeholderTextColor={colors.textPlaceholder}
        value={formData.phone}
        onChangeText={setters.setPhone}
        keyboardType="phone-pad"
      />

      <Text
        style={{
          fontSize: 14,
          fontFamily: "Poppins_500Medium",
          color: colors.text,
          marginBottom: 8,
        }}
      >
        Assign to Me
      </Text>
      <TextInput
        style={{
          height: 48,
          backgroundColor: colors.fieldFill,
          borderRadius: 12,
          paddingHorizontal: 16,
          fontSize: 15,
          fontFamily: "Poppins_400Regular",
          color: colors.text,
          marginBottom: 20,
        }}
        placeholder="Enter assignment details"
        placeholderTextColor={colors.textPlaceholder}
        value={formData.assignToMe}
        onChangeText={setters.setAssignToMe}
      />

      <Text
        style={{
          fontSize: 14,
          fontFamily: "Poppins_500Medium",
          color: colors.text,
          marginBottom: 8,
        }}
      >
        Notes
      </Text>
      <TextInput
        style={{
          minHeight: 100,
          backgroundColor: colors.fieldFill,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingTop: 12,
          fontSize: 15,
          fontFamily: "Poppins_400Regular",
          color: colors.text,
          marginBottom: 32,
          textAlignVertical: "top",
        }}
        placeholder="Add notes about this contact..."
        placeholderTextColor={colors.textPlaceholder}
        value={formData.notes}
        onChangeText={setters.setNotes}
        multiline
      />
    </>
  );
}

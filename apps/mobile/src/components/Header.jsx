import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu as MenuIcon, User } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "./useColors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Menu from "./Menu";

export default function Header({
  title,
  showBorder = false,
  onMenuPress,
  rightComponent,
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);

  const handleMenuPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuVisible(!menuVisible);
  };

  const handleProfilePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/profile");
  };

  return (
    <>
      <View
        style={{
          backgroundColor: colors.background,
          borderBottomWidth: showBorder ? 1 : 0,
          borderBottomColor: colors.outline,
        }}
      >
        <View
          style={{
            height: insets.top + 56,
            paddingTop: insets.top,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
          }}
        >
          <TouchableOpacity
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: colors.cardBackground,
              borderWidth: 1,
              borderColor: colors.outline,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={handleMenuPress}
            accessibilityLabel="Open menu"
          >
            <MenuIcon size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primaryUltraLight,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={handleProfilePress}
            accessibilityLabel="Profile"
          >
            <User size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image
              source={{
                uri: "https://ucarecdn.com/8291db54-6f2a-43f4-9fc2-e6ced1ab623d/-/format/auto/",
              }}
              style={{ width: 40, height: 40 }}
              contentFit="contain"
            />
            <Text
              style={{
                fontSize: 22,
                fontFamily: "Poppins_600SemiBold",
                color: colors.text,
              }}
            >
              {title}
            </Text>
          </View>

          {rightComponent}
        </View>
      </View>

      <Menu visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </>
  );
}

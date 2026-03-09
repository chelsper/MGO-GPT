import { useColorScheme } from "react-native";

export const useColors = () => {
  const colorScheme = useColorScheme();

  const colorPalette = {
    light: {
      primary: "#004D43",
      primaryLight: "#00766C",
      primaryUltraLight: "#E0F2F1",
      text: "#1F152E",
      textSecondary: "#7E7A86",
      textPlaceholder: "#8E8B95",
      background: "#FFFFFF",
      backgroundSecondary: "#F8F7F9",
      fieldFill: "#F5F5F7",
      searchBackground: "#F1F0F3",
      outline: "#E0DFE4",
      stroke: "#DFDDE3",
      cardBackground: "#FFFFFF",
      cardStroke: "#E4E2EA",
      innerCircle: "#F0F0F0",
      timer: "#6C6777",
      accentLilac: "#E1DBFF",
      pressedOverlay: "#7A63FF0D",
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
    },
    dark: {
      primary: "#00766C",
      primaryLight: "#009688",
      primaryUltraLight: "#1B3A37",
      text: "#FFFFFF",
      textSecondary: "#A1A1AA",
      textPlaceholder: "#71717A",
      background: "#121212",
      backgroundSecondary: "#121212",
      fieldFill: "#1E1E1E",
      searchBackground: "#262626",
      outline: "#333333",
      stroke: "#333333",
      cardBackground: "#1E1E1E",
      cardStroke: "#404040",
      innerCircle: "#262626",
      timer: "#A1A1AA",
      accentLilac: "#3A2D5F",
      pressedOverlay: "#8E7DFF0D",
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
    },
  };

  return colorPalette[colorScheme] || colorPalette.light;
};

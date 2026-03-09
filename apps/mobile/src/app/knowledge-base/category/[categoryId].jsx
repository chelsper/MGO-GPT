import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { ArrowLeft, ChevronRight, Home } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/components/useColors";
import { StatusBar } from "expo-status-bar";
import { knowledgeBaseData, getArticlesByCategory } from "@/data/knowledgeBase";

export default function CategoryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { categoryId } = useLocalSearchParams();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const category = knowledgeBaseData.categories.find(
    (cat) => cat.id === categoryId,
  );
  const articles = getArticlesByCategory(categoryId);

  const handleArticlePress = (articleId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/knowledge-base/${articleId}`);
  };

  if (!fontsLoaded || !category) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />

      {/* Header */}
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
              marginRight: 8,
            }}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color={colors.text} />
          </TouchableOpacity>
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
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/(tabs)");
            }}
          >
            <Home size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                fontFamily: "Poppins_600SemiBold",
                color: colors.text,
              }}
            >
              {category.title}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Poppins_400Regular",
                color: colors.textSecondary,
                marginTop: 2,
              }}
            >
              {articles.length} article{articles.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
      </View>

      {/* Articles List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: insets.bottom + 80,
        }}
        showsVerticalScrollIndicator={false}
      >
        {articles.map((article, index) => (
          <TouchableOpacity
            key={article.id}
            style={{
              backgroundColor: colors.cardBackground,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.outline,
              padding: 16,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
            }}
            onPress={() => handleArticlePress(article.id)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                  marginBottom: 6,
                }}
              >
                {article.title}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Poppins_400Regular",
                  color: colors.textSecondary,
                  lineHeight: 20,
                  marginBottom: 10,
                }}
                numberOfLines={2}
              >
                {article.summary}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                }}
              >
                {article.tags.slice(0, 3).map((tag, tagIndex) => (
                  <View
                    key={tagIndex}
                    style={{
                      backgroundColor: colors.primaryUltraLight,
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      marginRight: 6,
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Poppins_500Medium",
                        color: colors.primary,
                      }}
                    >
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <ChevronRight
              size={24}
              color={colors.textSecondary}
              style={{ marginLeft: 12 }}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

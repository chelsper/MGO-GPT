import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Home,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/components/useColors";
import { StatusBar } from "expo-status-bar";
import { knowledgeBaseData, getRelatedArticles } from "@/data/knowledgeBase";

export default function ArticleDetailScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { articleId } = useLocalSearchParams();

  const [expandedSections, setExpandedSections] = useState({
    rulesStandards: true,
    examples: false,
    whyThisMatters: false,
    commonMistakes: false,
    relatedArticles: false,
  });

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const article = knowledgeBaseData.articles.find((a) => a.id === articleId);
  const category = article
    ? knowledgeBaseData.categories.find((c) => c.id === article.categoryId)
    : null;
  const relatedArticles = article
    ? getRelatedArticles(article.sections.relatedArticles || [])
    : [];

  const toggleSection = (section) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleRelatedArticlePress = (relatedArticleId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/knowledge-base/${relatedArticleId}`);
  };

  if (!fontsLoaded || !article) {
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
                fontSize: 12,
                fontFamily: "Poppins_500Medium",
                color: colors.primary,
              }}
            >
              {category?.title}
            </Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Article Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <Text
            style={{
              fontSize: 24,
              fontFamily: "Poppins_600SemiBold",
              color: colors.text,
              lineHeight: 32,
              marginBottom: 12,
            }}
          >
            {article.title}
          </Text>

          {/* Summary */}
          <View
            style={{
              backgroundColor: colors.primaryUltraLight,
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontFamily: "Poppins_400Regular",
                color: colors.text,
                lineHeight: 24,
              }}
            >
              {article.summary}
            </Text>
          </View>

          {/* Tags */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            {article.tags.map((tag, index) => (
              <View
                key={index}
                style={{
                  backgroundColor: colors.cardBackground,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Poppins_500Medium",
                    color: colors.textSecondary,
                  }}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>

          {/* Last Updated */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <Clock size={14} color={colors.textSecondary} />
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Poppins_400Regular",
                color: colors.textSecondary,
                marginLeft: 6,
              }}
            >
              Last Updated: {article.lastUpdated}
            </Text>
          </View>
        </View>

        {/* Rules & Standards Section */}
        {article.sections.rulesStandards && (
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              style={{
                backgroundColor: colors.cardBackground,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.outline,
                paddingHorizontal: 20,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onPress={() => toggleSection("rulesStandards")}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Rules & Standards
              </Text>
              {expandedSections.rulesStandards ? (
                <ChevronUp size={20} color={colors.textSecondary} />
              ) : (
                <ChevronDown size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            {expandedSections.rulesStandards && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  backgroundColor: colors.background,
                }}
              >
                {article.sections.rulesStandards
                  .filter((rule) => rule.trim() !== "")
                  .map((rule, index) => {
                    const isHeader =
                      /^[A-Z][A-Z &/\-—(),.'']+:$/.test(rule.trim()) ||
                      /^[A-Z][A-Z &/\-—(),.'']+:$/.test(
                        rule.replace(/\s*\(.*?\)\s*/g, "").trim(),
                      );

                    if (isHeader) {
                      return (
                        <View
                          key={index}
                          style={{
                            marginTop: index === 0 ? 0 : 16,
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 15,
                              fontFamily: "Poppins_600SemiBold",
                              color: colors.primary,
                              lineHeight: 22,
                            }}
                          >
                            {rule.replace(/:$/, "")}
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View
                        key={index}
                        style={{
                          flexDirection: "row",
                          marginBottom: 12,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontFamily: "Poppins_600SemiBold",
                            color: colors.primary,
                            marginRight: 8,
                          }}
                        >
                          •
                        </Text>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 14,
                            fontFamily: "Poppins_400Regular",
                            color: colors.text,
                            lineHeight: 22,
                          }}
                        >
                          {rule}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            )}
          </View>
        )}

        {/* Examples Section */}
        {article.sections.examples && (
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              style={{
                backgroundColor: colors.cardBackground,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.outline,
                paddingHorizontal: 20,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onPress={() => toggleSection("examples")}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Examples
              </Text>
              {expandedSections.examples ? (
                <ChevronUp size={20} color={colors.textSecondary} />
              ) : (
                <ChevronDown size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            {expandedSections.examples && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  backgroundColor: colors.background,
                }}
              >
                {article.sections.examples.map((example, index) => (
                  <View
                    key={index}
                    style={{
                      backgroundColor: colors.primaryUltraLight,
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                        marginBottom: 8,
                      }}
                    >
                      {example.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: "Poppins_400Regular",
                        color: colors.text,
                        lineHeight: 22,
                      }}
                    >
                      {example.content}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Why This Matters Section */}
        {article.sections.whyThisMatters && (
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              style={{
                backgroundColor: colors.cardBackground,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.outline,
                paddingHorizontal: 20,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onPress={() => toggleSection("whyThisMatters")}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Why This Matters
              </Text>
              {expandedSections.whyThisMatters ? (
                <ChevronUp size={20} color={colors.textSecondary} />
              ) : (
                <ChevronDown size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            {expandedSections.whyThisMatters && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  backgroundColor: colors.background,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Poppins_400Regular",
                    color: colors.text,
                    lineHeight: 22,
                  }}
                >
                  {article.sections.whyThisMatters}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Common Mistakes Section */}
        {article.sections.commonMistakes && (
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              style={{
                backgroundColor: colors.cardBackground,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.outline,
                paddingHorizontal: 20,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onPress={() => toggleSection("commonMistakes")}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Common Mistakes
              </Text>
              {expandedSections.commonMistakes ? (
                <ChevronUp size={20} color={colors.textSecondary} />
              ) : (
                <ChevronDown size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            {expandedSections.commonMistakes && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  backgroundColor: colors.background,
                }}
              >
                {article.sections.commonMistakes.map((mistake, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: "row",
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.error,
                        marginRight: 8,
                      }}
                    >
                      •
                    </Text>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 14,
                        fontFamily: "Poppins_400Regular",
                        color: colors.text,
                        lineHeight: 22,
                      }}
                    >
                      {mistake}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Related Articles Section */}
        {relatedArticles.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              style={{
                backgroundColor: colors.cardBackground,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.outline,
                paddingHorizontal: 20,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onPress={() => toggleSection("relatedArticles")}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Related Articles
              </Text>
              {expandedSections.relatedArticles ? (
                <ChevronUp size={20} color={colors.textSecondary} />
              ) : (
                <ChevronDown size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            {expandedSections.relatedArticles && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  backgroundColor: colors.background,
                }}
              >
                {relatedArticles.map((relatedArticle) => (
                  <TouchableOpacity
                    key={relatedArticle.id}
                    style={{
                      backgroundColor: colors.cardBackground,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.outline,
                      padding: 14,
                      marginBottom: 10,
                    }}
                    onPress={() => handleRelatedArticlePress(relatedArticle.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.primary,
                        marginBottom: 4,
                      }}
                    >
                      {relatedArticle.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        color: colors.textSecondary,
                        lineHeight: 20,
                      }}
                      numberOfLines={2}
                    >
                      {relatedArticle.summary}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

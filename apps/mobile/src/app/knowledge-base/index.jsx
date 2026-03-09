import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import {
  Search,
  BookOpen,
  Users,
  Home,
  Gift,
  Target,
  FileText,
  Shield,
  ChevronRight,
  X,
  ArrowLeft,
  Banknote,
  HeartHandshake,
  FileSignature,
  BarChart3,
  Settings,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/components/useColors";
import { StatusBar } from "expo-status-bar";
import { knowledgeBaseData, searchArticles } from "@/data/knowledgeBase";

const iconMap = {
  "book-open": BookOpen,
  users: Users,
  home: Home,
  gift: Gift,
  target: Target,
  "file-text": FileText,
  shield: Shield,
  banknote: Banknote,
  "hand-heart": HeartHandshake,
  "file-signature": FileSignature,
  "bar-chart-3": BarChart3,
  settings: Settings,
};

export default function KnowledgeBaseHome() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (text.trim() === "") {
      setSearchResults([]);
      setIsSearching(false);
    } else {
      setIsSearching(true);
      const results = searchArticles(text);
      setSearchResults(results);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
  };

  const handleCategoryPress = (categoryId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/knowledge-base/category/${categoryId}`);
  };

  const handleArticlePress = (articleId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/knowledge-base/${articleId}`);
  };

  if (!fontsLoaded) {
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
          backgroundColor: colors.primary,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 8,
            marginBottom: 4,
          }}
        >
          <TouchableOpacity
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/(tabs)");
            }}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 28,
              fontFamily: "Poppins_600SemiBold",
              color: "#FFFFFF",
              flex: 1,
              marginLeft: 12,
            }}
          >
            Knowledge Base
          </Text>
        </View>
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Poppins_400Regular",
            color: "#FFFFFF",
            opacity: 0.9,
            marginBottom: 16,
          }}
        >
          Advancement Procedures & Data Standards
        </Text>

        {/* Search Bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            paddingHorizontal: 16,
            height: 48,
          }}
        >
          <Search size={20} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search Advancement Knowledge Base"
            placeholderTextColor={colors.textSecondary}
            style={{
              flex: 1,
              marginLeft: 12,
              fontSize: 15,
              fontFamily: "Poppins_400Regular",
              color: colors.text,
            }}
          />
          {searchQuery !== "" && (
            <TouchableOpacity onPress={clearSearch}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 80,
        }}
        showsVerticalScrollIndicator={false}
      >
        {isSearching ? (
          // Search Results
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Poppins_600SemiBold",
                color: colors.text,
                marginBottom: 12,
              }}
            >
              {searchResults.length} Result
              {searchResults.length !== 1 ? "s" : ""}
            </Text>
            {searchResults.map((article) => {
              const category = knowledgeBaseData.categories.find(
                (cat) => cat.id === article.categoryId,
              );
              return (
                <TouchableOpacity
                  key={article.id}
                  style={{
                    backgroundColor: colors.cardBackground,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.outline,
                    padding: 16,
                    marginBottom: 12,
                  }}
                  onPress={() => handleArticlePress(article.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: "Poppins_500Medium",
                      color: colors.primary,
                      marginBottom: 4,
                    }}
                  >
                    {category?.title}
                  </Text>
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
                    }}
                    numberOfLines={2}
                  >
                    {article.summary}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    {article.tags.slice(0, 3).map((tag, index) => (
                      <View
                        key={index}
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
                </TouchableOpacity>
              );
            })}
            {searchResults.length === 0 && (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 40,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: "Poppins_400Regular",
                    color: colors.textSecondary,
                    textAlign: "center",
                  }}
                >
                  No articles found for "{searchQuery}"
                </Text>
              </View>
            )}
          </View>
        ) : (
          // Categories
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text
              style={{
                fontSize: 20,
                fontFamily: "Poppins_600SemiBold",
                color: colors.text,
                marginBottom: 16,
              }}
            >
              Browse by Category
            </Text>
            {knowledgeBaseData.categories.map((category) => {
              const IconComponent = iconMap[category.icon];
              const articleCount = knowledgeBaseData.articles.filter(
                (a) => a.categoryId === category.id,
              ).length;

              return (
                <TouchableOpacity
                  key={category.id}
                  style={{
                    backgroundColor: colors.cardBackground,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.outline,
                    padding: 20,
                    marginBottom: 16,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                  onPress={() => handleCategoryPress(category.id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      backgroundColor: colors.primaryUltraLight,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 16,
                    }}
                  >
                    <IconComponent size={28} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 17,
                        fontFamily: "Poppins_600SemiBold",
                        color: colors.text,
                        marginBottom: 4,
                      }}
                    >
                      {category.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        color: colors.textSecondary,
                        marginBottom: 6,
                      }}
                    >
                      {category.description}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Poppins_500Medium",
                        color: colors.primary,
                      }}
                    >
                      {articleCount} article{articleCount !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <ChevronRight size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

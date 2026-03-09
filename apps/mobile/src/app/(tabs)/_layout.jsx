import { Tabs } from "expo-router";
import { Home, FileText, CheckSquare, BookOpen } from "lucide-react-native";
import { useColors } from "@/components/useColors";
import { useQuery } from "@tanstack/react-query";

export default function TabLayout() {
  const colors = useColors();

  const { data: profileData } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const response = await fetch("/api/users/profile");
      if (!response.ok) {
        throw new Error("Failed to fetch user profile");
      }
      return response.json();
    },
  });

  const userRole = profileData?.user?.role || "mgo";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderColor: colors.outline,
          paddingTop: 4,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: "Poppins_500Medium",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Home color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="submissions"
        options={{
          title: "My Submissions",
          tabBarIcon: ({ color }) => <FileText color={color} size={24} />,
          href: userRole === "mgo" ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: "Review",
          tabBarIcon: ({ color }) => <CheckSquare color={color} size={24} />,
          href: userRole === "reviewer" ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="knowledge"
        options={{
          title: "Knowledge Base",
          tabBarIcon: ({ color }) => <BookOpen color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}

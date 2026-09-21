"use client";
import { useParams } from "react-router";
import PersonalDashboard from "@/components/PersonalDashboard";
export default function PersonalDashboardPage() {
  const { dashboardId } = useParams();
  return <PersonalDashboard key={dashboardId} dashboardId={dashboardId} />;
}

"use client";
import ConstituentListPage from "@/app/reports/lists/[listKey]/page";
export default function ProjectProspectingDetail({ params }) {
  return <ConstituentListPage params={params} projectRoute />;
}

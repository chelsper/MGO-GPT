"use client";
import ConstituentListView from "@/app/reports/lists/ConstituentListView";

export default function ProjectOutreachPage({ params }) {
  return <ConstituentListView params={params} projectRoute outreachRoute />;
}

"use client";
import ConstituentListView from "@/app/reports/lists/ConstituentListView";
import AssignedOutreachView from "@/components/AssignedOutreachView";
import { useEffect, useState } from "react";

export default function ProjectOutreachPage({ params }) {
  const [manage, setManage] = useState(null);
  useEffect(() => {
    setManage(new URLSearchParams(window.location.search).get("view") === "manage");
  }, [params.listKey]);
  if (manage === null) return <p role="status">Opening outreach...</p>;
  return manage ? <ConstituentListView params={params} projectRoute outreachRoute /> :
    <AssignedOutreachView key={params.listKey} listKey={params.listKey} />;
}

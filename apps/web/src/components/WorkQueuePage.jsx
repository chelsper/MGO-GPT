"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import AdvancementWorkQueue from "@/components/AdvancementWorkQueue";
import { isReviewerRole } from "@/utils/workspaceRoles";

const SubmissionTracker = lazy(() => import("@/components/SubmissionTracker"));
const DataRequestTracker = lazy(() => import("@/components/DataRequestTracker"));

export default function WorkQueuePage({ initialCategory = "all", mgoPage = "submissions", stewardshipOnly = false }) {
  const { data: user, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const { isReviewerView } = useWorkspaceView(profile?.role);

  useEffect(() => {
    if (!loading && !user) window.location.href = "/account/signin";
  }, [loading, user]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetch("/api/users/profile", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.user?.role) throw new Error("Could not load your workspace permissions.");
        setProfile(payload.user);
      })
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [user]);

  if (error) return <main className="p-8"><p role="alert">{error}</p><a href="/">Return to dashboard</a></main>;
  if (loading || !profile) return <main className="p-8" role="status">Loading workspace...</main>;

  if (stewardshipOnly) return isReviewerRole(profile.role) && profile.active !== false
    ? <AdvancementWorkQueue initialCategory="stewardship" stewardshipOnly />
    : <main className="p-8"><p role="alert">Stewardship requests are managed by Admin and Advancement Services.</p><a href="/follow-ups?tab=next-steps">Return to your follow-ups</a></main>;

  const detailedReview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "activity";
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  if (isReviewerView && !detailedReview) return <AdvancementWorkQueue initialCategory={params.get("category") === "stewardship" ? "stewardship" : initialCategory} returnToStewardship={params.get("returnTo") === "stewardship"} />;
  return (
    <Suspense fallback={<main className="p-8" role="status">Loading request tracker...</main>}>
      {isReviewerView && <div className="px-8 pt-6"><a href="/submissions">Return to compact Work Queue</a></div>}
      {mgoPage === "data" ? <DataRequestTracker /> : <SubmissionTracker detailedReview={isReviewerView && detailedReview} />}
    </Suspense>
  );
}

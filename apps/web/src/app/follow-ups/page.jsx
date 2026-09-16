"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ListTodo, MessageSquare } from "lucide-react";
import useUser from "@/utils/useUser";
import NextStepsWorklist from "@/components/NextStepsWorklist";

const TeamDiscussionView = lazy(() => import("@/components/TeamDiscussionView"));

export function followUpTab(location) {
  const params = new URLSearchParams(location?.search || "");
  if (params.get("tab") === "next-steps") return "next-steps";
  if (params.get("tab") === "discussion" || params.has("discussionId") || location?.pathname === "/team-discussion") return "discussion";
  return "next-steps";
}

export default function FollowUpsPage() {
  const { data: user, loading } = useUser();
  const [tab, setTab] = useState("next-steps");
  const [visited, setVisited] = useState(() => new Set());
  const profile = useQuery({
    queryKey: ["follow-ups-workspace", user?.id],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/users/profile", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("The selected workspace could not be loaded.");
      const data = await response.json();
      if (!data.workspaceUser?.id || !data.user?.id) throw new Error("Workspace details are unavailable.");
      return data;
    },
    enabled: Boolean(user), gcTime: 0, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false,
  });

  function selectTab(value) {
    setTab(value);
    setVisited(current => new Set([...current, value]));
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    for (const key of ["discussionId", "edit", "status"]) url.searchParams.delete(key);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  useEffect(() => {
    const restoreTab = () => {
      const value = followUpTab(window.location);
      setTab(value);
      setVisited(current => new Set([...current, value]));
    };
    restoreTab();
    window.addEventListener("popstate", restoreTab);
    return () => window.removeEventListener("popstate", restoreTab);
  }, []);

  if (!loading && !user) return <div className="p-8"><a href="/account/signin">Sign in to view follow-ups</a></div>;
  const workspace = profile.data?.workspaceUser;
  const scope = `${profile.data?.user?.id}:${workspace?.id}`;
  return <main className="mx-auto w-full max-w-[1480px] space-y-5 px-4 py-6 sm:px-6">
    <a href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gray-600"><ArrowLeft size={16} aria-hidden="true" />Back to dashboard</a>
    <header>
      <h1 className="text-3xl font-bold text-gray-900">Follow-ups &amp; Discussion</h1>
      <p className="mt-2 text-base text-gray-600">Your follow-ups and team conversations, in one place.</p>
      {workspace && <p className="mt-3 text-sm text-gray-700">Workspace: <strong>{workspace.name || "My workspace"}</strong>{profile.data.actingAsUser ? " (selected workspace)" : ""}</p>}
    </header>
    <div role="tablist" aria-label="Follow-up type" className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
      {[{ value: "next-steps", label: "Next Steps", Icon: ListTodo }, { value: "discussion", label: "Team Discussion", Icon: MessageSquare }].map(({ value, label, Icon }) => (
        <button key={value} id={`follow-up-tab-${value}`} type="button" role="tab" aria-selected={tab === value}
          aria-controls={`follow-up-panel-${value}`} tabIndex={tab === value ? 0 : -1}
          onClick={() => selectTab(value)} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? "next-steps" : event.key === "End" ? "discussion" : value === "discussion" ? "next-steps" : "discussion";
            selectTab(next);
            document.getElementById(`follow-up-tab-${next}`)?.focus();
          }}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-5 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${tab === value ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 bg-white text-gray-700"}`}>
          <Icon size={17} aria-hidden="true" className="hidden sm:block" />{label}
        </button>
      ))}
    </div>
    {loading || profile.isFetching ? <p role="status">Loading workspace...</p> : profile.isError ? (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">Workspace could not be loaded. <button type="button" className="underline" onClick={() => profile.refetch()}>Try again</button></div>
    ) : workspace ? <div key={scope}>
      <section id="follow-up-panel-next-steps" role="tabpanel" aria-labelledby="follow-up-tab-next-steps" hidden={tab !== "next-steps"}>
        {visited.has("next-steps") && <NextStepsWorklist viewerId={profile.data.user.id} workspaceId={workspace.id} active={tab === "next-steps"} />}
      </section>
      <section id="follow-up-panel-discussion" role="tabpanel" aria-labelledby="follow-up-tab-discussion" hidden={tab !== "discussion"}>
        {visited.has("discussion") && <Suspense fallback={<p role="status">Loading Team Discussion...</p>}>
          <TeamDiscussionView user={profile.data.user} workspaceId={workspace.id} active={tab === "discussion"} />
        </Suspense>}
      </section>
    </div> : null}
  </main>;
}

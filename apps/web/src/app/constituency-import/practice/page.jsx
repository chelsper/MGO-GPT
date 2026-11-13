"use client";

import useUser from "@/utils/useUser";
import useImportAccess from "@/utils/useImportAccess";
import ImportPractice from "@/components/ImportPractice";

export default function ImportPracticePage() {
  const { data: user, loading } = useUser();
  const access = useImportAccess({ user, loading });
  if (access.status === "allowed") return <ImportPractice key={user.email} />;
  return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <a href="/" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Back to Home</a>
    <h1 className="text-2xl font-bold">{access.status === "loading" ? "Checking practice access" : access.status === "error" ? "Practice access could not be checked" : access.status === "signed_out" ? "Sign in to use import practice" : "Import practice needs reviewer access"}</h1>
    <p role={access.status === "error" ? "alert" : "status"}>{access.status === "error" ? access.message : "Practice is for active Admin and Advancement Services accounts. It uses fictional examples, not NXT records."}</p>
    {access.status === "error" && <button type="button" onClick={access.retry} className="min-h-11 rounded-xl border border-emerald-700 px-4 font-semibold text-emerald-800">Retry access check</button>}
  </main>;
}

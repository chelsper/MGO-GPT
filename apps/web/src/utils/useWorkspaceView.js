"use client";

import { useEffect, useMemo, useState } from "react";
import { isAdminRole } from "@/utils/workspaceRoles";

const STORAGE_KEY = "mgo-gpt:admin-view-mode";

export default function useWorkspaceView(profileRole) {
  const [adminViewMode, setAdminViewMode] = useState("reviewer");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedMode = window.localStorage.getItem(STORAGE_KEY);
    if (savedMode === "mgo" || savedMode === "reviewer") {
      setAdminViewMode(savedMode);
    }
  }, []);

  const isAdmin = isAdminRole(profileRole);

  const effectiveRole = useMemo(() => {
    if (!isAdmin) return profileRole || "mgo";
    return adminViewMode === "mgo" ? "mgo" : "reviewer";
  }, [adminViewMode, isAdmin, profileRole]);

  function setViewMode(nextMode) {
    if (!isAdmin) return;
    if (nextMode !== "mgo" && nextMode !== "reviewer") return;
    setAdminViewMode(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    }
  }

  return {
    isAdmin,
    adminViewMode,
    effectiveRole,
    setViewMode,
    isMgoView: effectiveRole === "mgo",
    isReviewerView: effectiveRole === "reviewer",
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";
import {
  canManageWorkspaceRole,
  canUseMgoWorkspaceRole,
  canViewWorkspaceAsRole,
  getWorkspaceRoleLabel,
} from "@/utils/workspaceRoles";

const cardStyle = {
  backgroundColor: "white",
  borderRadius: "12px",
  border: "1px solid #E5E7EB",
  padding: "24px",
  marginBottom: "20px",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #D1D5DB",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
};

function getBlackbaudLinkMeta(record) {
  if (record?.blackbaud_lookup_id || record?.blackbaud_constituent_id) {
    return {
      label: "Blackbaud linked",
      tone: {
        backgroundColor: "#ECFDF5",
        border: "1px solid #A7F3D0",
        color: "#166534",
      },
      detail: record?.blackbaud_lookup_id
        ? `Lookup ID: ${record.blackbaud_lookup_id}`
        : "Internal Blackbaud link saved",
    };
  }

  return {
    label: "App only",
    tone: {
      backgroundColor: "#F3F4F6",
      border: "1px solid #D1D5DB",
      color: "#4B5563",
    },
    detail: "No Blackbaud link yet",
  };
}

function getScopeList(record) {
  return String(record?.blackbaud_connection_scope || "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasUsableBlackbaudConnection(record) {
  if (!record?.blackbaud_connected) return false;
  if (record?.blackbaud_refresh_available) return true;
  if (!record?.blackbaud_connection_expires_at) return true;

  const expiresAt = new Date(record.blackbaud_connection_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function formatAccessDate(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return date.toLocaleString();
}

function getMgoReadiness(user) {
  const scopes = getScopeList(user);
  const hasBlackbaudIdentity = Boolean(
    user?.blackbaud_lookup_id || user?.blackbaud_constituent_id,
  );
  const hasRequiredScopes = scopes.includes("rnxt.r") && scopes.includes("rnxt.w");
  const hasConnection = hasUsableBlackbaudConnection(user);
  const missing = [];

  if (!user?.active) missing.push("Reactivate app user");
  if (!hasBlackbaudIdentity) missing.push("Link Blackbaud user");
  if (!user?.blackbaud_connected) missing.push("User must connect Blackbaud");
  if (user?.blackbaud_connected && !hasConnection) {
    missing.push("Reconnect Blackbaud");
  }
  if (user?.blackbaud_connected && !hasRequiredScopes) {
    missing.push("Reconnect with read/write scopes");
  }
  if (user?.blackbaud_portfolio_seed_error) {
    missing.push("Resolve portfolio sync error");
  }

  if (!user?.active) {
    return {
      label: "Inactive",
      status: "inactive",
      missing,
      scopes,
      tone: {
        backgroundColor: "#F3F4F6",
        border: "1px solid #D1D5DB",
        color: "#4B5563",
      },
    };
  }

  if (missing.length > 0) {
    return {
      label: "Needs attention",
      status: "attention",
      missing,
      scopes,
      tone: {
        backgroundColor: "#FEF2F2",
        border: "1px solid #FECACA",
        color: "#991B1B",
      },
    };
  }

  if (!user?.blackbaud_portfolio_seeded_at) {
    return {
      label: "Ready, pending sync",
      status: "pending",
      missing: ["Open dashboard or run sync once"],
      scopes,
      tone: {
        backgroundColor: "#FFFBEB",
        border: "1px solid #FDE68A",
        color: "#92400E",
      },
    };
  }

  return {
    label: "Ready",
    status: "ready",
    missing: [],
    scopes,
    tone: {
      backgroundColor: "#ECFDF5",
      border: "1px solid #A7F3D0",
      color: "#166534",
    },
  };
}

export default function AccessManagementPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [workspaceUser, setWorkspaceUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [bootstrapAdminEmail, setBootstrapAdminEmail] = useState("");
  const [bootstrapAdminEmails, setBootstrapAdminEmails] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("mgo");
  const [blackbaudQuery, setBlackbaudQuery] = useState("");
  const [blackbaudMatches, setBlackbaudMatches] = useState([]);
  const [selectedBlackbaudMatch, setSelectedBlackbaudMatch] = useState(null);
  const [searchingBlackbaud, setSearchingBlackbaud] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [userStatusView, setUserStatusView] = useState("active");
  const [revokingInvitationId, setRevokingInvitationId] = useState(null);
  const [resendingInvitationId, setResendingInvitationId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userBlackbaudQuery, setUserBlackbaudQuery] = useState("");
  const [userBlackbaudMatches, setUserBlackbaudMatches] = useState([]);
  const [selectedUserBlackbaudMatch, setSelectedUserBlackbaudMatch] = useState(null);
  const [searchingUserBlackbaud, setSearchingUserBlackbaud] = useState(false);
  const [toast, setToast] = useState(null);
  const [fyGivingDiagnostic, setFyGivingDiagnostic] = useState(null);
  const [loadingFyGivingDiagnostic, setLoadingFyGivingDiagnostic] = useState(false);
  const [fyGivingDiagnosticError, setFyGivingDiagnosticError] = useState("");

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  async function loadAccessState() {
    const [profileResponse, accessResponse] = await Promise.all([
      fetch("/api/users/profile"),
      fetch("/api/admin/access"),
    ]);

    const profileData = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok || !canManageWorkspaceRole(profileData?.user?.role)) {
      throw new Error("Forbidden — workspace administrators only");
    }

    const accessData = await accessResponse.json().catch(() => null);
    if (!accessResponse.ok) {
      throw new Error(accessData?.error || "Failed to load access management");
    }

    setProfile(profileData.user || null);
    setWorkspaceUser(profileData.workspaceUser || profileData.user || null);
    setUsers(accessData.users || []);
    setInvitations(accessData.invitations || []);
    setBootstrapAdminEmail(accessData.bootstrapAdminEmail || "");
    setBootstrapAdminEmails(
      Array.isArray(accessData.bootstrapAdminEmails)
        ? accessData.bootstrapAdminEmails
        : accessData.bootstrapAdminEmail
          ? [accessData.bootstrapAdminEmail]
          : [],
    );
  }

  async function inspectFyGivingFields() {
    setLoadingFyGivingDiagnostic(true);
    setFyGivingDiagnosticError("");

    try {
      const response = await fetch("/api/blackbaud/current-fy-giving/diagnostic");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not inspect the NXT contribution model");
      }

      setFyGivingDiagnostic(payload);
    } catch (err) {
      console.error(err);
      setFyGivingDiagnostic(null);
      setFyGivingDiagnosticError(
        err instanceof Error ? err.message : "Could not inspect the NXT contribution model",
      );
    } finally {
      setLoadingFyGivingDiagnostic(false);
    }
  }

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    (async () => {
      setProfileLoading(true);
      try {
        await loadAccessState();
      } catch (err) {
        if (!active) return;
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load access management");
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionUser]);

  useEffect(() => {
    if (!canUseMgoWorkspaceRole(role)) {
      setBlackbaudMatches([]);
      setSelectedBlackbaudMatch(null);
      return;
    }

    const query = blackbaudQuery.trim();
    if (query.length < 2) {
      setBlackbaudMatches([]);
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        setSearchingBlackbaud(true);
        const response = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(query)}`,
        );
        if (!response.ok) {
          if (active) setBlackbaudMatches([]);
          return;
        }

        const data = await response.json().catch(() => null);
        if (!active) return;

        const results = Array.isArray(data?.results) ? data.results.slice(0, 5) : [];
        setBlackbaudMatches(results);
        setSelectedBlackbaudMatch((current) =>
          results.find(
            (match) =>
              match.blackbaudConstituentId === current?.blackbaudConstituentId,
          ) || null,
        );
      } catch (err) {
        console.error(err);
        if (active) {
          setBlackbaudMatches([]);
        }
      } finally {
        if (active) {
          setSearchingBlackbaud(false);
        }
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [blackbaudQuery, role]);

  useEffect(() => {
    if (!editingUserId) {
      setUserBlackbaudMatches([]);
      setSelectedUserBlackbaudMatch(null);
      return;
    }

    const query = userBlackbaudQuery.trim();
    if (query.length < 2) {
      setUserBlackbaudMatches([]);
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        setSearchingUserBlackbaud(true);
        const response = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(query)}`,
        );
        if (!response.ok) {
          if (active) setUserBlackbaudMatches([]);
          return;
        }

        const data = await response.json().catch(() => null);
        if (!active) return;

        const results = Array.isArray(data?.results) ? data.results.slice(0, 5) : [];
        setUserBlackbaudMatches(results);
        setSelectedUserBlackbaudMatch((current) =>
          results.find(
            (match) =>
              match.blackbaudConstituentId === current?.blackbaudConstituentId,
          ) || null,
        );
      } catch (err) {
        console.error(err);
        if (active) {
          setUserBlackbaudMatches([]);
        }
      } finally {
        if (active) {
          setSearchingUserBlackbaud(false);
        }
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [editingUserId, userBlackbaudQuery]);

  const pendingInvitations = useMemo(
    () =>
      invitations.filter(
        (invitation) =>
          !invitation.accepted_at &&
          !invitation.revoked_at &&
          !invitation.existing_user_id,
      ),
    [invitations],
  );

  const activeUsers = useMemo(
    () => users.filter((user) => user.active),
    [users],
  );

  const inactiveUsers = useMemo(
    () => users.filter((user) => !user.active),
    [users],
  );

  const visibleUsers = userStatusView === "inactive" ? inactiveUsers : activeUsers;

  const mgoReadiness = useMemo(
    () =>
      activeUsers
        .filter((user) => canUseMgoWorkspaceRole(user.role))
        .map((user) => ({
          user,
          readiness: getMgoReadiness(user),
        })),
    [activeUsers],
  );

  const readinessCounts = useMemo(
    () =>
      mgoReadiness.reduce(
        (counts, entry) => {
          if (entry.readiness.status === "ready") counts.ready += 1;
          else if (entry.readiness.status === "pending") counts.pending += 1;
          else counts.needsAttention += 1;
          counts.total += 1;
          return counts;
        },
        { ready: 0, pending: 0, needsAttention: 0, total: 0 },
      ),
    [mgoReadiness],
  );

  async function handleInviteSubmit(event, options = {}) {
    event.preventDefault();
    setSaving(true);
    setStatusMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role,
          provisionOnly: options.provisionOnly === true,
          blackbaudConstituentId: canUseMgoWorkspaceRole(role)
            ? selectedBlackbaudMatch?.blackbaudConstituentId || null
            : null,
          blackbaudLookupId: canUseMgoWorkspaceRole(role)
            ? selectedBlackbaudMatch?.lookupId || null
            : null,
          blackbaudName: canUseMgoWorkspaceRole(role)
            ? selectedBlackbaudMatch?.name || null
            : null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save invitation");
      }

      setName("");
      setEmail("");
      setRole("mgo");
      setBlackbaudQuery("");
      setBlackbaudMatches([]);
      setSelectedBlackbaudMatch(null);
      setStatusMessage(
        data?.mode === "workspace-created"
          ? "MGO workspace created. You can now build out their portfolio before sending an invite."
          : data?.mode === "user-updated"
          ? "Existing user role updated."
          : "Invitation saved. The invited user can now sign in with this email to claim access.",
      );
      setToast({
        tone: "success",
        message:
          data?.mode === "workspace-created"
            ? "MGO workspace created."
            : data?.mode === "user-updated"
              ? "Existing user updated."
              : "Invitation saved.",
      });
      await loadAccessState();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to save invitation";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSwitchWorkspace(user) {
    setStatusMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/workspace-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to switch workspace view");
      }

      setWorkspaceUser(data?.actingUser || user);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("mgo-gpt:admin-view-mode", "mgo");
      }
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to switch workspace view";
      setError(message);
      setToast({ tone: "error", message });
    }
  }

  async function handleStopViewingAs() {
    setStatusMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/workspace-user", {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to return to admin view");
      }
      setWorkspaceUser(profile);
      setToast({ tone: "success", message: "Returned to admin view." });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to return to admin view";
      setError(message);
      setToast({ tone: "error", message });
    }
  }

  function getWorkspaceSeedName(record) {
    if (record?.name) return record.name;
    if (record?.blackbaud_name) return record.blackbaud_name;
    const emailValue = String(record?.email || "").trim();
    if (!emailValue.includes("@")) return emailValue || "New MGO";
    const local = emailValue.split("@")[0];
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  async function handleCreateWorkspaceFromInvitation(invitation) {
    setSaving(true);
    setStatusMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: getWorkspaceSeedName(invitation),
          email: invitation.email,
          role: invitation.role,
          provisionOnly: true,
          blackbaudConstituentId: invitation.blackbaud_constituent_id || null,
          blackbaudLookupId: invitation.blackbaud_lookup_id || null,
          blackbaudName: invitation.blackbaud_name || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to create workspace");
      }

      setStatusMessage("Workspace created from pending invitation.");
      setToast({ tone: "success", message: "Workspace created." });
      await loadAccessState();
      if (data?.user && canViewWorkspaceAsRole(profile?.role, data.user.role)) {
        await handleSwitchWorkspace(data.user);
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId, nextRole) {
    setUpdatingUserId(userId);
    setStatusMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update user role");
      }

      setUsers((current) =>
        current.map((user) => (user.id === userId ? data.user : user)),
      );
      setStatusMessage("User role updated.");
      setToast({ tone: "success", message: "User role updated." });
      await loadAccessState();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to update user role";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleRevokeInvitation(id) {
    setRevokingInvitationId(id);
    setStatusMessage("");
    setError("");

    try {
      const response = await fetch(`/api/admin/access?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to revoke invitation");
      }

      setInvitations((current) =>
        current.map((invitation) =>
          invitation.id === id
            ? { ...invitation, revoked_at: new Date().toISOString() }
            : invitation,
        ),
      );
      setStatusMessage("Invitation revoked.");
      setToast({ tone: "success", message: "Invitation revoked." });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to revoke invitation";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setRevokingInvitationId(null);
    }
  }

  async function handleResendInvitation(invitation) {
    setResendingInvitationId(invitation.id);
    setStatusMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: invitation.id,
          blackbaudConstituentId: invitation.blackbaud_constituent_id || null,
          blackbaudLookupId: invitation.blackbaud_lookup_id || null,
          blackbaudName: invitation.blackbaud_name || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to resend invitation");
      }

      setStatusMessage("Invitation refreshed and ready to resend.");
      setToast({ tone: "success", message: "Invitation refreshed." });
      await loadAccessState();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to resend invitation";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setResendingInvitationId(null);
    }
  }

  async function handleUpdateUser(user, updates) {
    setUpdatingUserId(user.id);
    setStatusMessage("");
    setError("");

    try {
      const payload = {
        userId: user.id,
        blackbaudConstituentId:
          updates.blackbaudConstituentId ?? selectedUserBlackbaudMatch?.blackbaudConstituentId ?? null,
        blackbaudLookupId:
          updates.blackbaudLookupId ?? selectedUserBlackbaudMatch?.lookupId ?? null,
      };
      if (updates.role !== undefined) {
        payload.role = updates.role;
      }
      if (updates.active !== undefined) {
        payload.active = updates.active;
      }

      const response = await fetch("/api/admin/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update user");
      }

      setUsers((current) =>
        current.map((entry) => (entry.id === user.id ? data.user : entry)),
      );
      await loadAccessState();
      setEditingUserId(null);
      setUserBlackbaudQuery("");
      setUserBlackbaudMatches([]);
      setSelectedUserBlackbaudMatch(null);
      setStatusMessage("User updated.");
      setToast({ tone: "success", message: "User updated." });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to update user";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleDeleteInactiveUser(user) {
    if (user.active) return;

    const displayName = user.name || user.email || `User ${user.id}`;
    const confirmed = window.confirm(
      `Delete ${displayName} from JUMGOGPT?\n\n` +
        "This permanently deletes only the inactive app account and its stored app connection. " +
        "It does not delete or change a Blackbaud/NXT constituent record. " +
        "Deletion is blocked if this account has any app work or audit history.",
    );
    if (!confirmed) return;

    setDeletingUserId(user.id);
    setStatusMessage("");
    setError("");

    try {
      const response = await fetch(`/api/admin/access?userId=${user.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete inactive app user");
      }

      setUsers((current) => current.filter((entry) => entry.id !== user.id));
      setEditingUserId((current) => (current === user.id ? null : current));
      setStatusMessage(`${displayName} was deleted from JUMGOGPT. No NXT record was changed.`);
      setToast({ tone: "success", message: `${displayName} was deleted from JUMGOGPT.` });
      await loadAccessState();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to delete inactive app user";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setDeletingUserId(null);
    }
  }

  if (loading || !sessionUser || profileLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          backgroundColor: "#F9FAFB",
          color: "#6B7280",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!canManageWorkspaceRole(profile?.role)) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#F9FAFB", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <main style={{ maxWidth: "760px", margin: "0 auto", padding: "24px 18px 48px" }}>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "#6A5BFF",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "18px",
            }}
          >
            <ArrowLeft size={16} />
            Back to dashboard
          </a>
          <div style={cardStyle}>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800, color: "#111827" }}>
              Access Management
            </h1>
            <p style={{ margin: "12px 0 0", color: "#6B7280" }}>
              This page is available to workspace administrators only.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F9FAFB", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "24px 18px 48px" }}>
        {toast ? (
          <div
            style={{
              position: "fixed",
              right: "24px",
              bottom: "24px",
              zIndex: 30,
              maxWidth: "320px",
              padding: "14px 16px",
              borderRadius: "14px",
              border:
                toast.tone === "success" ? "1px solid #86EFAC" : "1px solid #FCA5A5",
              backgroundColor:
                toast.tone === "success" ? "rgba(236,253,245,0.98)" : "rgba(254,242,242,0.98)",
              color: toast.tone === "success" ? "#166534" : "#991B1B",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.14)",
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            {toast.message}
          </div>
        ) : null}

        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: "#6A5BFF",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "18px",
          }}
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </a>

        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>
            Access Management
          </h1>
          <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.6 }}>
            Invite JU users into the app as MGOs, Executives, Advancement Services team members, or Admins. The bootstrap admin account is
            controlled by the environment and can always regain access.
          </p>
          {bootstrapAdminEmails.length > 0 || bootstrapAdminEmail ? (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 14px",
                borderRadius: "10px",
                backgroundColor: "#EEF2FF",
                border: "1px solid #C7D2FE",
                color: "#3730A3",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Bootstrap admin{bootstrapAdminEmails.length === 1 ? "" : "s"}:{" "}
              {(bootstrapAdminEmails.length > 0
                ? bootstrapAdminEmails
                : [bootstrapAdminEmail]
              ).join(", ")}
            </div>
          ) : null}
          {workspaceUser && profile && workspaceUser.id !== profile.id ? (
            <div
              style={{
                marginTop: "12px",
                padding: "12px 14px",
                borderRadius: "10px",
                backgroundColor: "#ECFEFF",
                border: "1px solid #A5F3FC",
                color: "#155E75",
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <span>
                Currently viewing as {workspaceUser.name} ({workspaceUser.email})
              </span>
              <button
                type="button"
                onClick={handleStopViewingAs}
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1px solid #67E8F9",
                  backgroundColor: "white",
                  color: "#0F766E",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Return to admin view
              </button>
            </div>
          ) : null}
        </div>

        {statusMessage ? (
          <div style={{ ...cardStyle, marginBottom: "12px", padding: "14px 18px", backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontWeight: 600 }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>Saved</div>
            {statusMessage}
          </div>
        ) : null}
        {error ? (
          <div style={{ ...cardStyle, marginBottom: "12px", padding: "14px 18px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontWeight: 600 }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>Action needed</div>
            {error}
          </div>
        ) : null}

        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", color: "#111827" }}>
                MGO readiness
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.5 }}>
                Confirm each active MGO has app access, a linked NXT record, their own Blackbaud connection, required scopes, and a clean portfolio sync state.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadAccessState()}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #D1D5DB",
                backgroundColor: "white",
                color: "#111827",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            {[
              ["Active MGOs", readinessCounts.total],
              ["Ready", readinessCounts.ready],
              ["Pending sync", readinessCounts.pending],
              ["Needs attention", readinessCounts.needsAttention],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "12px",
                  padding: "12px",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {label}
                </div>
                <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 900, color: "#111827" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {mgoReadiness.length === 0 ? (
            <div style={{ color: "#6B7280", fontSize: "14px" }}>
              No MGO users yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {mgoReadiness.map(({ user, readiness }) => (
                <div
                  key={`readiness-${user.id}`}
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: "14px",
                    padding: "16px",
                    backgroundColor: "white",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 800, color: "#111827" }}>
                        {user.name || user.email}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                        {user.email}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 800,
                        ...readiness.tone,
                      }}
                    >
                      {readiness.label}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div style={{ borderRadius: "12px", border: "1px solid #E5E7EB", padding: "12px", backgroundColor: "#F9FAFB" }}>
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        NXT identity
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "13px", color: user.blackbaud_lookup_id || user.blackbaud_constituent_id ? "#166534" : "#991B1B", fontWeight: 700 }}>
                        {user.blackbaud_lookup_id
                          ? `Lookup ID ${user.blackbaud_lookup_id}`
                          : user.blackbaud_constituent_id
                            ? "Internal Blackbaud ID linked"
                            : "Not linked"}
                      </div>
                    </div>
                    <div style={{ borderRadius: "12px", border: "1px solid #E5E7EB", padding: "12px", backgroundColor: "#F9FAFB" }}>
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Blackbaud connection
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "13px", color: hasUsableBlackbaudConnection(user) ? "#166534" : "#991B1B", fontWeight: 700 }}>
                        {hasUsableBlackbaudConnection(user) ? "Connected" : "Needs connection"}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#6B7280" }}>
                        Scopes: {readiness.scopes.length > 0 ? readiness.scopes.join(", ") : "None"}
                      </div>
                    </div>
                    <div style={{ borderRadius: "12px", border: "1px solid #E5E7EB", padding: "12px", backgroundColor: "#F9FAFB" }}>
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Portfolio sync
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "13px", color: user.blackbaud_portfolio_seed_error ? "#991B1B" : user.blackbaud_portfolio_seeded_at ? "#166534" : "#92400E", fontWeight: 700 }}>
                        {user.blackbaud_portfolio_seed_error
                          ? "Sync error"
                          : user.blackbaud_portfolio_seeded_at
                            ? "Seeded"
                            : "Not seeded yet"}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#6B7280" }}>
                        Last attempt: {formatAccessDate(user.blackbaud_portfolio_seed_attempted_at)}
                      </div>
                    </div>
                    <div style={{ borderRadius: "12px", border: "1px solid #E5E7EB", padding: "12px", backgroundColor: "#F9FAFB" }}>
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Next step
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "13px", color: readiness.missing.length > 0 ? "#991B1B" : "#166534", fontWeight: 700 }}>
                        {readiness.missing.length > 0 ? readiness.missing.join("; ") : "No action needed"}
                      </div>
                    </div>
                  </div>

                  {user.blackbaud_portfolio_seed_error ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        backgroundColor: "#FEF2F2",
                        border: "1px solid #FECACA",
                        color: "#991B1B",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      Sync error: {user.blackbaud_portfolio_seed_error}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", color: "#111827" }}>
                NXT FY giving diagnostics
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.5 }}>
                Inspect the supported contribution fields before enabling recipient-side soft-credit giving totals. This reads field metadata only; it does not load or change constituent data.
              </p>
            </div>
            <button
              type="button"
              onClick={inspectFyGivingFields}
              disabled={loadingFyGivingDiagnostic}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #D1D5DB",
                backgroundColor: "white",
                color: "#111827",
                fontWeight: 700,
                cursor: loadingFyGivingDiagnostic ? "wait" : "pointer",
                opacity: loadingFyGivingDiagnostic ? 0.65 : 1,
              }}
            >
              {loadingFyGivingDiagnostic ? "Inspecting..." : "Inspect contribution fields"}
            </button>
          </div>

          {fyGivingDiagnosticError ? (
            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                borderRadius: "10px",
                backgroundColor: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              {fyGivingDiagnosticError}
            </div>
          ) : null}

          {fyGivingDiagnostic ? (
            <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
              <div style={{ fontSize: "13px", color: "#374151" }}>
                Contribution model: {fyGivingDiagnostic.availableDataModels?.includes("contribution") ? "available" : "not available"}
              </div>
              {fyGivingDiagnostic.contributionFields?.length ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "8px",
                  }}
                >
                  {fyGivingDiagnostic.contributionFields.map((field) => (
                    <div
                      key={`${field.fieldId || "field"}-${field.displayName || "name"}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid #E5E7EB",
                        backgroundColor: "#F9FAFB",
                      }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#111827" }}>
                        {field.displayName || field.fieldId}
                      </div>
                      {field.fieldId && field.displayName ? (
                        <div style={{ marginTop: "3px", fontSize: "12px", color: "#6B7280", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          {field.fieldId}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#6B7280", fontSize: "13px" }}>
                  No relevant contribution fields were returned by NXT.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <form onSubmit={handleInviteSubmit} style={cardStyle}>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#111827" }}>
            Create or invite a user
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr", gap: "12px", alignItems: "end" }}>
            <div>
              <label htmlFor="access-management-name" style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Name
              </label>
              <input
                id="access-management-name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Jane Dolphin"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="access-management-email" style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Email
              </label>
              <input
                id="access-management-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@ju.edu"
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label htmlFor="access-management-role" style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Role
              </label>
              <select id="access-management-role" name="role" value={role} onChange={(event) => setRole(event.target.value)} style={inputStyle}>
                <option value="mgo">MGO</option>
                <option value="executive">Executive</option>
                <option value="advancement_services">Advancement Services</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {canUseMgoWorkspaceRole(role) ? (
            <div style={{ marginTop: "16px" }}>
              <label htmlFor="access-management-blackbaud-query" style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Connect to Blackbaud user
              </label>
              <input
                id="access-management-blackbaud-query"
                name="blackbaudQuery"
                type="text"
                value={blackbaudQuery}
                onChange={(event) => {
                  setBlackbaudQuery(event.target.value);
                  setSelectedBlackbaudMatch(null);
                }}
                placeholder="Search by name or Lookup ID"
                style={inputStyle}
              />
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#6B7280" }}>
                Link the invited MGO or Executive to their Raiser's Edge NXT record so their MGO workspace uses the right user.
              </div>
              {searchingBlackbaud ? (
                <div style={{ marginTop: "10px", fontSize: "13px", color: "#6B7280" }}>
                  Searching Blackbaud...
                </div>
              ) : null}
              {blackbaudMatches.length > 0 ? (
                <div
                  style={{
                    marginTop: "12px",
                    display: "grid",
                    gap: "8px",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #E5E7EB",
                    backgroundColor: "#F9FAFB",
                  }}
                >
                  {blackbaudMatches.map((match) => {
                    const selected =
                      selectedBlackbaudMatch?.blackbaudConstituentId ===
                      match.blackbaudConstituentId;
                    return (
                      <button
                        key={match.blackbaudConstituentId || match.lookupId || match.name}
                        type="button"
                        onClick={() => setSelectedBlackbaudMatch(match)}
                        style={{
                          textAlign: "left",
                          borderRadius: "10px",
                          border: selected ? "2px solid #6A5BFF" : "1px solid #E5E7EB",
                          backgroundColor: selected ? "#EEF2FF" : "white",
                          padding: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                          {match.name || "Unnamed constituent"}
                        </div>
                        {match.lookupId ? (
                          <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                            Lookup ID: {match.lookupId}
                          </div>
                        ) : null}
                        {match.email ? (
                          <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                            {match.email}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {selectedBlackbaudMatch ? (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    backgroundColor: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    color: "#065F46",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  Connected to {selectedBlackbaudMatch.name}
                  {selectedBlackbaudMatch.lookupId
                    ? ` (Lookup ID: ${selectedBlackbaudMatch.lookupId})`
                    : ""}
                </div>
              ) : null}
            </div>
          ) : null}
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
            {canUseMgoWorkspaceRole(role) ? (
              <button
                type="button"
                onClick={(event) => handleInviteSubmit(event, { provisionOnly: true })}
                disabled={saving || !name.trim() || !email.trim()}
                style={{
                  padding: "11px 16px",
                  borderRadius: "10px",
                  border: "1px solid #C7D2FE",
                  backgroundColor: "white",
                  color: "#4338CA",
                  fontWeight: 700,
                  cursor:
                    saving || !name.trim() || !email.trim() ? "not-allowed" : "pointer",
                }}
              >
                {saving
                  ? "Saving..."
                  : `Create ${role === "executive" ? "Executive" : "MGO"} workspace`}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "11px 16px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "#6A5BFF",
                color: "white",
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save invite"}
            </button>
          </div>
        </form>

        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "14px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", color: "#111827" }}>
                App users
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.5 }}>
                Active users can sign in. Inactive accounts are retained for history and can be safely removed only when they have no app work or audit records.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                ["active", `Active (${activeUsers.length})`],
                ["inactive", `Inactive (${inactiveUsers.length})`],
              ].map(([value, label]) => {
                const selected = userStatusView === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setUserStatusView(value)}
                    aria-pressed={selected}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "999px",
                      border: selected ? "1px solid #6A5BFF" : "1px solid #D1D5DB",
                      backgroundColor: selected ? "#EEF2FF" : "white",
                      color: selected ? "#4338CA" : "#374151",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {visibleUsers.length === 0 ? (
            <div style={{ color: "#6B7280", fontSize: "14px" }}>
              {userStatusView === "inactive" ? "No inactive app users." : "No active app users."}
            </div>
          ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {visibleUsers.map((user) => {
              const normalizedUserEmail = String(user.email || "").trim().toLowerCase();
              const isBootstrapAdmin =
                bootstrapAdminEmails.includes(normalizedUserEmail) ||
                (bootstrapAdminEmail && normalizedUserEmail === bootstrapAdminEmail);
              const blackbaudLink = getBlackbaudLinkMeta(user);
              return (
                <div
                  key={user.id}
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: "12px",
                    padding: "16px",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          marginBottom: "10px",
                          ...blackbaudLink.tone,
                        }}
                      >
                        {blackbaudLink.label}
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>{user.name}</div>
                      <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>{user.email}</div>
                      <div style={{ fontSize: "12px", color: user.active ? "#6B7280" : "#B91C1C", marginTop: "6px", fontWeight: 600 }}>
                        {user.active ? "Active" : "Deactivated"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "6px" }}>
                        {blackbaudLink.detail}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "8px" }}>
                        Joined {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: "10px", justifyItems: "end" }}>
                      {isBootstrapAdmin ? (
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#4338CA" }}>Bootstrap admin</div>
                      ) : (
                        <select
                          id={`access-management-user-role-${user.id}`}
                          name={`userRole-${user.id}`}
                          value={user.role}
                          onChange={(event) => handleRoleChange(user.id, event.target.value)}
                          disabled={updatingUserId === user.id}
                          style={{ ...inputStyle, minWidth: "180px" }}
                        >
                          <option value="mgo">MGO</option>
                          <option value="executive">Executive</option>
                          <option value="advancement_services">Advancement Services</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {canViewWorkspaceAsRole(profile?.role, user.role) ? (
                          <button
                            type="button"
                            onClick={() => handleSwitchWorkspace(user)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "10px",
                              border: "1px solid #C7D2FE",
                              backgroundColor: "#EEF2FF",
                              color: "#4338CA",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Open workspace
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId((current) => (current === user.id ? null : user.id));
                            setUserBlackbaudQuery("");
                            setUserBlackbaudMatches([]);
                            setSelectedUserBlackbaudMatch(null);
                          }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "10px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            color: "#111827",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {editingUserId === user.id ? "Close edit" : "Edit"}
                        </button>
                        {!user.active && !isBootstrapAdmin && user.id !== profile?.id ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteInactiveUser(user)}
                            disabled={deletingUserId === user.id}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "10px",
                              border: "1px solid #FCA5A5",
                              backgroundColor: "white",
                              color: "#B91C1C",
                              fontWeight: 700,
                              cursor: deletingUserId === user.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {deletingUserId === user.id ? "Deleting..." : "Delete app user"}
                          </button>
                        ) : null}
                        {isBootstrapAdmin ? null : (
                          <button
                            type="button"
                            onClick={() => handleUpdateUser(user, { active: !user.active })}
                            disabled={updatingUserId === user.id}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "10px",
                              border: user.active ? "1px solid #FCA5A5" : "1px solid #86EFAC",
                              backgroundColor: "white",
                              color: user.active ? "#B91C1C" : "#166534",
                              fontWeight: 700,
                              cursor: updatingUserId === user.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {user.active ? "Deactivate" : "Reactivate"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {editingUserId === user.id ? (
                    <div
                      style={{
                        border: "1px solid #E5E7EB",
                        borderRadius: "12px",
                        padding: "16px",
                        backgroundColor: "#F9FAFB",
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
                        Edit {user.name}
                      </div>
                      {canUseMgoWorkspaceRole(user.role) ? (
                        <div
                          style={{
                            marginBottom: "12px",
                            padding: "12px 14px",
                            borderRadius: "10px",
                            backgroundColor: "#EEF2FF",
                            border: "1px solid #C7D2FE",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ fontSize: "13px", color: "#4338CA", lineHeight: 1.5 }}>
                            Link this person's NXT identity and prepare their MGO workspace before they sign in.
                          </div>
                          {canViewWorkspaceAsRole(profile?.role, user.role) ? (<button
                            type="button"
                            onClick={() => handleSwitchWorkspace(user)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "10px",
                              border: "1px solid #A5B4FC",
                              backgroundColor: "white",
                              color: "#4338CA",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Open workspace
                          </button>) : null}
                        </div>
                      ) : null}
                      <label htmlFor={`access-management-user-blackbaud-query-${user.id}`} style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                        Connect to Blackbaud user
                      </label>
                      <input
                        id={`access-management-user-blackbaud-query-${user.id}`}
                        name={`userBlackbaudQuery-${user.id}`}
                        type="text"
                        value={userBlackbaudQuery}
                        onChange={(event) => {
                          setUserBlackbaudQuery(event.target.value);
                          setSelectedUserBlackbaudMatch(null);
                        }}
                        placeholder="Search by name or Lookup ID"
                        style={inputStyle}
                      />
                      {searchingUserBlackbaud ? (
                        <div style={{ marginTop: "10px", fontSize: "13px", color: "#6B7280" }}>
                          Searching Blackbaud...
                        </div>
                      ) : null}
                      {userBlackbaudMatches.length > 0 ? (
                        <div
                          style={{
                            marginTop: "12px",
                            display: "grid",
                            gap: "8px",
                          }}
                        >
                          {userBlackbaudMatches.map((match) => {
                            const selected =
                              selectedUserBlackbaudMatch?.blackbaudConstituentId ===
                              match.blackbaudConstituentId;
                            return (
                              <button
                                key={match.blackbaudConstituentId || match.lookupId || match.name}
                                type="button"
                                onClick={() => setSelectedUserBlackbaudMatch(match)}
                                style={{
                                  textAlign: "left",
                                  borderRadius: "10px",
                                  border: selected ? "2px solid #6A5BFF" : "1px solid #E5E7EB",
                                  backgroundColor: selected ? "#EEF2FF" : "white",
                                  padding: "12px",
                                  cursor: "pointer",
                                }}
                              >
                                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                                  {match.name || "Unnamed constituent"}
                                </div>
                                {match.lookupId ? (
                                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                    Lookup ID: {match.lookupId}
                                  </div>
                                ) : null}
                                {match.email ? (
                                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                                    {match.email}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      <div style={{ marginTop: "12px", fontSize: "13px", color: "#6B7280" }}>
                        Current Lookup ID: {user.blackbaud_lookup_id || "Not linked"}
                      </div>
                      <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(null);
                            setUserBlackbaudQuery("");
                            setUserBlackbaudMatches([]);
                            setSelectedUserBlackbaudMatch(null);
                          }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "10px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            color: "#111827",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateUser(user, {
                              blackbaudConstituentId:
                                selectedUserBlackbaudMatch?.blackbaudConstituentId || null,
                              blackbaudLookupId:
                                selectedUserBlackbaudMatch?.lookupId || null,
                            })
                          }
                          disabled={updatingUserId === user.id || !selectedUserBlackbaudMatch}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "10px",
                            border: "none",
                            backgroundColor: "#6A5BFF",
                            color: "white",
                            fontWeight: 700,
                            cursor:
                              updatingUserId === user.id || !selectedUserBlackbaudMatch
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          Save Blackbaud link
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#111827" }}>
            Pending invitations
          </h2>
          {pendingInvitations.length === 0 ? (
            <div style={{ color: "#6B7280", fontSize: "14px" }}>
              No pending invitations.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {pendingInvitations.map((invitation) => {
                const blackbaudLink = getBlackbaudLinkMeta(invitation);
                return (
                  <div
                    key={invitation.id}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "12px",
                      padding: "16px",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          marginBottom: "10px",
                          ...blackbaudLink.tone,
                        }}
                      >
                        {blackbaudLink.label}
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>{invitation.email}</div>
                      <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "6px" }}>
                        Role: {getWorkspaceRoleLabel(invitation.role)}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "6px" }}>
                        {blackbaudLink.detail}
                        {invitation.blackbaud_name ? ` (${invitation.blackbaud_name})` : ""}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "6px" }}>
                        Invited {new Date(invitation.created_at).toLocaleString()}
                        {invitation.invited_by_name
                          ? ` by ${invitation.invited_by_name}`
                          : ""}
                      </div>
                      {invitation.existing_user_id ? (
                        <div style={{ fontSize: "12px", color: "#4338CA", marginTop: "8px", fontWeight: 700 }}>
                          Workspace ready as {invitation.existing_user_name || invitation.email}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {canUseMgoWorkspaceRole(invitation.role) ? (
                        invitation.existing_user_id ? (
                          canViewWorkspaceAsRole(profile?.role, invitation.role) ? (<button
                            type="button"
                            onClick={() =>
                              handleSwitchWorkspace({
                                id: invitation.existing_user_id,
                                name: invitation.existing_user_name || getWorkspaceSeedName(invitation),
                                email: invitation.email,
                                role: "mgo",
                              })
                            }
                            style={{
                              padding: "10px 14px",
                              borderRadius: "10px",
                              border: "1px solid #C7D2FE",
                              backgroundColor: "#EEF2FF",
                              color: "#4338CA",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Open workspace
                          </button>) : null
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCreateWorkspaceFromInvitation(invitation)}
                            disabled={saving}
                            style={{
                              padding: "10px 14px",
                              borderRadius: "10px",
                              border: "1px solid #C7D2FE",
                              backgroundColor: "#EEF2FF",
                              color: "#4338CA",
                              fontWeight: 700,
                              cursor: saving ? "not-allowed" : "pointer",
                            }}
                          >
                            {saving ? "Creating..." : "Create workspace"}
                          </button>
                        )
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleResendInvitation(invitation)}
                        disabled={resendingInvitationId === invitation.id}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid #BFDBFE",
                          backgroundColor: "white",
                          color: "#1D4ED8",
                          fontWeight: 700,
                          cursor: resendingInvitationId === invitation.id ? "not-allowed" : "pointer",
                        }}
                      >
                        {resendingInvitationId === invitation.id ? "Refreshing..." : "Re-send"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeInvitation(invitation.id)}
                        disabled={revokingInvitationId === invitation.id}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid #FCA5A5",
                          backgroundColor: "white",
                          color: "#B91C1C",
                          fontWeight: 700,
                          cursor: revokingInvitationId === invitation.id ? "not-allowed" : "pointer",
                        }}
                      >
                        {revokingInvitationId === invitation.id ? "Revoking..." : "Revoke"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

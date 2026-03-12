"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";
import { isAdminRole } from "@/utils/workspaceRoles";

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

export default function AccessManagementPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [bootstrapAdminEmail, setBootstrapAdminEmail] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("mgo");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [revokingInvitationId, setRevokingInvitationId] = useState(null);

  async function loadAccessState() {
    const [profileResponse, accessResponse] = await Promise.all([
      fetch("/api/users/profile"),
      fetch("/api/admin/access"),
    ]);

    const profileData = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok || !isAdminRole(profileData?.user?.role)) {
      throw new Error("Forbidden — admins only");
    }

    const accessData = await accessResponse.json().catch(() => null);
    if (!accessResponse.ok) {
      throw new Error(accessData?.error || "Failed to load access management");
    }

    setProfile(profileData.user || null);
    setUsers(accessData.users || []);
    setInvitations(accessData.invitations || []);
    setBootstrapAdminEmail(accessData.bootstrapAdminEmail || "");
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

  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => !invitation.accepted_at && !invitation.revoked_at),
    [invitations],
  );

  async function handleInviteSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setStatusMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save invitation");
      }

      setEmail("");
      setRole("mgo");
      setStatusMessage(
        data?.mode === "user-updated"
          ? "Existing user role updated."
          : "Invitation saved. The invited user can now sign in with this email to claim access.",
      );
      await loadAccessState();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save invitation");
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
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to update user role");
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
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to revoke invitation");
    } finally {
      setRevokingInvitationId(null);
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

  if (!isAdminRole(profile?.role)) {
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
            Invite JU users into the app as MGOs or Advancement Services reviewers. The bootstrap admin account is
            controlled by the environment and can always regain access.
          </p>
          {bootstrapAdminEmail ? (
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
              Bootstrap admin: {bootstrapAdminEmail}
            </div>
          ) : null}
        </div>

        {statusMessage ? (
          <div style={{ ...cardStyle, marginBottom: "12px", padding: "14px 18px", backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontWeight: 600 }}>
            {statusMessage}
          </div>
        ) : null}
        {error ? (
          <div style={{ ...cardStyle, marginBottom: "12px", padding: "14px 18px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontWeight: 600 }}>
            {error}
          </div>
        ) : null}

        <form onSubmit={handleInviteSubmit} style={cardStyle}>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#111827" }}>
            Invite a user
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "12px", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@ju.edu"
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>
                Role
              </label>
              <select value={role} onChange={(event) => setRole(event.target.value)} style={inputStyle}>
                <option value="mgo">MGO</option>
                <option value="reviewer">Advancement Services</option>
              </select>
            </div>
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
          <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#111827" }}>
            Active users
          </h2>
          <div style={{ display: "grid", gap: "12px" }}>
            {users.map((user) => {
              const isBootstrapAdmin = bootstrapAdminEmail && user.email === bootstrapAdminEmail;
              return (
                <div
                  key={user.id}
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
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>{user.name}</div>
                    <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>{user.email}</div>
                    <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "8px" }}>
                      Joined {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {isBootstrapAdmin ? (
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#4338CA" }}>Bootstrap admin</div>
                  ) : (
                    <select
                      value={user.role}
                      onChange={(event) => handleRoleChange(user.id, event.target.value)}
                      disabled={updatingUserId === user.id}
                      style={{ ...inputStyle, minWidth: "180px" }}
                    >
                      <option value="mgo">MGO</option>
                      <option value="reviewer">Advancement Services</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
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
              {pendingInvitations.map((invitation) => (
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
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>{invitation.email}</div>
                    <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "6px" }}>
                      Role: {invitation.role === "reviewer" ? "Advancement Services" : "MGO"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "6px" }}>
                      Invited {new Date(invitation.created_at).toLocaleString()}
                      {invitation.invited_by_name
                        ? ` by ${invitation.invited_by_name}`
                        : ""}
                    </div>
                  </div>
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
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

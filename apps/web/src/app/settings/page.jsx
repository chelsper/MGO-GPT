"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import useUser from "@/utils/useUser";
import { canManageWorkspaceRole, getWorkspaceRoleLabel } from "@/utils/workspaceRoles";

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #D1D5DB",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const cardStyle = {
  backgroundColor: "white",
  borderRadius: "16px",
  border: "1px solid #E5E7EB",
  padding: "24px",
  marginBottom: "20px",
};

function Notice({ tone = "info", children }) {
  const tones = {
    info: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" },
    success: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#065F46" },
    error: { backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" },
  };
  const colors = tones[tone] || tones.info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        padding: "12px 14px",
        borderRadius: "10px",
        border: `1px solid ${colors.borderColor}`,
        backgroundColor: colors.backgroundColor,
        color: colors.color,
        fontSize: "14px",
        fontWeight: 600,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Detail({ label, children }) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <span style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{ color: "#111827", fontSize: "15px", fontWeight: 700, overflowWrap: "anywhere" }}>
        {children}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [authentication, setAuthentication] = useState(null);
  const [portfolioSyncEligible, setPortfolioSyncEligible] = useState(false);
  const [blackbaudStatus, setBlackbaudStatus] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [syncingPortfolio, setSyncingPortfolio] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  async function loadAccount({ showPageLoading = true } = {}) {
    if (showPageLoading) setProfileLoading(true);
    setConnectionLoading(true);
    setProfileError("");
    setConnectionError("");

    try {
      const [profileResponse, connectionResponse] = await Promise.all([
        fetch("/api/users/profile", { cache: "no-store" }),
        fetch("/api/blackbaud/status", { cache: "no-store" }),
      ]);
      const profileData = await profileResponse.json().catch(() => null);
      const connectionData = await connectionResponse.json().catch(() => null);

      if (!profileResponse.ok) {
        throw new Error(profileData?.error || "Could not load your account details.");
      }

      setProfile(profileData?.user || null);
      setAuthentication(profileData?.authentication || null);
      setPortfolioSyncEligible(profileData?.portfolioSyncEligible === true);
      setName(profileData?.user?.name || "");
      setEmail(profileData?.user?.email || sessionUser?.email || "");

      if (!connectionResponse.ok) {
        setConnectionError(connectionData?.error || "Could not load Blackbaud connection status.");
      } else {
        setBlackbaudStatus(connectionData || null);
      }
    } catch (error) {
      console.error(error);
      setProfileError(error instanceof Error ? error.message : "Could not load your account details.");
    } finally {
      if (showPageLoading) setProfileLoading(false);
      setConnectionLoading(false);
    }
  }

  useEffect(() => {
    if (!sessionUser) return;
    loadAccount();
  }, [sessionUser]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setSavingProfile(true);

    try {
      const response = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to update profile");

      setProfile(data.user || null);
      setProfileSuccess("Profile updated successfully.");
    } catch (error) {
      console.error(error);
      setProfileError(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to change password");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated successfully.");
    } catch (error) {
      console.error(error);
      setPasswordError(error instanceof Error ? error.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handlePortfolioSync() {
    setSyncMessage("");
    setConnectionError("");
    setSyncingPortfolio(true);

    try {
      const response = await fetch("/api/users/profile?bootstrapPortfolio=1", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Could not sync your portfolio.");

      const portfolioSync = data?.portfolioSync;
      if (portfolioSync?.error) throw new Error(portfolioSync.error);
      if (portfolioSync?.skippedReason === "blackbaud-not-connected") {
        setSyncMessage("Connect Blackbaud NXT before syncing your assigned portfolio.");
      } else if (portfolioSync?.skippedReason === "recent-attempt") {
        setSyncMessage("Your portfolio was recently checked. No additional sync was needed.");
      } else if (portfolioSync?.skippedReason === "workspace-not-syncable") {
        setSyncMessage("Portfolio sync is available to MGO workspaces.");
      } else {
        const assigned = portfolioSync?.result?.assignedCount;
        setSyncMessage(
          typeof assigned === "number"
            ? `Portfolio sync complete. ${assigned} assigned prospect${assigned === 1 ? "" : "s"} found.`
            : "Portfolio sync complete.",
        );
      }
      setProfile(data?.user || profile);
    } catch (error) {
      console.error(error);
      setConnectionError(error instanceof Error ? error.message : "Could not sync your portfolio.");
    } finally {
      setSyncingPortfolio(false);
    }
  }

  if (loading || !sessionUser || profileLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", backgroundColor: "#F9FAFB", color: "#6B7280", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        Loading...
      </div>
    );
  }

  const isSsoManaged = authentication?.isSsoManaged === true;
  const canEditProfile = authentication?.canEditProfile === true;
  const canChangePassword = authentication?.canChangePassword === true;
  const canManageWorkspace = canManageWorkspaceRole(profile?.role);
  const canSyncPortfolio = portfolioSyncEligible;
  const connectionConfigured = blackbaudStatus?.configured !== false;
  const connectedScopes = blackbaudStatus?.connectedScopes || [];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F9FAFB", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "24px 18px 48px" }}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#6A5BFF", textDecoration: "none", fontSize: "14px", fontWeight: 600, marginBottom: "18px" }}>
          <ArrowLeft size={16} />
          Back to dashboard
        </a>

        <section style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>My Account &amp; Connections</h1>
          <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.6 }}>
            Review the identity and connections JUMGOGPT uses to access your workspace and Raiser's Edge NXT.
          </p>
        </section>

        {profileError ? <Notice tone="error">{profileError}</Notice> : null}

        <section style={cardStyle}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <ShieldCheck size={22} color="#4338CA" />
            <div>
              <h2 style={{ margin: 0, fontSize: "19px", color: "#111827" }}>Workspace identity</h2>
              <p style={{ margin: "4px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.45 }}>
                This identity controls your workspace access and is separate from Blackbaud authorization.
              </p>
            </div>
          </div>
          <div style={{ marginTop: "18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
            <Detail label="Name">{profile?.name || sessionUser?.name || "Not available"}</Detail>
            <Detail label="Email">{profile?.email || sessionUser?.email || "Not available"}</Detail>
            <Detail label="Workspace role">{getWorkspaceRoleLabel(profile?.role)}</Detail>
          </div>
          {isSsoManaged ? (
            <div style={{ marginTop: "18px" }}>
              <Notice>
                Your sign-in is managed by Jacksonville University Okta. To correct your name, email, or password, use your university account process. Workspace roles are changed by an administrator.
              </Notice>
            </div>
          ) : (
            <p style={{ margin: "18px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.45 }}>
              This is a direct JUMGOGPT account. You can update the profile details below.
            </p>
          )}
          {canManageWorkspace ? (
            <a href="/access-management" style={{ display: "inline-flex", marginTop: "16px", color: "#4338CA", fontWeight: 800, textDecoration: "none" }}>
              Manage workspace access
            </a>
          ) : null}
        </section>

        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "start" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "19px", color: "#111827" }}>Blackbaud NXT connection</h2>
              <p style={{ margin: "5px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.45, maxWidth: "520px" }}>
                This personal authorization lets JUMGOGPT load and update the NXT data that your Blackbaud permissions allow.
              </p>
            </div>
            <button type="button" onClick={() => loadAccount({ showPageLoading: false })} disabled={connectionLoading} style={{ border: "1px solid #C7D2FE", borderRadius: "999px", backgroundColor: "#EEF2FF", color: "#4338CA", padding: "9px 12px", fontWeight: 800, cursor: connectionLoading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: "7px" }}>
              <RefreshCw size={15} />
              Refresh status
            </button>
          </div>

          {connectionError ? <div style={{ marginTop: "16px" }}><Notice tone="error">{connectionError}</Notice></div> : null}
          {connectionLoading ? (
            <p style={{ margin: "18px 0 0", color: "#6B7280" }}>Checking Blackbaud connection...</p>
          ) : !connectionConfigured ? (
            <div style={{ marginTop: "16px" }}>
              <Notice tone="error">Blackbaud configuration needs attention: {(blackbaudStatus?.configIssues || []).join(" ") || "Missing configuration."}</Notice>
            </div>
          ) : blackbaudStatus?.connected ? (
            <div style={{ marginTop: "18px", display: "grid", gap: "14px" }}>
              <Notice tone="success">Connected to Blackbaud NXT.</Notice>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
                <Detail label="Connected">{formatDateTime(blackbaudStatus.connectedAt)}</Detail>
                <Detail label="Authorization expires">{formatDateTime(blackbaudStatus.expiresAt)}</Detail>
              </div>
              <div>
                <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>Granted scopes</div>
                <div style={{ marginTop: "7px", display: "flex", gap: "7px", flexWrap: "wrap" }}>
                  {connectedScopes.length ? connectedScopes.map((scope) => (
                    <span key={scope} style={{ border: "1px solid #BFDBFE", borderRadius: "999px", backgroundColor: "#EFF6FF", color: "#1D4ED8", padding: "5px 9px", fontSize: "12px", fontWeight: 800 }}>{scope}</span>
                  )) : <span style={{ color: "#6B7280" }}>No scopes reported.</span>}
                </div>
              </div>
              <a href="/api/blackbaud/connect?redirect=%2Fsettings" style={{ justifySelf: "start", display: "inline-flex", border: "1px solid #4338CA", borderRadius: "999px", color: "#4338CA", textDecoration: "none", padding: "10px 14px", fontWeight: 800 }}>
                Reconnect Blackbaud NXT
              </a>
            </div>
          ) : (
            <div style={{ marginTop: "18px", display: "grid", gap: "14px", justifyItems: "start" }}>
              <Notice tone="error">Blackbaud NXT is not connected for this account.</Notice>
              <a href="/api/blackbaud/connect?redirect=%2Fsettings" style={{ display: "inline-flex", border: "none", borderRadius: "999px", backgroundColor: "#4338CA", color: "white", textDecoration: "none", padding: "11px 15px", fontWeight: 800 }}>
                Connect Blackbaud NXT
              </a>
            </div>
          )}
        </section>

        {canSyncPortfolio ? (
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: "19px", color: "#111827" }}>My portfolio</h2>
            <p style={{ margin: "5px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.45 }}>
              Refresh your JUMGOGPT portfolio from the solicitor assignments available through your Blackbaud NXT connection.
            </p>
            {syncMessage ? <div style={{ marginTop: "16px" }}><Notice tone="success">{syncMessage}</Notice></div> : null}
            <button type="button" onClick={handlePortfolioSync} disabled={syncingPortfolio || !blackbaudStatus?.connected} style={{ marginTop: "16px", border: "1px solid #047857", borderRadius: "999px", backgroundColor: syncingPortfolio || !blackbaudStatus?.connected ? "#D1FAE5" : "#047857", color: syncingPortfolio || !blackbaudStatus?.connected ? "#047857" : "white", padding: "10px 14px", fontWeight: 800, cursor: syncingPortfolio || !blackbaudStatus?.connected ? "not-allowed" : "pointer" }}>
              {syncingPortfolio ? "Syncing portfolio..." : "Sync my portfolio"}
            </button>
            {!blackbaudStatus?.connected ? <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "13px" }}>Connect Blackbaud NXT above before syncing.</p> : null}
          </section>
        ) : null}

        {canEditProfile ? (
          <form onSubmit={handleProfileSubmit} style={cardStyle}>
            <h2 style={{ margin: "0 0 16px", fontSize: "19px", color: "#111827" }}>Direct account profile</h2>
            {profileSuccess ? <div style={{ marginBottom: "16px" }}><Notice tone="success">{profileSuccess}</Notice></div> : null}
            <label htmlFor="settings-profile-name" style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Name</label>
            <input id="settings-profile-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} style={{ ...inputStyle, marginBottom: "16px" }} />
            <label htmlFor="settings-profile-email" style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Email</label>
            <input id="settings-profile-email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" style={inputStyle} />
            <button type="submit" disabled={savingProfile} style={{ marginTop: "18px", width: "100%", padding: "14px", backgroundColor: savingProfile ? "#9CA3AF" : "#6A5BFF", color: "white", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: 600, cursor: savingProfile ? "not-allowed" : "pointer" }}>
              {savingProfile ? "Saving profile..." : "Save profile"}
            </button>
          </form>
        ) : null}

        {canChangePassword ? (
          <form onSubmit={handlePasswordSubmit} style={cardStyle}>
            <h2 style={{ margin: "0 0 16px", fontSize: "19px", color: "#111827" }}>Password</h2>
            {passwordSuccess ? <div style={{ marginBottom: "16px" }}><Notice tone="success">{passwordSuccess}</Notice></div> : null}
            {passwordError ? <div style={{ marginBottom: "16px" }}><Notice tone="error">{passwordError}</Notice></div> : null}
            <label htmlFor="settings-current-password" style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Current password</label>
            <input id="settings-current-password" name="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} style={{ ...inputStyle, marginBottom: "16px" }} />
            <label htmlFor="settings-new-password" style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>New password</label>
            <input id="settings-new-password" name="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} style={{ ...inputStyle, marginBottom: "16px" }} />
            <label htmlFor="settings-confirm-password" style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Confirm new password</label>
            <input id="settings-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} style={inputStyle} />
            <button type="submit" disabled={changingPassword} style={{ marginTop: "18px", width: "100%", padding: "14px", backgroundColor: changingPassword ? "#9CA3AF" : "#111827", color: "white", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: 600, cursor: changingPassword ? "not-allowed" : "pointer" }}>
              {changingPassword ? "Updating password..." : "Change password"}
            </button>
          </form>
        ) : null}
      </main>
    </div>
  );
}

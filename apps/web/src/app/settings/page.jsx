"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";

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
  borderRadius: "12px",
  border: "1px solid #E5E7EB",
  padding: "24px",
  marginBottom: "20px",
};

export default function SettingsPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    async function loadProfile() {
      setProfileLoading(true);
      try {
        const response = await fetch("/api/users/profile");
        if (!response.ok) {
          throw new Error("Failed to load settings");
        }
        const data = await response.json();
        if (!active) return;
        setProfile(data.user || null);
        setName(data.user?.name || "");
        setEmail(data.user?.email || sessionUser?.email || "");
      } catch (error) {
        if (active) {
          console.error(error);
          setProfileError("Could not load your settings.");
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
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
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update profile");
      }

      setProfile(data.user || null);
      setProfileSuccess(
        data?.requiresReauth
          ? "Profile updated. Sign out and sign back in if you changed your email."
          : "Profile updated successfully.",
      );
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
      if (!response.ok) {
        throw new Error(data?.error || "Failed to change password");
      }

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

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#F9FAFB",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <main style={{ maxWidth: "700px", margin: "0 auto", padding: "24px 18px 48px" }}>
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
            Settings
          </h1>
          <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.6 }}>
            Update your profile, manage your password, and review your account role.
          </p>
        </div>

        <form onSubmit={handleProfileSubmit} style={cardStyle}>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#111827" }}>
            Profile
          </h2>

          {profileSuccess ? (
            <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontSize: "14px", fontWeight: 600 }}>
              {profileSuccess}
            </div>
          ) : null}
          {profileError ? (
            <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: "14px", fontWeight: 600 }}>
              {profileError}
            </div>
          ) : null}

          <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
            Name
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: "16px" }} />

          <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
            Email
          </label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={{ ...inputStyle, marginBottom: "16px" }} />

          <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
            Role
          </label>
          <input value={profile?.role || "mgo"} readOnly style={{ ...inputStyle, backgroundColor: "#F9FAFB", color: "#6B7280" }} />

          <button
            type="submit"
            disabled={savingProfile}
            style={{
              marginTop: "18px",
              width: "100%",
              padding: "14px",
              backgroundColor: savingProfile ? "#9CA3AF" : "#6A5BFF",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: savingProfile ? "not-allowed" : "pointer",
            }}
          >
            {savingProfile ? "Saving profile..." : "Save profile"}
          </button>
        </form>

        <form onSubmit={handlePasswordSubmit} style={cardStyle}>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px", color: "#111827" }}>
            Password
          </h2>

          {passwordSuccess ? (
            <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontSize: "14px", fontWeight: 600 }}>
              {passwordSuccess}
            </div>
          ) : null}
          {passwordError ? (
            <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: "14px", fontWeight: 600 }}>
              {passwordError}
            </div>
          ) : null}

          <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
            Current password
          </label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={{ ...inputStyle, marginBottom: "16px" }} />

          <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
            New password
          </label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ ...inputStyle, marginBottom: "16px" }} />

          <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
            Confirm new password
          </label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />

          <button
            type="submit"
            disabled={changingPassword}
            style={{
              marginTop: "18px",
              width: "100%",
              padding: "14px",
              backgroundColor: changingPassword ? "#9CA3AF" : "#111827",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: changingPassword ? "not-allowed" : "pointer",
            }}
          >
            {changingPassword ? "Updating password..." : "Change password"}
          </button>
        </form>
      </main>
    </div>
  );
}

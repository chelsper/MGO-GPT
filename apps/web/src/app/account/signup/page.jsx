"use client";

import { useEffect, useState } from "react";
import useAuth from "@/utils/useAuth";

export default function SignUpPage() {
  const { signUpWithCredentials } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [credentialsEnabled, setCredentialsEnabled] = useState(true);
  const callbackUrl = "/";

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((providers) => {
        setCredentialsEnabled(Boolean(providers?.["credentials-signup"]));
      })
      .catch(() => {
        setCredentialsEnabled(true);
      });
  }, []);

  const validatePassword = (password) => {
    if (password.length < 8) {
      return "Password must be at least 8 characters";
    }
    if (!/[a-zA-Z]/.test(password)) {
      return "Password must contain at least one letter";
    }
    if (!/[0-9]/.test(password)) {
      return "Password must contain at least one number";
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);

    try {
      const result = await signUpWithCredentials({
        email,
        password,
        name,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        const errorMessages = {
          CredentialsSignin:
            "Invalid email or password. If you already have an account, try signing in instead.",
          EmailCreateAccount:
            "This email can't be used. It may already be registered.",
          AccessDenied: "You don't have permission to sign up.",
          Configuration: "There is a problem with the server configuration.",
        };
        setError(
          errorMessages[result.error] || "Something went wrong. Please try again.",
        );
        setLoading(false);
        return;
      }

      window.location.href = result?.url || callbackUrl;
    } catch (err) {
      const errorMessages = {
        CredentialsSignin:
          "Invalid email or password. If you already have an account, try signing in instead.",
        EmailCreateAccount:
          "This email can't be used. It may already be registered.",
      };
      setError(
        errorMessages[err.message] || "Something went wrong. Please try again.",
      );
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f9fafb",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "32px",
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            fontWeight: "bold",
            marginBottom: "24px",
            textAlign: "center",
            color: "#111827",
          }}
        >
          Create Account
        </h1>

        {error && (
          <div
            style={{
              padding: "12px",
              marginBottom: "16px",
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {credentialsEnabled ? (
          <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                marginBottom: "8px",
                color: "#374151",
              }}
            >
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
              }}
              placeholder="Sarah Johnson"
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                marginBottom: "8px",
                color: "#374151",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
              }}
              placeholder="you@university.edu"
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                marginBottom: "8px",
                color: "#374151",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
              }}
              placeholder="Min 8 chars, 1 letter, 1 number"
            />
            <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
              Must be at least 8 characters with 1 letter and 1 number
            </p>
          </div>

          <div
            style={{
              marginBottom: "24px",
              padding: "12px",
              borderRadius: "8px",
              backgroundColor: "#F9FAFB",
              border: "1px solid #E5E7EB",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "4px",
              }}
            >
              New accounts are created as Major Gift Officer (MGO)
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#6B7280",
                lineHeight: 1.5,
              }}
            >
              Advancement Services reviewer access is assigned separately by an administrator.
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: loading ? "#9ca3af" : "#6A5BFF",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
          </form>
        ) : (
          <div
            style={{
              padding: "14px",
              borderRadius: "8px",
              backgroundColor: "#F9FAFB",
              border: "1px solid #E5E7EB",
              fontSize: "14px",
              color: "#4B5563",
              lineHeight: 1.6,
            }}
          >
            Self-service signup is disabled for this workspace. Use Jacksonville University SSO or contact an administrator for access.
          </div>
        )}

        <p
          style={{
            marginTop: "24px",
            textAlign: "center",
            fontSize: "14px",
            color: "#6b7280",
          }}
        >
          Already have an account?{" "}
          <a
            href={`/account/signin${typeof window !== "undefined" ? window.location.search : ""}`}
            style={{
              color: "#6A5BFF",
              fontWeight: "500",
              textDecoration: "none",
            }}
          >
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

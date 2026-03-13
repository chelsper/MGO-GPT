"use client";

import { useState, useEffect } from "react";
import useAuth from "@/utils/useAuth";
import { isAllowedWorkspaceEmail, workspaceEmailAccessMessage } from "@/utils/authDomain";

const ACCESS_DENIED_MESSAGE =
  "You don't have access to this workspace yet. Use a ju.edu email address and ask an administrator for an invitation.";

export default function SignInPage() {
  const { signInWithCredentials, signInWithOkta } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [oktaEnabled, setOktaEnabled] = useState(false);
  const [credentialsEnabled, setCredentialsEnabled] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const msg = params.get("message");
      if (msg) {
        setMessage(msg);
      }
      const urlError = params.get("error");
      if (urlError) {
        const errorMessages = {
          CredentialsSignin: "Incorrect email or password. Try again.",
          AccessDenied: ACCESS_DENIED_MESSAGE,
          Configuration: "There is a problem with the server configuration.",
        };
        setError(
          errorMessages[urlError] || "Something went wrong. Please try again.",
        );
      }

      fetch("/api/auth/providers")
        .then((res) => (res.ok ? res.json() : null))
        .then((providers) => {
          if (providers?.okta) {
            setOktaEnabled(true);
          }
          setCredentialsEnabled(Boolean(providers?.["credentials-signin"]));
        })
        .catch(() => {
          setOktaEnabled(false);
          setCredentialsEnabled(true);
        });

      fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((session) => {
          if (session?.user) {
            window.location.replace("/");
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    if (!email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    if (!isAllowedWorkspaceEmail(email)) {
      setError(workspaceEmailAccessMessage());
      setLoading(false);
      return;
    }

    try {
      const result = await signInWithCredentials({
        email,
        password,
        callbackUrl: "/",
        redirect: false,
      });

      if (result?.error) {
        const errorMessages = {
          CredentialsSignin: "Incorrect email or password. Try again.",
          AccessDenied: ACCESS_DENIED_MESSAGE,
          Configuration: "There is a problem with the server configuration.",
        };
        setError(
          errorMessages[result.error] ||
            "Incorrect email or password. Try again.",
        );
        setLoading(false);
        return;
      }

      window.location.href = result?.url || "/";
    } catch (err) {
      console.error("Sign in error:", err);
      const errorMessages = {
        CredentialsSignin: "Incorrect email or password. Try again.",
        AccessDenied: ACCESS_DENIED_MESSAGE,
        Configuration: "There is a problem with the server configuration.",
      };
      setError(
        errorMessages[err.message] || "Incorrect email or password. Try again.",
      );
      setLoading(false);
    }
  };

  const handleOktaSignIn = async () => {
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await signInWithOkta({
        callbackUrl: "/",
        redirect: true,
      });
    } catch (err) {
      console.error("Okta sign in error:", err);
      setError("Unable to start Okta sign-in. Please try again.");
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
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <img
            src="https://ucarecdn.com/8291db54-6f2a-43f4-9fc2-e6ced1ab623d/-/format/auto/"
            alt="MGO-GPT Logo"
            style={{ width: "120px", height: "auto", margin: "0 auto 16px" }}
          />
          <h1
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: "#111827",
            }}
          >
            MGO-GPT
          </h1>
          <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "8px" }}>
            Access is limited to Jacksonville University email addresses.
          </p>
        </div>

        {message && (
          <div
            style={{
              padding: "12px",
              marginBottom: "16px",
              backgroundColor: "#d1fae5",
              color: "#065f46",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          >
            {message}
          </div>
        )}

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

        <form onSubmit={handleSubmit}>
          {oktaEnabled ? (
            <>
              <button
                type="button"
                onClick={handleOktaSignIn}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "#111827",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: loading ? "not-allowed" : "pointer",
                  marginBottom: "16px",
                }}
              >
                Continue with Jacksonville University SSO
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ flex: 1, height: "1px", backgroundColor: "#E5E7EB" }} />
                <span style={{ fontSize: "12px", color: "#6B7280", fontWeight: "600" }}>
                  OR
                </span>
                <div style={{ flex: 1, height: "1px", backgroundColor: "#E5E7EB" }} />
              </div>
            </>
          ) : null}

          {credentialsEnabled ? (
            <>
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
                    boxSizing: "border-box",
                  }}
                  placeholder="you@university.edu"
                />
              </div>

              <div style={{ marginBottom: "8px" }}>
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
                    boxSizing: "border-box",
                  }}
                  placeholder="Enter your password"
                />
              </div>

              <div style={{ textAlign: "right", marginBottom: "24px" }}>
                <a
                  href="/forgot-password"
                  style={{
                    fontSize: "13px",
                    color: "#6A5BFF",
                    textDecoration: "none",
                    fontWeight: "500",
                  }}
                >
                  Forgot password?
                </a>
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
                {loading ? "Signing In..." : "Sign In"}
              </button>
            </>
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
              Password sign-in is disabled for this workspace. Use Jacksonville University SSO to continue.
            </div>
          )}
        </form>

        {credentialsEnabled ? (
          <p
            style={{
              marginTop: "24px",
              textAlign: "center",
              fontSize: "14px",
              color: "#6b7280",
            }}
          >
            Don't have an account?{" "}
            <a
              href={`/account/signup${typeof window !== "undefined" ? window.location.search : ""}`}
              style={{
                color: "#6A5BFF",
                fontWeight: "500",
                textDecoration: "none",
              }}
            >
              Sign up
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import useUser from "@/utils/useUser";

export default function CompleteSignupPage() {
  const { data: user, loading } = useUser();
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const completeSignup = async () => {
      if (loading || !user || completing) return;

      setCompleting(true);

      try {
        const response = await fetch("/api/users/complete-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: user.name,
            email: user.email,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to complete signup");
        }

        // Clear pending data
        // Redirect to home
        window.location.href = "/";
      } catch (err) {
        console.error("Complete signup error:", err);
        setError("Failed to complete signup. Please try refreshing the page.");
        setCompleting(false);
      }
    };

    completeSignup();
  }, [user, loading, completing]);

  if (error) {
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
            padding: "24px",
            backgroundColor: "white",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#991b1b", marginBottom: "16px" }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              backgroundColor: "#6A5BFF",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

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
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "4px solid #e5e7eb",
            borderTopColor: "#6A5BFF",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 16px",
          }}
        ></div>
        <p style={{ color: "#6b7280" }}>Completing setup...</p>
        <style jsx global>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

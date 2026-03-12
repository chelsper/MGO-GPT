"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";
import { isReviewerRole } from "@/utils/workspaceRoles";

function prettySections(sections) {
  try {
    return JSON.stringify(sections || {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function KnowledgeBaseManagePage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [sectionsJson, setSectionsJson] = useState("{}");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    async function load() {
      setLoadingData(true);
      try {
        const [profileResponse, articlesResponse] = await Promise.all([
          fetch("/api/users/profile"),
          fetch("/api/knowledge-base"),
        ]);

        if (!profileResponse.ok) {
          throw new Error("Failed to load profile");
        }
        const profileData = await profileResponse.json();
        if (!isReviewerRole(profileData?.user?.role)) {
          window.location.href = "/";
          return;
        }
        if (!articlesResponse.ok) {
          throw new Error("Failed to load knowledge base");
        }
        const articleData = await articlesResponse.json();
        if (active) {
          setProfile(profileData.user);
          setArticles(Array.isArray(articleData?.articles) ? articleData.articles : []);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError(err.message || "Could not load knowledge base.");
        }
      } finally {
        if (active) {
          setLoadingData(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [sessionUser]);

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === selectedId) || null,
    [articles, selectedId],
  );

  useEffect(() => {
    if (!articles.length || selectedArticle) return;

    const firstArticle = articles[0];
    setSelectedId(firstArticle.id);
    setTitle(firstArticle.title || "");
    setSummary(firstArticle.summary || "");
    setTags((firstArticle.tags || []).join(", "));
    setSectionsJson(prettySections(firstArticle.sections));
  }, [articles, selectedArticle]);

  function loadArticle(article) {
    setSelectedId(article.id);
    setTitle(article.title || "");
    setSummary(article.summary || "");
    setTags((article.tags || []).join(", "));
    setSectionsJson(prettySections(article.sections));
    setError("");
    setMessage("");
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      let parsedSections;
      try {
        parsedSections = JSON.parse(sectionsJson);
      } catch {
        throw new Error("Sections must be valid JSON.");
      }

      const response = await fetch("/api/knowledge-base", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: selectedId,
          title,
          summary,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          sections: parsedSections,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to save knowledge base article");
      }

      const refreshed = await fetch("/api/knowledge-base");
      const refreshedArticles = await refreshed.json();
      setArticles(Array.isArray(refreshedArticles?.articles) ? refreshedArticles.articles : []);
      setMessage("Knowledge base article updated.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not save article.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingData || !profile) {
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
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 18px 48px" }}>
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

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "18px",
            border: "1px solid #E5E7EB",
            padding: "24px",
            marginBottom: "18px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>
            Knowledge Base Manager
          </h1>
          <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.6 }}>
            Reviewers can update article content here. Changes are stored as overrides so the reader experience stays stable.
          </p>
        </div>

        {message ? (
          <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "12px", backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontSize: "14px", fontWeight: 600 }}>
            {message}
          </div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "12px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: "14px", fontWeight: 600 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: "16px", alignItems: "start" }}>
          <aside
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              border: "1px solid #E5E7EB",
              padding: "14px",
              display: "grid",
              gap: "8px",
            }}
          >
            {articles.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => loadArticle(article)}
                style={{
                  textAlign: "left",
                  borderRadius: "12px",
                  border: selectedId === article.id ? "2px solid #6A5BFF" : "1px solid #E5E7EB",
                  backgroundColor: selectedId === article.id ? "#F5F3FF" : "white",
                  padding: "12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
                  {article.title}
                </div>
                <div style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.45 }}>
                  {article.summary}
                </div>
              </button>
            ))}
          </aside>

          <form
            onSubmit={handleSave}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              border: "1px solid #E5E7EB",
              padding: "20px",
            }}
          >
            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                  Title
                </label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  style={{ width: "100%", padding: "11px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "14px", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                  Summary
                </label>
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: "11px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "14px", resize: "vertical", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                  Tags
                </label>
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="Comma-separated tags"
                  style={{ width: "100%", padding: "11px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "14px", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                  Sections JSON
                </label>
                <textarea
                  value={sectionsJson}
                  onChange={(event) => setSectionsJson(event.target.value)}
                  rows={18}
                  style={{ width: "100%", padding: "11px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "13px", resize: "vertical", boxSizing: "border-box", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                />
              </div>

              <button
                type="submit"
                disabled={saving || !selectedId}
                style={{
                  padding: "11px 14px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "#6A5BFF",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: saving ? "wait" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving..." : "Save article"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Plus, Save, Send, Trash2 } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";

function cloneArticle(article) {
  return JSON.parse(JSON.stringify(article));
}

function normalizeItems(text) {
  return String(text || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function itemsToText(items) {
  return Array.isArray(items) ? items.join("\n") : "";
}

function Badge({ children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "5px 10px",
        fontSize: "12px",
        fontWeight: 700,
        backgroundColor: "#EEF2FF",
        color: "#4338CA",
      }}
    >
      {children}
    </span>
  );
}

function BlockEditor({ block, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: "16px",
        padding: "16px",
        display: "grid",
        gap: "12px",
        backgroundColor: "#FAFAFB",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Badge>{block.type}</Badge>
          <input
            value={block.title || ""}
            onChange={(event) => onChange({ ...block, title: event.target.value })}
            placeholder="Section title"
            style={{
              border: "none",
              backgroundColor: "transparent",
              fontSize: "15px",
              fontWeight: 700,
              color: "#111827",
              minWidth: "240px",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" disabled={!canMoveUp} onClick={onMoveUp} style={miniButtonStyle}>
            Up
          </button>
          <button type="button" disabled={!canMoveDown} onClick={onMoveDown} style={miniButtonStyle}>
            Down
          </button>
          <button type="button" onClick={onRemove} style={{ ...miniButtonStyle, color: "#991B1B" }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {block.type === "text" ? (
        <textarea
          value={block.text || ""}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
          rows={5}
          placeholder="Write this section in plain language."
          style={textareaStyle}
        />
      ) : null}

      {block.type === "list" || block.type === "steps" ? (
        <textarea
          value={itemsToText(block.items)}
          onChange={(event) => onChange({ ...block, items: normalizeItems(event.target.value) })}
          rows={6}
          placeholder="One item per line"
          style={textareaStyle}
        />
      ) : null}

      {block.type === "examples" ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {(block.items || []).map((example, index) => (
            <div
              key={example.id || index}
              style={{ border: "1px solid #E5E7EB", borderRadius: "12px", padding: "12px", backgroundColor: "white" }}
            >
              <input
                value={example.title || ""}
                onChange={(event) => {
                  const nextItems = [...(block.items || [])];
                  nextItems[index] = { ...example, title: event.target.value };
                  onChange({ ...block, items: nextItems });
                }}
                placeholder="Example title"
                style={{ ...inputStyle, marginBottom: "8px" }}
              />
              <textarea
                value={example.content || ""}
                onChange={(event) => {
                  const nextItems = [...(block.items || [])];
                  nextItems[index] = { ...example, content: event.target.value };
                  onChange({ ...block, items: nextItems });
                }}
                rows={4}
                placeholder="Example details"
                style={textareaStyle}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...block,
                items: [...(block.items || []), { id: `example-${Date.now()}`, title: "", content: "" }],
              })
            }
            style={secondaryButtonStyle}
          >
            <Plus size={14} />
            Add example
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PreviewBlock({ block }) {
  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: "16px",
        padding: "18px",
        backgroundColor: "white",
      }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
        <Badge>{block.type}</Badge>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#111827" }}>{block.title || "Untitled section"}</div>
      </div>
      {block.type === "text" ? (
        <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{block.text || "No content yet."}</div>
      ) : null}
      {(block.type === "list" || block.type === "steps") && (
        <ol style={{ margin: 0, paddingLeft: "18px", color: "#374151", lineHeight: 1.75 }}>
          {(block.items || []).map((item, index) => (
            <li key={`${block.id}-${index}`} style={{ marginBottom: "8px" }}>
              {item}
            </li>
          ))}
        </ol>
      )}
      {block.type === "examples" ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {(block.items || []).map((item, index) => (
            <div key={item.id || index} style={{ border: "1px solid #E5E7EB", borderRadius: "12px", padding: "12px", backgroundColor: "#F9FAFB" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>{item.title || "Untitled example"}</div>
              <div style={{ fontSize: "14px", color: "#4B5563", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{item.content || "No details yet."}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PreviewField({ label, value, multiline = false }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "grid", gap: "6px" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.75, whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value}</div>
    </div>
  );
}

function PreviewListField({ label, value }) {
  if (!value?.length) return null;
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {value.map((item, index) => (
          <Badge key={`${label}-${index}`}>{item}</Badge>
        ))}
      </div>
    </div>
  );
}

function RevisionSnapshotSummary({ revision }) {
  const snapshot = revision?.snapshot || {};
  const after = snapshot.after || snapshot;
  const before = snapshot.before || null;
  const title = after.title || before?.title || "Untitled article";
  const status = after.status || before?.status || null;
  const summary = after.summary || before?.summary || "";
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
        <div style={{ fontSize: "14px", fontWeight: 800, color: "#111827" }}>{title}</div>
        {status ? <Badge>{status}</Badge> : null}
      </div>
      {summary ? <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.6 }}>{summary}</div> : null}
      <div style={{ fontSize: "12px", color: "#6B7280" }}>
        {revision.action} {revision.createdAt ? `• ${revision.createdAt}` : ""}
        {revision.createdBy?.name ? ` • ${revision.createdBy.name}` : ""}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: "10px",
  border: "1px solid #D1D5DB",
  fontSize: "14px",
  boxSizing: "border-box",
  backgroundColor: "white",
};

const textareaStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: "10px",
  border: "1px solid #D1D5DB",
  fontSize: "14px",
  boxSizing: "border-box",
  resize: "vertical",
  fontFamily: "inherit",
  backgroundColor: "white",
};

const miniButtonStyle = {
  borderRadius: "10px",
  border: "1px solid #D1D5DB",
  backgroundColor: "white",
  padding: "8px 10px",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
};

const secondaryButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "12px",
  border: "1px solid #D1D5DB",
  backgroundColor: "white",
  padding: "10px 12px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

const articleTypeLabels = {
  procedure: "Procedure",
  policy: "Policy",
  process: "Process",
  system: "System",
  glossary: "Glossary",
  troubleshooting: "Troubleshooting",
  reference: "Reference",
};

function buildDraftFromArticle(article) {
  return {
    articleId: article.id,
    title: article.title || "",
    summary: article.summary || "",
    categoryId: article.categoryId || "",
    articleType: article.articleType || "procedure",
    status: article.status || "draft",
    tagsText: (article.tags || []).join(", "),
    relatedArticleIds: article.relatedArticleIds || [],
    relatedSystemIds: article.relatedSystemIds || [],
    relatedProcessIds: article.relatedProcessIds || [],
    relatedRequestLinks: article.relatedRequestLinks || [],
    ownerUserId: article.owner?.id || "",
    reviewerUserId: article.reviewer?.id || "",
    lastReviewedAt: article.lastReviewed || "",
    featured: Boolean(article.featured),
    templateKey: article.templateKey || "",
    fields: {
      ...article.fields,
      whenThisAppliesText: itemsToText(article.fields.whenThisApplies),
      inputsText: itemsToText(article.fields.inputs),
      stepsText: itemsToText(article.fields.steps),
      systemsUsedText: itemsToText(article.fields.systemsUsed),
      relatedSystemsText: itemsToText(article.fields.relatedSystems),
      relatedProcessesText: itemsToText(article.fields.relatedProcesses),
      relatedReportsText: itemsToText(article.fields.relatedReports),
      relatedProceduresText: itemsToText(article.fields.relatedProcedures),
      dataCreatedOrUpdatedText: itemsToText(article.fields.dataCreatedOrUpdated),
      responsibleRolesText: itemsToText(article.fields.responsibleRoles),
      outputsText: itemsToText(article.fields.outputs),
      risksCommonFailurePointsText: itemsToText(article.fields.risksCommonFailurePoints),
      whoUsesItText: itemsToText(article.fields.whoUsesIt),
      dataLivesThereText: itemsToText(article.fields.dataLivesThere),
      sourceOfTruthNotesText: itemsToText(article.fields.sourceOfTruthNotes),
      commonIssuesText: itemsToText(article.fields.commonIssues),
    },
    contentBlocks: cloneArticle(article.contentBlocks || []),
  };
}

function serializeDraft(draft) {
  return {
    articleId: draft.articleId,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    categoryId: draft.categoryId,
    articleType: draft.articleType,
    status: draft.status,
    tags: normalizeItems(String(draft.tagsText || "").replace(/,/g, "\n")),
    relatedArticleIds: draft.relatedArticleIds,
    relatedSystemIds: draft.relatedSystemIds,
    relatedProcessIds: draft.relatedProcessIds,
    relatedRequestLinks: draft.relatedRequestLinks.filter((link) => link.label?.trim()),
    ownerUserId: draft.ownerUserId || null,
    reviewerUserId: draft.reviewerUserId || null,
    lastReviewedAt: draft.lastReviewedAt || null,
    featured: draft.featured,
    templateKey: draft.templateKey || null,
    fields: {
      purpose: draft.fields.purpose || "",
      whenThisApplies: normalizeItems(draft.fields.whenThisAppliesText),
      trigger: draft.fields.trigger || "",
      inputs: normalizeItems(draft.fields.inputsText),
      steps: normalizeItems(draft.fields.stepsText),
      systemsUsed: normalizeItems(draft.fields.systemsUsedText),
      relatedSystems: normalizeItems(draft.fields.relatedSystemsText),
      relatedProcesses: normalizeItems(draft.fields.relatedProcessesText),
      relatedReports: normalizeItems(draft.fields.relatedReportsText),
      relatedProcedures: normalizeItems(draft.fields.relatedProceduresText),
      relatedRequestLinks: draft.relatedRequestLinks.filter((link) => link.label?.trim()),
      dataCreatedOrUpdated: normalizeItems(draft.fields.dataCreatedOrUpdatedText),
      responsibleRoles: normalizeItems(draft.fields.responsibleRolesText),
      outputs: normalizeItems(draft.fields.outputsText),
      risksCommonFailurePoints: normalizeItems(draft.fields.risksCommonFailurePointsText),
      whoUsesIt: normalizeItems(draft.fields.whoUsesItText),
      dataLivesThere: normalizeItems(draft.fields.dataLivesThereText),
      sourceOfTruthNotes: normalizeItems(draft.fields.sourceOfTruthNotesText),
      commonIssues: normalizeItems(draft.fields.commonIssuesText),
      escalationContact: draft.fields.escalationContact || "",
      definition: draft.fields.definition || "",
      nxtTerminology: draft.fields.nxtTerminology || "",
      ownerNotes: draft.fields.ownerNotes || "",
    },
    contentBlocks: draft.contentBlocks,
  };
}

function SearchPicker({ label, options, selectedIds, onChange }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((option) => {
      if (selectedIds.includes(option.id)) return false;
      if (!normalized) return true;
      return `${option.title} ${option.summary || ""}`.toLowerCase().includes(normalized);
    });
  }, [options, query, selectedIds]);

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <label style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} style={inputStyle} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {selectedIds.map((id) => {
          const option = options.find((item) => item.id === id);
          if (!option) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(selectedIds.filter((item) => item !== id))}
              style={{ ...secondaryButtonStyle, padding: "8px 10px" }}
            >
              {option.title} ×
            </button>
          );
        })}
      </div>
      <div style={{ maxHeight: "180px", overflow: "auto", display: "grid", gap: "8px" }}>
        {filtered.slice(0, 8).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange([...selectedIds, option.id])}
            style={{
              border: "1px solid #E5E7EB",
              borderRadius: "12px",
              backgroundColor: "white",
              padding: "10px 12px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{option.title}</div>
            {option.summary ? (
              <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>{option.summary}</div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function KnowledgeBaseManagePage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTemplateKey, setNewTemplateKey] = useState("procedure");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { isReviewerView, isAdmin } = useWorkspaceView(profile?.role);

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;
    let active = true;
    async function load() {
      const [profileResponse, kbResponse] = await Promise.all([
        fetch("/api/users/profile"),
        fetch("/api/knowledge-base?manage=1"),
      ]);
      const profilePayload = await profileResponse.json();
      const kbPayload = await kbResponse.json();
      if (!active) return;
      setProfile(profilePayload.user || null);
      setData(kbPayload);
      const firstArticle = kbPayload.articles?.[0];
      if (firstArticle) {
        setSelectedId(firstArticle.id);
        setDraft(buildDraftFromArticle(firstArticle));
      }
      if (kbPayload.categories?.length) {
        setNewCategoryId(kbPayload.categories[0].id);
      }
    }
    load().catch((loadError) => {
      console.error(loadError);
      setError("Could not load knowledge base manager.");
    });
    return () => {
      active = false;
    };
  }, [sessionUser]);

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const canEdit = isReviewerView || isAdmin;

  const articles = data?.articles || [];
  const templates = data?.templates || [];
  const categories = data?.categories || [];
  const articleTypes = data?.articleTypes || [];
  const users = data?.editorOptions?.users || [];
  const revisionsByArticle = data?.editorOptions?.revisionsByArticle || {};
  const selectedRevisions = revisionsByArticle[selectedId] || [];

  const relatedArticleOptions = useMemo(
    () => articles.map((article) => ({ id: article.id, title: article.title, summary: article.summary })),
    [articles],
  );
  const systemOptions = useMemo(
    () => (data?.systems || []).map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    [data],
  );
  const processOptions = useMemo(
    () => (data?.processes || []).map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    [data],
  );

  function loadArticle(articleId) {
    const article = articles.find((item) => item.id === articleId);
    if (!article) return;
    if (hasUnsavedChanges && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    setSelectedId(articleId);
    setDraft(buildDraftFromArticle(article));
    setHasUnsavedChanges(false);
    setMessage("");
    setError("");
    setPreviewMode(false);
  }

  function updateDraft(updater) {
    setDraft((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return next;
    });
    setHasUnsavedChanges(true);
    setMessage("");
  }

  async function saveDraft(status) {
    if (!draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = { ...serializeDraft(draft), status };
      const method = articles.some((article) => article.id === draft.articleId) ? "PATCH" : "POST";
      const response = await fetch("/api/knowledge-base", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Failed to save article");
      }

      const refreshed = await fetch("/api/knowledge-base?manage=1");
      const refreshedPayload = await refreshed.json();
      setData(refreshedPayload);
      const refreshedArticle = refreshedPayload.articles.find((article) => article.id === draft.articleId);
      if (refreshedArticle) {
        setDraft(buildDraftFromArticle(refreshedArticle));
        setSelectedId(refreshedArticle.id);
      }
      setHasUnsavedChanges(false);
      setMessage(status === "published" ? "Article published." : "Draft saved.");
    } catch (saveError) {
      console.error(saveError);
      setError(saveError.message || "Failed to save article.");
    } finally {
      setSaving(false);
    }
  }

  function createNewDraft() {
    const template = templates.find((item) => item.key === newTemplateKey) || templates[0];
    if (!template) return;
    if (hasUnsavedChanges && !window.confirm("Discard unsaved changes and start a new article?")) {
      return;
    }
    const articleId = `${template.articleType}-${Date.now()}`;
    const nextDraft = {
      articleId,
      title: "",
      summary: "",
      categoryId: newCategoryId || categories[0]?.id || "",
      articleType: template.articleType,
      status: "draft",
      tagsText: "",
      relatedArticleIds: [],
      relatedSystemIds: [],
      relatedProcessIds: [],
      relatedRequestLinks: [],
      ownerUserId: "",
      reviewerUserId: "",
      lastReviewedAt: "",
      featured: false,
      templateKey: template.key,
      fields: {
        purpose: template.fields.purpose || "",
        whenThisAppliesText: itemsToText(template.fields.whenThisApplies),
        trigger: template.fields.trigger || "",
        inputsText: itemsToText(template.fields.inputs),
        stepsText: itemsToText(template.fields.steps),
        systemsUsedText: itemsToText(template.fields.systemsUsed),
        relatedSystemsText: itemsToText(template.fields.relatedSystems),
        relatedProcessesText: itemsToText(template.fields.relatedProcesses),
        relatedReportsText: itemsToText(template.fields.relatedReports),
        relatedProceduresText: itemsToText(template.fields.relatedProcedures),
        dataCreatedOrUpdatedText: itemsToText(template.fields.dataCreatedOrUpdated),
        responsibleRolesText: itemsToText(template.fields.responsibleRoles),
        outputsText: itemsToText(template.fields.outputs),
        risksCommonFailurePointsText: itemsToText(template.fields.risksCommonFailurePoints),
        whoUsesItText: itemsToText(template.fields.whoUsesIt),
        dataLivesThereText: itemsToText(template.fields.dataLivesThere),
        sourceOfTruthNotesText: itemsToText(template.fields.sourceOfTruthNotes),
        commonIssuesText: itemsToText(template.fields.commonIssues),
        escalationContact: template.fields.escalationContact || "",
        definition: template.fields.definition || "",
        nxtTerminology: template.fields.nxtTerminology || "",
        ownerNotes: template.fields.ownerNotes || "",
      },
      contentBlocks: cloneArticle(template.contentBlocks),
    };
    setCreating(false);
    setSelectedId(articleId);
    setDraft(nextDraft);
    setHasUnsavedChanges(true);
    setPreviewMode(false);
    setMessage("");
    setError("");
  }

  if (loading || !profile || !data || !draft) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          backgroundColor: "#F7F8FC",
          color: "#6B7280",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        Loading Knowledge Base Manager...
      </div>
    );
  }

  if (!canEdit) {
    window.location.href = "/";
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #F5F7FB 0%, #F9FAFB 240px, #F9FAFB 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <main style={{ maxWidth: "1480px", margin: "0 auto", padding: "24px 20px 60px" }}>
        <a
          href="/knowledge-base"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: "#4338CA",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 700,
            marginBottom: "18px",
          }}
        >
          <ArrowLeft size={16} />
          Back to Knowledge Base
        </a>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "340px minmax(0, 1fr)",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <aside
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "18px",
              padding: "16px",
              display: "grid",
              gap: "14px",
              position: "sticky",
              top: "24px",
            }}
          >
            <div>
              <div style={{ fontSize: "26px", fontWeight: 900, color: "#111827" }}>Knowledge Base Manager</div>
              <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.65, marginTop: "8px" }}>
                Structured editing only. No raw HTML. Reviewers and admins can save drafts, preview, and publish.
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <button type="button" onClick={() => setCreating((current) => !current)} style={secondaryButtonStyle}>
                <Plus size={14} />
                New article
              </button>
              {creating ? (
                <div style={{ border: "1px solid #E5E7EB", borderRadius: "14px", padding: "12px", display: "grid", gap: "10px" }}>
                  <select value={newTemplateKey} onChange={(event) => setNewTemplateKey(event.target.value)} style={inputStyle}>
                    {templates.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                  <select value={newCategoryId} onChange={(event) => setNewCategoryId(event.target.value)} style={inputStyle}>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={createNewDraft} style={{ ...secondaryButtonStyle, justifyContent: "center" }}>
                    Start draft
                  </button>
                </div>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: "8px", maxHeight: "62vh", overflow: "auto" }}>
              {articles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => loadArticle(article.id)}
                  style={{
                    borderRadius: "14px",
                    border: selectedId === article.id ? "2px solid #4338CA" : "1px solid #E5E7EB",
                    backgroundColor: selectedId === article.id ? "#F5F3FF" : "white",
                    padding: "12px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
                    <Badge>{article.articleType}</Badge>
                    {article.status !== "published" ? <Badge>{article.status}</Badge> : null}
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#111827" }}>{article.title}</div>
                  <div style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.5, marginTop: "4px" }}>{article.summary}</div>
                </button>
              ))}
            </div>

            <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: "14px", display: "grid", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Revision History
                </div>
                <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.6, marginTop: "6px" }}>
                  Recent saved snapshots for the selected article.
                </div>
              </div>
              <div style={{ display: "grid", gap: "8px", maxHeight: "240px", overflow: "auto" }}>
                {selectedRevisions.length ? (
                  selectedRevisions.map((revision) => (
                    <div
                      key={revision.id}
                      style={{
                        border: "1px solid #E5E7EB",
                        borderRadius: "14px",
                        padding: "12px",
                        backgroundColor: "#FAFAFB",
                      }}
                    >
                      <RevisionSnapshotSummary revision={revision} />
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: "13px", color: "#9CA3AF" }}>No revisions recorded yet for this article.</div>
                )}
              </div>
            </div>
          </aside>

          <section
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "18px",
              padding: "20px",
              display: "grid",
              gap: "18px",
            }}
          >
            {message ? (
              <div style={{ padding: "12px 14px", borderRadius: "12px", backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontSize: "14px", fontWeight: 700 }}>
                {message}
              </div>
            ) : null}
            {error ? (
              <div style={{ padding: "12px 14px", borderRadius: "12px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: "14px", fontWeight: 700 }}>
                {error}
              </div>
            ) : null}
            {hasUnsavedChanges ? (
              <div style={{ padding: "12px 14px", borderRadius: "12px", backgroundColor: "#FFF7ED", border: "1px solid #FDBA74", color: "#9A3412", fontSize: "13px", fontWeight: 700 }}>
                You have unsaved changes.
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Editing
                </div>
                <div style={{ fontSize: "28px", fontWeight: 900, color: "#111827", marginTop: "4px" }}>
                  {draft.title || "Untitled draft"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => setPreviewMode((current) => !current)} style={secondaryButtonStyle}>
                  {previewMode ? <EyeOff size={14} /> : <Eye size={14} />}
                  {previewMode ? "Exit preview" : "Preview"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const article = articles.find((item) => item.id === selectedId);
                    if (article) {
                      setDraft(buildDraftFromArticle(article));
                      setHasUnsavedChanges(false);
                      setMessage("");
                      setError("");
                    }
                  }}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
                <button type="button" onClick={() => saveDraft("draft")} disabled={saving} style={secondaryButtonStyle}>
                  <Save size={14} />
                  Save draft
                </button>
                <button
                  type="button"
                  onClick={() => saveDraft("published")}
                  disabled={saving}
                  style={{
                    ...secondaryButtonStyle,
                    backgroundColor: "#111827",
                    color: "white",
                    borderColor: "#111827",
                  }}
                >
                  <Send size={14} />
                  Publish
                </button>
              </div>
            </div>

            {previewMode ? (
              <div style={{ display: "grid", gap: "16px" }}>
                <div style={{ border: "1px solid #E5E7EB", borderRadius: "16px", padding: "20px", backgroundColor: "#FAFAFB" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    <Badge>{articleTypeLabels[draft.articleType] || draft.articleType}</Badge>
                    <Badge>{draft.status}</Badge>
                  </div>
                  <h1 style={{ margin: 0, fontSize: "30px", color: "#111827" }}>{draft.title || "Untitled draft"}</h1>
                  <p style={{ fontSize: "15px", color: "#6B7280", lineHeight: 1.75, marginTop: "12px" }}>
                    {draft.summary || "No summary yet."}
                  </p>
                  {draft.tagsText ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px" }}>
                      {normalizeItems(String(draft.tagsText).replace(/,/g, "\n")).map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "16px" }}>
                  <div style={{ display: "grid", gap: "16px" }}>
                    <div style={{ border: "1px solid #E5E7EB", borderRadius: "16px", padding: "20px", backgroundColor: "white", display: "grid", gap: "14px" }}>
                      <PreviewField label="Purpose / definition" value={draft.fields.purpose || draft.fields.definition} multiline />
                      <PreviewListField label="When this applies" value={normalizeItems(draft.fields.whenThisAppliesText)} />
                      <PreviewField label="Trigger" value={draft.fields.trigger} multiline />
                      <PreviewListField label="Inputs" value={normalizeItems(draft.fields.inputsText)} />
                      <PreviewListField label="Steps" value={normalizeItems(draft.fields.stepsText)} />
                      <PreviewListField label="Systems used" value={normalizeItems(draft.fields.systemsUsedText)} />
                      <PreviewListField label="Data created or updated" value={normalizeItems(draft.fields.dataCreatedOrUpdatedText)} />
                      <PreviewListField label="Outputs" value={normalizeItems(draft.fields.outputsText)} />
                    </div>
                    {draft.contentBlocks.map((block) => (
                      <PreviewBlock key={block.id} block={block} />
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: "16px" }}>
                    <div style={{ border: "1px solid #E5E7EB", borderRadius: "16px", padding: "20px", backgroundColor: "white", display: "grid", gap: "14px" }}>
                      <PreviewListField label="Related systems" value={normalizeItems(draft.fields.relatedSystemsText)} />
                      <PreviewListField label="Related processes" value={normalizeItems(draft.fields.relatedProcessesText)} />
                      <PreviewListField label="Related reports" value={normalizeItems(draft.fields.relatedReportsText)} />
                      <PreviewListField label="Related procedures" value={normalizeItems(draft.fields.relatedProceduresText)} />
                      <PreviewListField label="Responsible roles" value={normalizeItems(draft.fields.responsibleRolesText)} />
                      <PreviewListField label="Risks / common failure points" value={normalizeItems(draft.fields.risksCommonFailurePointsText)} />
                      <PreviewListField label="Who uses it" value={normalizeItems(draft.fields.whoUsesItText)} />
                      <PreviewListField label="What data lives there" value={normalizeItems(draft.fields.dataLivesThereText)} />
                      <PreviewListField label="Source of truth notes" value={normalizeItems(draft.fields.sourceOfTruthNotesText)} />
                      <PreviewListField label="Common issues" value={normalizeItems(draft.fields.commonIssuesText)} />
                      <PreviewField label="Escalation contact" value={draft.fields.escalationContact} multiline />
                      <PreviewField label="NXT terminology" value={draft.fields.nxtTerminology} multiline />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "16px" }}>
                  <div style={{ display: "grid", gap: "14px" }}>
                    <div>
                      <label style={labelStyle}>Title</label>
                      <input value={draft.title} onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Summary / purpose</label>
                      <textarea value={draft.summary} onChange={(event) => updateDraft((current) => ({ ...current, summary: event.target.value }))} rows={4} style={textareaStyle} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "14px" }}>
                    <div>
                      <label style={labelStyle}>Category</label>
                      <select value={draft.categoryId} onChange={(event) => updateDraft((current) => ({ ...current, categoryId: event.target.value }))} style={inputStyle}>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Article type</label>
                      <select value={draft.articleType} onChange={(event) => updateDraft((current) => ({ ...current, articleType: event.target.value }))} style={inputStyle}>
                        {articleTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Tags</label>
                      <input value={draft.tagsText} onChange={(event) => updateDraft((current) => ({ ...current, tagsText: event.target.value }))} placeholder="Comma-separated tags" style={inputStyle} />
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px" }}>
                  <div>
                    <label style={labelStyle}>Owner</label>
                    <select value={draft.ownerUserId} onChange={(event) => updateDraft((current) => ({ ...current, ownerUserId: event.target.value }))} style={inputStyle}>
                      <option value="">Unassigned</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Reviewer</label>
                    <select value={draft.reviewerUserId} onChange={(event) => updateDraft((current) => ({ ...current, reviewerUserId: event.target.value }))} style={inputStyle}>
                      <option value="">Unassigned</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Last reviewed</label>
                    <input type="date" value={draft.lastReviewedAt} onChange={(event) => updateDraft((current) => ({ ...current, lastReviewedAt: event.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={draft.status} onChange={(event) => updateDraft((current) => ({ ...current, status: event.target.value }))} style={inputStyle}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>When this applies</label>
                      <textarea value={draft.fields.whenThisAppliesText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, whenThisAppliesText: event.target.value } }))} rows={4} placeholder="One item per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Purpose / definition</label>
                      <textarea value={draft.fields.purpose || draft.fields.definition || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, purpose: event.target.value, definition: current.articleType === "glossary" ? event.target.value : current.fields.definition } }))} rows={4} style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>NXT terminology</label>
                      <input value={draft.fields.nxtTerminology || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, nxtTerminology: event.target.value } }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Trigger</label>
                      <input value={draft.fields.trigger || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, trigger: event.target.value } }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Inputs</label>
                      <textarea value={draft.fields.inputsText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, inputsText: event.target.value } }))} rows={4} placeholder="One input per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Systems used</label>
                      <textarea value={draft.fields.systemsUsedText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, systemsUsedText: event.target.value } }))} rows={4} placeholder="One system per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Steps</label>
                      <textarea value={draft.fields.stepsText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, stepsText: event.target.value } }))} rows={5} placeholder="One step per line" style={textareaStyle} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Related systems</label>
                      <textarea value={draft.fields.relatedSystemsText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, relatedSystemsText: event.target.value } }))} rows={4} placeholder="One system per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Related processes</label>
                      <textarea value={draft.fields.relatedProcessesText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, relatedProcessesText: event.target.value } }))} rows={4} placeholder="One process per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Risks / common failure points</label>
                      <textarea value={draft.fields.risksCommonFailurePointsText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, risksCommonFailurePointsText: event.target.value } }))} rows={4} placeholder="One item per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Related reports</label>
                      <textarea value={draft.fields.relatedReportsText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, relatedReportsText: event.target.value } }))} rows={4} placeholder="One report per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Related procedures</label>
                      <textarea value={draft.fields.relatedProceduresText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, relatedProceduresText: event.target.value } }))} rows={4} placeholder="One procedure per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Responsible roles</label>
                      <textarea value={draft.fields.responsibleRolesText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, responsibleRolesText: event.target.value } }))} rows={4} placeholder="One role per line" style={textareaStyle} />
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Outputs</label>
                      <textarea value={draft.fields.outputsText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, outputsText: event.target.value } }))} rows={4} placeholder="One output per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Data created or updated</label>
                      <textarea value={draft.fields.dataCreatedOrUpdatedText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, dataCreatedOrUpdatedText: event.target.value } }))} rows={4} placeholder="One item per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Who uses it</label>
                      <textarea value={draft.fields.whoUsesItText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, whoUsesItText: event.target.value } }))} rows={4} placeholder="One role or audience per line" style={textareaStyle} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>What data lives there</label>
                      <textarea value={draft.fields.dataLivesThereText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, dataLivesThereText: event.target.value } }))} rows={4} placeholder="One item per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Source of truth notes</label>
                      <textarea value={draft.fields.sourceOfTruthNotesText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, sourceOfTruthNotesText: event.target.value } }))} rows={4} placeholder="One note per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Common issues</label>
                      <textarea value={draft.fields.commonIssuesText || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, commonIssuesText: event.target.value } }))} rows={4} placeholder="One issue per line" style={textareaStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Escalation contact</label>
                      <input value={draft.fields.escalationContact || ""} onChange={(event) => updateDraft((current) => ({ ...current, fields: { ...current.fields, escalationContact: event.target.value } }))} style={inputStyle} />
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <SearchPicker label="Related articles" options={relatedArticleOptions.filter((option) => option.id !== draft.articleId)} selectedIds={draft.relatedArticleIds} onChange={(nextValue) => updateDraft((current) => ({ ...current, relatedArticleIds: nextValue }))} />
                  <div style={{ display: "grid", gap: "16px" }}>
                    <SearchPicker label="Related systems" options={systemOptions} selectedIds={draft.relatedSystemIds} onChange={(nextValue) => updateDraft((current) => ({ ...current, relatedSystemIds: nextValue }))} />
                    <SearchPicker label="Related processes" options={processOptions} selectedIds={draft.relatedProcessIds} onChange={(nextValue) => updateDraft((current) => ({ ...current, relatedProcessIds: nextValue }))} />
                  </div>
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Related Forms / Requests
                  </div>
                  {draft.relatedRequestLinks.map((link, index) => (
                    <div key={`request-link-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px" }}>
                      <input
                        value={link.label || ""}
                        onChange={(event) =>
                          updateDraft((current) => {
                            const nextLinks = [...current.relatedRequestLinks];
                            nextLinks[index] = { ...nextLinks[index], label: event.target.value };
                            return { ...current, relatedRequestLinks: nextLinks };
                          })
                        }
                        placeholder="Link label"
                        style={inputStyle}
                      />
                      <input
                        value={link.href || ""}
                        onChange={(event) =>
                          updateDraft((current) => {
                            const nextLinks = [...current.relatedRequestLinks];
                            nextLinks[index] = { ...nextLinks[index], href: event.target.value };
                            return { ...current, relatedRequestLinks: nextLinks };
                          })
                        }
                        placeholder="/request-list or https://..."
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft((current) => ({
                            ...current,
                            relatedRequestLinks: current.relatedRequestLinks.filter((_, linkIndex) => linkIndex !== index),
                          }))
                        }
                        style={{ ...secondaryButtonStyle, color: "#991B1B" }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        relatedRequestLinks: [...current.relatedRequestLinks, { label: "", href: "" }],
                      }))
                    }
                    style={secondaryButtonStyle}
                  >
                    <Plus size={14} />
                    Add related link
                  </button>
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Content Sections
                      </div>
                      <div style={{ fontSize: "14px", color: "#6B7280", marginTop: "4px" }}>
                        Add, remove, and reorder blocks without editing raw HTML or JSON.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {["text", "list", "steps", "examples"].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            updateDraft((current) => ({
                              ...current,
                              contentBlocks: [
                                ...current.contentBlocks,
                                {
                                  id: `${type}-${Date.now()}`,
                                  type,
                                  title: type === "steps" ? "Step-by-step procedure" : "New section",
                                  text: type === "text" ? "" : undefined,
                                  items: type === "examples" ? [] : type === "text" ? undefined : [],
                                },
                              ],
                            }))
                          }
                          style={secondaryButtonStyle}
                        >
                          <Plus size={14} />
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "12px" }}>
                    {draft.contentBlocks.map((block, index) => (
                      <BlockEditor
                        key={block.id}
                        block={block}
                        onChange={(nextBlock) =>
                          updateDraft((current) => {
                            const nextBlocks = [...current.contentBlocks];
                            nextBlocks[index] = nextBlock;
                            return { ...current, contentBlocks: nextBlocks };
                          })
                        }
                        onRemove={() =>
                          updateDraft((current) => ({
                            ...current,
                            contentBlocks: current.contentBlocks.filter((candidate) => candidate.id !== block.id),
                          }))
                        }
                        onMoveUp={() =>
                          updateDraft((current) => {
                            const nextBlocks = [...current.contentBlocks];
                            [nextBlocks[index - 1], nextBlocks[index]] = [nextBlocks[index], nextBlocks[index - 1]];
                            return { ...current, contentBlocks: nextBlocks };
                          })
                        }
                        onMoveDown={() =>
                          updateDraft((current) => {
                            const nextBlocks = [...current.contentBlocks];
                            [nextBlocks[index], nextBlocks[index + 1]] = [nextBlocks[index + 1], nextBlocks[index]];
                            return { ...current, contentBlocks: nextBlocks };
                          })
                        }
                        canMoveUp={index > 0}
                        canMoveDown={index < draft.contentBlocks.length - 1}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: 800,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "8px",
};

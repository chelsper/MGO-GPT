"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Users,
  Home,
  Gift,
  Target,
  FileText,
  Shield,
  Banknote,
  Heart,
  FileSignature,
  BarChart3,
  Settings,
  Search,
  ChevronRight,
  Link2,
} from "lucide-react";

const ICON_MAP = {
  "book-open": BookOpen,
  users: Users,
  home: Home,
  gift: Gift,
  target: Target,
  "file-text": FileText,
  shield: Shield,
  banknote: Banknote,
  heart: Heart,
  "file-signature": FileSignature,
  "bar-chart-3": BarChart3,
  settings: Settings,
};

function CategoryCard({ category, onClick }) {
  const IconComp = ICON_MAP[category.icon] || BookOpen;
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: "white",
        borderRadius: "12px",
        border: "1px solid #E5E7EB",
        padding: "20px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-start",
        gap: "14px",
        width: "100%",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "10px",
          backgroundColor: "#EDE9FE",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <IconComp size={20} color="#6A5BFF" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111827", margin: "0 0 4px 0" }}>
          {category.title}
        </h3>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: 0, lineHeight: "1.4" }}>
          {category.description}
        </p>
      </div>
      <ChevronRight size={18} color="#9CA3AF" style={{ marginTop: "4px", flexShrink: 0 }} />
    </button>
  );
}

function ArticleCard({ article, categoryName, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: "white",
        borderRadius: "12px",
        border: "1px solid #E5E7EB",
        padding: "16px 20px",
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {categoryName ? (
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#6B7280",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: "6px",
            }}
          >
            {categoryName}
          </div>
        ) : null}
        <h4 style={{ fontSize: "14px", fontWeight: 600, color: "#111827", margin: "0 0 4px 0" }}>
          {article.title}
        </h4>
        <p
          style={{
            fontSize: "13px",
            color: "#6B7280",
            margin: 0,
            lineHeight: "1.4",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {article.summary}
        </p>
      </div>
      <ChevronRight size={16} color="#9CA3AF" style={{ flexShrink: 0 }} />
    </button>
  );
}

function SectionCard({ title, children, tone = "default" }) {
  const tones = {
    default: {
      backgroundColor: "white",
      border: "1px solid #E5E7EB",
      titleColor: "#111827",
      bodyColor: "#374151",
    },
    warn: {
      backgroundColor: "#FFFBEB",
      border: "1px solid #FDE68A",
      titleColor: "#92400E",
      bodyColor: "#78350F",
    },
    danger: {
      backgroundColor: "#FEF2F2",
      border: "1px solid #FECACA",
      titleColor: "#991B1B",
      bodyColor: "#991B1B",
    },
  };
  const style = tones[tone] || tones.default;

  return (
    <div
      style={{
        backgroundColor: style.backgroundColor,
        borderRadius: "12px",
        border: style.border,
        padding: "20px",
        marginBottom: "16px",
      }}
    >
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: style.titleColor, margin: "0 0 12px 0" }}>
        {title}
      </h3>
      <div style={{ fontSize: "14px", color: style.bodyColor, lineHeight: "1.6" }}>{children}</div>
    </div>
  );
}

function ArticleView({ article, articlesById, categoryName, onBack, onSelectArticle }) {
  const sections = article.sections || {};
  const relatedArticles = Array.isArray(sections.relatedArticles)
    ? sections.relatedArticles
        .map((id) => articlesById.get(id))
        .filter(Boolean)
    : [];

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#6A5BFF",
          fontSize: "14px",
          fontWeight: 500,
          padding: 0,
          marginBottom: "20px",
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {categoryName ? (
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "#6B7280",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: "10px",
          }}
        >
          {categoryName}
        </div>
      ) : null}

      <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#111827", margin: "0 0 8px 0" }}>
        {article.title}
      </h2>
      <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: "1.6", margin: "0 0 24px 0" }}>
        {article.summary}
      </p>

      {article.tags?.length ? (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "24px" }}>
          {article.tags.map((tag) => (
            <span
              key={tag}
              style={{
                padding: "4px 10px",
                backgroundColor: "#F3F4F6",
                borderRadius: "999px",
                fontSize: "12px",
                color: "#6B7280",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {sections.rulesStandards?.length ? (
        <SectionCard title="Rules & Standards">
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            {sections.rulesStandards.map((rule, index) => (
              <li key={index} style={{ marginBottom: "6px" }}>
                {rule}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {sections.examples?.length ? (
        <SectionCard title="Examples">
          {sections.examples.map((example, index) => (
            <div key={index} style={{ marginBottom: index < sections.examples.length - 1 ? "16px" : 0 }}>
              <h4 style={{ fontSize: "14px", fontWeight: 600, color: "#6A5BFF", margin: "0 0 4px 0" }}>
                {example.title}
              </h4>
              <p style={{ margin: 0 }}>{example.content}</p>
            </div>
          ))}
        </SectionCard>
      ) : null}

      {sections.whyThisMatters ? (
        <SectionCard title="Why This Matters" tone="warn">
          <p style={{ margin: 0 }}>{sections.whyThisMatters}</p>
        </SectionCard>
      ) : null}

      {sections.commonMistakes?.length ? (
        <SectionCard title="Common Mistakes" tone="danger">
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            {sections.commonMistakes.map((mistake, index) => (
              <li key={index} style={{ marginBottom: "6px" }}>
                {mistake}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {relatedArticles.length ? (
        <SectionCard title="Related Articles">
          <div style={{ display: "grid", gap: "10px" }}>
            {relatedArticles.map((related) => (
              <button
                key={related.id}
                type="button"
                onClick={() => onSelectArticle(related)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  width: "100%",
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#F9FAFB",
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                    {related.title}
                  </div>
                  <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>
                    {related.summary}
                  </div>
                </div>
                <Link2 size={16} color="#6A5BFF" />
              </button>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const [knowledgeBase, setKnowledgeBase] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedArticleId, setSelectedArticleId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingKnowledgeBase, setLoadingKnowledgeBase] = useState(false);

  const categories = knowledgeBase?.categories || [];
  const articles = knowledgeBase?.articles || [];

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const articlesById = useMemo(
    () => new Map(articles.map((article) => [article.id, article])),
    [articles],
  );

  const selectedCategory = selectedCategoryId
    ? categoriesById.get(selectedCategoryId) || null
    : null;
  const selectedArticle = selectedArticleId
    ? articlesById.get(selectedArticleId) || null
    : null;

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;

    return articles.filter((article) => {
      const titleMatch = article.title.toLowerCase().includes(query);
      const summaryMatch = article.summary.toLowerCase().includes(query);
      const tagMatch = article.tags?.some((tag) => tag.toLowerCase().includes(query));
      const relatedMatch = article.sections?.rulesStandards?.some((item) =>
        item.toLowerCase().includes(query),
      );
      return titleMatch || summaryMatch || tagMatch || relatedMatch;
    });
  }, [articles, searchQuery]);

  const categoryArticles = useMemo(() => {
    if (!selectedCategory) return [];
    return articles.filter((article) => article.categoryId === selectedCategory.id);
  }, [articles, selectedCategory]);

  async function loadKnowledgeBase() {
    if (knowledgeBase) return knowledgeBase;
    setLoadingKnowledgeBase(true);
    try {
      const response = await fetch("/api/knowledge-base");
      if (!response.ok) {
        throw new Error("Failed to load knowledge base");
      }
      const data = await response.json();
      setKnowledgeBase(data);
      return data;
    } catch (error) {
      console.error("Failed to load knowledge base:", error);
      return { categories: [], articles: [] };
    } finally {
      setLoadingKnowledgeBase(false);
    }
  }

  async function handleCategoryClick(category) {
    await loadKnowledgeBase();
    setSelectedCategoryId(category.id);
    setSelectedArticleId(null);
    setSearchQuery("");
  }

  async function handleArticleSelect(article) {
    await loadKnowledgeBase();
    setSelectedArticleId(article.id);
  }

  async function handleSearch(query) {
    setSearchQuery(query);
    if (!knowledgeBase) {
      await loadKnowledgeBase();
    }
    setSelectedCategoryId(null);
    setSelectedArticleId(null);
  }

  const showingCategories = !selectedCategory && !selectedArticle && !searchResults;
  const showingCategoryArticles = selectedCategory && !selectedArticle;
  const selectedCategoryName = selectedArticle
    ? categoriesById.get(selectedArticle.categoryId)?.title || null
    : null;

  useEffect(() => {
    loadKnowledgeBase();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#F9FAFB",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #E5E7EB",
          padding: "16px 24px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: "860px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <a
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "#F3F4F6",
              border: "1px solid #E5E7EB",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={18} color="#374151" />
          </a>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", margin: 0 }}>
              Knowledge Base
            </h1>
            <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>
              Search 51 standards articles with related click-throughs.
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "24px" }}>
        <div style={{ position: "relative", marginBottom: "24px" }}>
          <Search
            size={18}
            color="#9CA3AF"
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search articles, standards, tags, or rules..."
            style={{
              width: "100%",
              padding: "12px 14px 12px 42px",
              border: "1px solid #E5E7EB",
              borderRadius: "12px",
              fontSize: "14px",
              backgroundColor: "white",
              boxSizing: "border-box",
            }}
          />
        </div>

        {searchResults ? (
          <div>
            <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "12px" }}>
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {searchResults.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  categoryName={categoriesById.get(article.categoryId)?.title || ""}
                  onClick={() => handleArticleSelect(article)}
                />
              ))}
            </div>
            {searchResults.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  backgroundColor: "white",
                  borderRadius: "12px",
                  border: "1px solid #E5E7EB",
                  marginTop: "12px",
                }}
              >
                <Search size={32} color="#D1D5DB" style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: "14px", color: "#6B7280", margin: 0 }}>
                  No articles found. Try a different search term.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedArticle ? (
          <ArticleView
            article={selectedArticle}
            articlesById={articlesById}
            categoryName={selectedCategoryName}
            onSelectArticle={handleArticleSelect}
            onBack={() => setSelectedArticleId(null)}
          />
        ) : null}

        {showingCategoryArticles ? (
          <div>
            <button
              onClick={() => {
                setSelectedCategoryId(null);
                setSearchQuery("");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#6A5BFF",
                fontSize: "14px",
                fontWeight: 500,
                padding: 0,
                marginBottom: "16px",
              }}
            >
              <ArrowLeft size={16} />
              All Categories
            </button>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: "0 0 4px 0" }}>
              {selectedCategory.title}
            </h2>
            <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 20px 0" }}>
              {selectedCategory.description}
            </p>

            {loadingKnowledgeBase ? (
              <p style={{ color: "#6B7280", textAlign: "center", padding: "40px" }}>
                Loading articles...
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {categoryArticles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onClick={() => handleArticleSelect(article)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {showingCategories ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "12px",
            }}
          >
            {categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onClick={() => handleCategoryClick(category)}
              />
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}

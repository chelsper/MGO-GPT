"use client";

import { useState } from "react";
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
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";

const categories = [
  {
    id: "fundamentals",
    title: "Raiser's Edge NXT Fundamentals",
    icon: "BookOpen",
    description: "Core platform navigation and profile basics",
  },
  {
    id: "constituencies",
    title: "Constituencies & Hierarchy",
    icon: "Users",
    description: "Standard constituency order and rules",
  },
  {
    id: "household",
    title: "Household & Mailing Rules",
    icon: "Home",
    description: "Head of household and mailing standards",
  },
  {
    id: "giving",
    title: "Gift & Giving Definitions",
    icon: "Gift",
    description: "Lifetime giving, recognition, and legal credit",
  },
  {
    id: "prospect",
    title: "Prospect Management",
    icon: "Target",
    description: "Ratings, contact reports, and pipeline",
  },
  {
    id: "reporting",
    title: "List & Reporting Standards",
    icon: "FileText",
    description: "List request guidelines and output formats",
  },
  {
    id: "governance",
    title: "Data Governance & Best Practices",
    icon: "Shield",
    description: "Why standards matter and compliance",
  },
  {
    id: "fundraising-policies",
    title: "Fundraising Policies",
    icon: "Banknote",
    description: "Tickets, auctions, raffles, sponsorships, and quid pro quo",
  },
  {
    id: "gift-acceptance",
    title: "Gift Acceptance",
    icon: "Heart",
    description: "Gifts-in-kind, pledges, endowments, and scholarships",
  },
  {
    id: "gift-agreements",
    title: "Gift Agreements",
    icon: "FileSignature",
    description: "Agreement types, MOUs, naming rights, and Heritage Society",
  },
  {
    id: "campaign-counting",
    title: "Campaign Counting & Reporting",
    icon: "BarChart3",
    description: "Gift counting rules, pillars, exclusions, and planned gifts",
  },
  {
    id: "advancement-ops",
    title: "Advancement Operations",
    icon: "Settings",
    description:
      "Services, events, data, acknowledgments, ethics, and campaigns",
  },
];

const ICON_MAP = {
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
        <h3
          style={{
            fontSize: "15px",
            fontWeight: "600",
            color: "#111827",
            margin: "0 0 4px 0",
          }}
        >
          {category.title}
        </h3>
        <p
          style={{
            fontSize: "13px",
            color: "#6B7280",
            margin: 0,
            lineHeight: "1.4",
          }}
        >
          {category.description}
        </p>
      </div>
      <ChevronRight
        size={18}
        color="#9CA3AF"
        style={{ marginTop: "4px", flexShrink: 0 }}
      />
    </button>
  );
}

function ArticleCard({ article, onClick }) {
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
        <h4
          style={{
            fontSize: "14px",
            fontWeight: "600",
            color: "#111827",
            margin: "0 0 4px 0",
          }}
        >
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

function ArticleView({ article, onBack }) {
  const sections = article.sections || {};

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
          fontWeight: "500",
          padding: 0,
          marginBottom: "20px",
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <h2
        style={{
          fontSize: "22px",
          fontWeight: "700",
          color: "#111827",
          margin: "0 0 8px 0",
        }}
      >
        {article.title}
      </h2>
      <p
        style={{
          fontSize: "14px",
          color: "#6B7280",
          lineHeight: "1.6",
          margin: "0 0 24px 0",
        }}
      >
        {article.summary}
      </p>

      {article.tags && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >
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
      )}

      {sections.rulesStandards && sections.rulesStandards.length > 0 && (
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            border: "1px solid #E5E7EB",
            padding: "20px",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "15px",
              fontWeight: "700",
              color: "#111827",
              margin: "0 0 12px 0",
            }}
          >
            Rules & Standards
          </h3>
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            {sections.rulesStandards.map((rule, i) => (
              <li
                key={i}
                style={{
                  fontSize: "14px",
                  color: "#374151",
                  lineHeight: "1.6",
                  marginBottom: "6px",
                }}
              >
                {rule}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sections.examples && sections.examples.length > 0 && (
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            border: "1px solid #E5E7EB",
            padding: "20px",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "15px",
              fontWeight: "700",
              color: "#111827",
              margin: "0 0 12px 0",
            }}
          >
            Examples
          </h3>
          {sections.examples.map((example, i) => (
            <div
              key={i}
              style={{
                marginBottom: i < sections.examples.length - 1 ? "16px" : 0,
              }}
            >
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#6A5BFF",
                  margin: "0 0 4px 0",
                }}
              >
                {example.title}
              </h4>
              <p
                style={{
                  fontSize: "14px",
                  color: "#374151",
                  lineHeight: "1.6",
                  margin: 0,
                }}
              >
                {example.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {sections.whyThisMatters && (
        <div
          style={{
            backgroundColor: "#FFFBEB",
            borderRadius: "12px",
            border: "1px solid #FDE68A",
            padding: "20px",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "15px",
              fontWeight: "700",
              color: "#92400E",
              margin: "0 0 8px 0",
            }}
          >
            Why This Matters
          </h3>
          <p
            style={{
              fontSize: "14px",
              color: "#78350F",
              lineHeight: "1.6",
              margin: 0,
            }}
          >
            {sections.whyThisMatters}
          </p>
        </div>
      )}

      {sections.commonMistakes && sections.commonMistakes.length > 0 && (
        <div
          style={{
            backgroundColor: "#FEF2F2",
            borderRadius: "12px",
            border: "1px solid #FECACA",
            padding: "20px",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "15px",
              fontWeight: "700",
              color: "#991B1B",
              margin: "0 0 12px 0",
            }}
          >
            Common Mistakes
          </h3>
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            {sections.commonMistakes.map((mistake, i) => (
              <li
                key={i}
                style={{
                  fontSize: "14px",
                  color: "#991B1B",
                  lineHeight: "1.6",
                  marginBottom: "6px",
                }}
              >
                {mistake}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // Dynamically load articles from mobile data files
  const loadArticles = async () => {
    if (articles) return articles;
    setLoadingArticles(true);

    try {
      // Fetch articles from a backend endpoint that serves the knowledge base data
      const res = await fetch("/api/knowledge-base");
      if (!res.ok) throw new Error("Failed to load articles");
      const data = await res.json();
      setArticles(data);
      setLoadingArticles(false);
      return data;
    } catch (err) {
      console.error("Failed to load knowledge base:", err);
      setLoadingArticles(false);
      return [];
    }
  };

  const handleCategoryClick = async (cat) => {
    const allArticles = await loadArticles();
    const filtered = allArticles.filter((a) => a.categoryId === cat.id);
    setSelectedCategory({ ...cat, articles: filtered });
    setSelectedArticle(null);
    setSearchResults(null);
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    const allArticles = await loadArticles();
    const lower = query.toLowerCase().trim();
    const results = allArticles.filter((a) => {
      const titleMatch = a.title.toLowerCase().includes(lower);
      const summaryMatch = a.summary.toLowerCase().includes(lower);
      const tagMatch =
        a.tags && a.tags.some((t) => t.toLowerCase().includes(lower));
      return titleMatch || summaryMatch || tagMatch;
    });
    setSearchResults(results);
    setSelectedCategory(null);
    setSelectedArticle(null);
  };

  const showingCategories =
    !selectedCategory && !selectedArticle && !searchResults;
  const showingCategoryArticles = selectedCategory && !selectedArticle;

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
            maxWidth: "800px",
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
          <h1
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#111827",
              margin: 0,
            }}
          >
            Knowledge Base
          </h1>
        </div>
      </header>

      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "24px" }}>
        {/* Search */}
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
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search articles..."
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

        {/* Search Results */}
        {searchResults && (
          <div>
            <p
              style={{
                fontSize: "13px",
                color: "#6B7280",
                marginBottom: "12px",
              }}
            >
              {searchResults.length} result
              {searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {searchResults.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  onClick={() => {
                    setSelectedArticle(article);
                    setSearchResults(null);
                  }}
                />
              ))}
            </div>
            {searchResults.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  backgroundColor: "white",
                  borderRadius: "12px",
                  border: "1px solid #E5E7EB",
                }}
              >
                <Search
                  size={32}
                  color="#D1D5DB"
                  style={{ margin: "0 auto 8px" }}
                />
                <p style={{ fontSize: "14px", color: "#6B7280" }}>
                  No articles found. Try a different search term.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Article Detail */}
        {selectedArticle && (
          <ArticleView
            article={selectedArticle}
            onBack={() => {
              setSelectedArticle(null);
              if (!selectedCategory) {
                setSearchQuery("");
              }
            }}
          />
        )}

        {/* Category Article List */}
        {showingCategoryArticles && (
          <div>
            <button
              onClick={() => {
                setSelectedCategory(null);
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
                fontWeight: "500",
                padding: 0,
                marginBottom: "16px",
              }}
            >
              <ArrowLeft size={16} />
              All Categories
            </button>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "700",
                color: "#111827",
                margin: "0 0 4px 0",
              }}
            >
              {selectedCategory.title}
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "#6B7280",
                margin: "0 0 20px 0",
              }}
            >
              {selectedCategory.description}
            </p>

            {loadingArticles ? (
              <p
                style={{
                  color: "#6B7280",
                  textAlign: "center",
                  padding: "40px",
                }}
              >
                Loading articles...
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {selectedCategory.articles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onClick={() => setSelectedArticle(article)}
                  />
                ))}
                {selectedCategory.articles.length === 0 && (
                  <p
                    style={{
                      color: "#6B7280",
                      textAlign: "center",
                      padding: "40px",
                    }}
                  >
                    No articles in this category yet.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Categories Grid */}
        {showingCategories && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "12px",
            }}
          >
            {categories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                onClick={() => handleCategoryClick(cat)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

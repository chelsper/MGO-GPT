"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  BookKey,
  ChevronRight,
  Database,
  ExternalLink,
  FileStack,
  Filter,
  FolderKanban,
  Gift,
  GraduationCap,
  Home,
  LayoutTemplate,
  Link2,
  MailCheck,
  Monitor,
  PlugZap,
  Search,
  Shield,
  Target,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";

const ICON_MAP = {
  "book-open": BookOpen,
  users: Users,
  home: Home,
  gift: Gift,
  target: Target,
  "file-text": FileStack,
  shield: Shield,
  banknote: Gift,
  heart: Gift,
  "file-signature": FileStack,
  "bar-chart-3": FileStack,
  settings: Monitor,
  workflow: Workflow,
  "monitor-cog": Monitor,
  database: Database,
  "plug-zap": PlugZap,
  "graduation-cap": GraduationCap,
  "mail-check": MailCheck,
  wrench: Wrench,
  "book-key": BookKey,
};

function toneStyles(tone) {
  if (tone === "warn") {
    return {
      backgroundColor: "#FFFBEB",
      border: "1px solid #FDE68A",
      title: "#92400E",
      body: "#78350F",
    };
  }
  if (tone === "danger") {
    return {
      backgroundColor: "#FEF2F2",
      border: "1px solid #FECACA",
      title: "#991B1B",
      body: "#991B1B",
    };
  }
  return {
    backgroundColor: "white",
    border: "1px solid #E5E7EB",
    title: "#111827",
    body: "#374151",
  };
}

function Badge({ children, tone = "default" }) {
  const style =
    tone === "muted"
      ? { backgroundColor: "#F3F4F6", color: "#4B5563" }
      : tone === "accent"
        ? { backgroundColor: "#EEF2FF", color: "#4338CA" }
        : { backgroundColor: "#ECFEFF", color: "#155E75" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "5px 10px",
        fontSize: "12px",
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function Card({ children, padding = 20 }) {
  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid #E5E7EB",
        borderRadius: "18px",
        padding,
      }}
    >
      {children}
    </div>
  );
}

function Breadcrumbs({ items, onSelect }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "18px" }}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {index > 0 ? <ChevronRight size={14} color="#9CA3AF" /> : null}
          <button
            type="button"
            onClick={() => onSelect(item)}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              color: index === items.length - 1 ? "#111827" : "#6B7280",
              fontWeight: index === items.length - 1 ? 700 : 600,
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}

function SearchBar({ value, onChange }) {
  return (
    <div style={{ position: "relative" }}>
      <Search
        size={18}
        color="#9CA3AF"
        style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search articles, systems, processes, tags, or terminology..."
        style={{
          width: "100%",
          padding: "14px 16px 14px 44px",
          borderRadius: "16px",
          border: "1px solid #D1D5DB",
          fontSize: "14px",
          boxSizing: "border-box",
          backgroundColor: "white",
        }}
      />
    </div>
  );
}

function LinkList({ items, onSelectArticle, onOpenDirectory, articlesById }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {items.map((item) => {
        if (item.targetType === "article") {
          const article = articlesById.get(item.id);
          if (!article) return null;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectArticle(article.id)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: "14px",
                border: "1px solid #E5E7EB",
                backgroundColor: "#F9FAFB",
                padding: "14px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{article.title}</div>
                <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>{article.summary}</div>
              </div>
              <Link2 size={16} color="#4338CA" />
            </button>
          );
        }
        if (item.targetType === "directory") {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenDirectory(item.id)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: "14px",
                border: "1px solid #E5E7EB",
                backgroundColor: "#F9FAFB",
                padding: "14px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{item.label}</div>
              <ChevronRight size={16} color="#4338CA" />
            </button>
          );
        }
        return (
          <a
            key={`${item.label}-${item.href}`}
            href={item.href}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: "14px",
              border: "1px solid #E5E7EB",
              backgroundColor: "#F9FAFB",
              padding: "14px 16px",
              textDecoration: "none",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{item.label}</div>
            <ExternalLink size={16} color="#4338CA" />
          </a>
        );
      })}
    </div>
  );
}

function RenderBlock({ block }) {
  const tone = toneStyles(block.tone);
  if (block.type === "examples") {
    return (
      <div style={{ ...tone, borderRadius: "16px", padding: "18px" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: tone.title, marginBottom: "10px" }}>
          {block.title}
        </div>
        <div style={{ display: "grid", gap: "14px" }}>
          {block.items?.map((item) => (
            <div key={item.id || item.title}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#4338CA", marginBottom: "6px" }}>
                {item.title}
              </div>
              <div style={{ fontSize: "14px", color: tone.body, lineHeight: 1.65 }}>{item.content}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === "list" || block.type === "steps") {
    return (
      <div style={{ ...tone, borderRadius: "16px", padding: "18px" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: tone.title, marginBottom: "10px" }}>
          {block.title}
        </div>
        <ol
          style={{
            margin: 0,
            paddingLeft: block.type === "steps" ? "20px" : "18px",
            color: tone.body,
            lineHeight: 1.7,
          }}
        >
          {block.items?.map((item, index) => (
            <li key={`${block.id}-${index}`} style={{ marginBottom: "8px" }}>
              {item}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div style={{ ...tone, borderRadius: "16px", padding: "18px" }}>
      <div style={{ fontSize: "15px", fontWeight: 800, color: tone.title, marginBottom: "10px" }}>
        {block.title}
      </div>
      <div style={{ fontSize: "14px", color: tone.body, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
        {block.text || "No content added yet."}
      </div>
    </div>
  );
}

function MetaList({ title, items, emptyLabel = "Not specified" }) {
  return (
    <Card padding={18}>
      <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
        {title}
      </div>
      {items?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {items.map((item, index) => (
            <Badge key={`${title}-${index}`} tone="muted">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: "13px", color: "#9CA3AF" }}>{emptyLabel}</div>
      )}
    </Card>
  );
}

function FieldSection({ title, children }) {
  if (!children) return null;
  return (
    <Card padding={20}>
      <div
        style={{
          fontSize: "12px",
          fontWeight: 800,
          color: "#6B7280",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "10px",
        }}
      >
        {title}
      </div>
      {children}
    </Card>
  );
}

function KeyValueGrid({ items }) {
  const populated = items.filter((item) => item.value && (!Array.isArray(item.value) || item.value.length));
  if (!populated.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
      {populated.map((item) => (
        <div
          key={item.label}
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: "14px",
            padding: "14px",
            backgroundColor: "#F9FAFB",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#6B7280",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
            }}
          >
            {item.label}
          </div>
          {Array.isArray(item.value) ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {item.value.map((value, index) => (
                <Badge key={`${item.label}-${index}`} tone="muted">
                  {value}
                </Badge>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.7 }}>{item.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function HomeView({
  data,
  articlesById,
  onOpenCategory,
  onOpenArticle,
  onOpenDirectory,
  query,
  searchResults,
}) {
  const populatedCategories = data.categories.filter((category) => category.articleCount > 0);
  const starterCategories = data.categories.filter((category) => category.articleCount === 0);

  if (query.trim()) {
    return (
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={{ fontSize: "13px", color: "#6B7280" }}>
          {searchResults.length} result{searchResults.length === 1 ? "" : "s"} for "{query}"
        </div>
        <LinkList
          items={searchResults.map((article) => ({ id: article.id, targetType: "article" }))}
          onSelectArticle={onOpenArticle}
          onOpenDirectory={onOpenDirectory}
          articlesById={articlesById}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "22px" }}>
      <Card padding={24}>
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <Badge tone="accent">Knowledge Base Home</Badge>
            <span style={{ fontSize: "13px", color: "#6B7280" }}>
              A centralized operational framework for systems, processes, data governance, and institutional knowledge.
            </span>
          </div>
          <h2 style={{ fontSize: "28px", lineHeight: 1.1, margin: 0, color: "#111827" }}>
            Advancement Knowledge Base
          </h2>
          <p style={{ margin: 0, fontSize: "14px", color: "#6B7280", lineHeight: 1.7 }}>
            Connect procedures, systems, reporting standards, and operational workflows across University Advancement
            and related departments through a structured, searchable knowledge network.
          </p>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
        <Card padding={20}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "14px", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Start Here
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827", marginTop: "4px" }}>
                Suggested first reads
              </div>
            </div>
            <LayoutTemplate size={18} color="#4338CA" />
          </div>
          <LinkList
            items={data.startHereArticleIds.map((id) => ({ id, targetType: "article" }))}
            onSelectArticle={onOpenArticle}
            onOpenDirectory={onOpenDirectory}
            articlesById={articlesById}
          />
        </Card>

        <Card padding={20}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "14px", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Quick Links
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827", marginTop: "4px" }}>
                Jump directly
              </div>
            </div>
            <Link2 size={18} color="#4338CA" />
          </div>
          <LinkList
            items={data.quickLinks}
            onSelectArticle={onOpenArticle}
            onOpenDirectory={onOpenDirectory}
            articlesById={articlesById}
          />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {data.directories.map((directory) => (
          <button
            key={directory.id}
            type="button"
            onClick={() => onOpenDirectory(directory.id)}
            style={{
              border: "1px solid #E5E7EB",
              borderRadius: "18px",
              backgroundColor: "white",
              padding: "20px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#111827", marginBottom: "6px" }}>
              {directory.title}
            </div>
            <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.55, marginBottom: "10px" }}>
              {directory.description}
            </div>
            <Badge tone="muted">{directory.count} linked entries</Badge>
          </button>
        ))}
      </div>

      <Card padding={20}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "14px", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Content Categories
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827", marginTop: "4px" }}>
              Browse by subject area
            </div>
          </div>
          <Filter size={18} color="#4338CA" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
          {populatedCategories.map((category) => {
            const Icon = ICON_MAP[category.icon] || FolderKanban;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onOpenCategory(category.id)}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "16px",
                  backgroundColor: "#FBFBFD",
                  padding: "18px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "12px",
                    backgroundColor: "#EEF2FF",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} color="#4338CA" />
                </div>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 800, color: "#111827", marginBottom: "6px" }}>
                    {category.title}
                  </div>
                  <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.55, marginBottom: "8px" }}>
                    {category.description}
                  </div>
                  <Badge tone="muted">{category.articleCount} articles</Badge>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
        <Card padding={20}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Featured / Most Used
          </div>
          <LinkList
            items={(data.featuredArticles.length ? data.featuredArticles : data.recentArticles.slice(0, 5)).map((article) => ({
              id: article.id,
              targetType: "article",
            }))}
            onSelectArticle={onOpenArticle}
            onOpenDirectory={onOpenDirectory}
            articlesById={articlesById}
          />
        </Card>
        <Card padding={20}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Recently Updated
          </div>
          <LinkList
            items={data.recentArticles.map((article) => ({ id: article.id, targetType: "article" }))}
            onSelectArticle={onOpenArticle}
            onOpenDirectory={onOpenDirectory}
            articlesById={articlesById}
          />
        </Card>
      </div>

      {starterCategories.length ? (
        <Card padding={20}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
            Empty Starter Areas
          </div>
          <div style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.7, marginBottom: "12px" }}>
            These categories are ready for user-supplied content and templates, but no published articles are attached yet.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {starterCategories.map((category) => (
              <Badge key={category.id} tone="muted">
                {category.title}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function CategoryView({ category, categoryArticles, categoriesById, articlesById, onBack, onOpenArticle, onOpenCategory }) {
  const relatedCategories = category.relatedCategoryIds
    .map((id) => categoriesById.get(id))
    .filter(Boolean);

  const suggestedNextReads = category.recentlyUpdatedIds
    .map((id) => articlesById.get(id))
    .filter(Boolean);

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <Breadcrumbs
        items={[
          { type: "home", label: "Knowledge Base" },
          { type: "category", label: category.title, id: category.id },
        ]}
        onSelect={(item) => {
          if (item.type === "home") onBack();
        }}
      />

      <Card padding={24}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
              Category
            </div>
            <h2 style={{ margin: 0, fontSize: "28px", color: "#111827" }}>{category.title}</h2>
            <p style={{ margin: "10px 0 0", fontSize: "14px", color: "#6B7280", lineHeight: 1.7 }}>
              {category.description}
            </p>
          </div>
          <Badge tone="accent">{category.articleCount} articles</Badge>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px", alignItems: "start" }}>
        <Card padding={20}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
            Articles
          </div>
          <LinkList
            items={categoryArticles.map((article) => ({ id: article.id, targetType: "article" }))}
            onSelectArticle={onOpenArticle}
            onOpenDirectory={() => {}}
            articlesById={articlesById}
          />
        </Card>

        <div style={{ display: "grid", gap: "14px" }}>
          <Card padding={18}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Related Categories
            </div>
            {relatedCategories.length ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {relatedCategories.map((related) => (
                  <button
                    key={related.id}
                    type="button"
                    onClick={() => onOpenCategory(related.id)}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "12px",
                      backgroundColor: "#F9FAFB",
                      padding: "12px 14px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    {related.title}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "#9CA3AF" }}>No linked categories yet.</div>
            )}
          </Card>

          <Card padding={18}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Suggested Next Reads
            </div>
            <LinkList
              items={suggestedNextReads.map((article) => ({ id: article.id, targetType: "article" }))}
              onSelectArticle={onOpenArticle}
              onOpenDirectory={() => {}}
              articlesById={articlesById}
            />
          </Card>

          <Card padding={18}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Ownership
            </div>
            <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.7 }}>
              <div>Owner: {category.owner?.name || "Not assigned"}</div>
              <div>Reviewer: {category.reviewer?.name || "Not assigned"}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DirectoryView({ directory, items, articlesById, onBack, onOpenArticle }) {
  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <Breadcrumbs
        items={[{ type: "home", label: "Knowledge Base" }, { type: "directory", label: directory.title }]}
        onSelect={(item) => {
          if (item.type === "home") onBack();
        }}
      />
      <Card padding={24}>
        <h2 style={{ margin: 0, fontSize: "28px", color: "#111827" }}>{directory.title}</h2>
        <p style={{ margin: "10px 0 0", fontSize: "14px", color: "#6B7280", lineHeight: 1.7 }}>
          {directory.description}
        </p>
      </Card>
      {items.length ? (
        <LinkList
          items={items.map((article) => ({ id: article.id, targetType: "article" }))}
          onSelectArticle={onOpenArticle}
          onOpenDirectory={() => {}}
          articlesById={articlesById}
        />
      ) : (
        <Card padding={20}>
          <div style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.7 }}>
            No articles are published here yet. Use the Knowledge Base manager to start a new {directory.kind} page from a template.
          </div>
        </Card>
      )}
    </div>
  );
}

function ArticleView({
  article,
  categoriesById,
  articlesById,
  viewer,
  goHome,
  onOpenCategory,
  onOpenArticle,
  onOpenDirectory,
}) {
  const category = categoriesById.get(article.categoryId) || null;
  const relatedArticles = article.relatedArticleIds
    .map((id) => articlesById.get(id))
    .filter(Boolean);
  const relatedSystemArticles = article.relatedSystemIds
    .map((id) => articlesById.get(id))
    .filter(Boolean);
  const relatedProcessArticles = article.relatedProcessIds
    .map((id) => articlesById.get(id))
    .filter(Boolean);
  const previousNextPool = Array.from(articlesById.values()).filter(
    (candidate) => candidate.categoryId === article.categoryId,
  );
  const currentIndex = previousNextPool.findIndex((candidate) => candidate.id === article.id);
  const previousArticle = currentIndex > 0 ? previousNextPool[currentIndex - 1] : null;
  const nextArticle =
    currentIndex >= 0 && currentIndex < previousNextPool.length - 1
      ? previousNextPool[currentIndex + 1]
      : null;

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <Breadcrumbs
        items={[
          { type: "home", label: "Knowledge Base" },
          ...(category ? [{ type: "category", label: category.title, id: category.id }] : []),
          { type: "article", label: article.title, id: article.id },
        ]}
        onSelect={(item) => {
          if (item.type === "home") goHome();
          if (item.type === "category") onOpenCategory(item.id);
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "16px" }}>
          <Card padding={24}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                  <Badge tone="accent">{article.articleType}</Badge>
                  {article.status !== "published" ? <Badge tone="muted">{article.status}</Badge> : null}
                </div>
                <h1 style={{ margin: 0, fontSize: "30px", lineHeight: 1.1, color: "#111827" }}>{article.title}</h1>
                <p style={{ margin: "12px 0 0", fontSize: "15px", color: "#6B7280", lineHeight: 1.75 }}>
                  {article.summary}
                </p>
              </div>
              {viewer?.canEdit ? (
                <a
                  href="/knowledge-base/manage"
                  style={{
                    textDecoration: "none",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    backgroundColor: "#111827",
                    color: "white",
                    fontSize: "13px",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  Edit
                </a>
              ) : null}
            </div>

            {article.tags?.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "18px" }}>
                {article.tags.map((tag) => (
                  <Badge key={tag} tone="muted">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Card>

          {(article.fields.purpose ||
            article.fields.definition ||
            article.fields.whenThisApplies?.length ||
            article.fields.nxtTerminology) && (
            <Card padding={20}>
              <div style={{ display: "grid", gap: "12px" }}>
                {article.fields.purpose || article.fields.definition ? (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                      {article.articleType === "glossary" ? "Definition" : "Purpose"}
                    </div>
                    <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.7 }}>
                      {article.fields.purpose || article.fields.definition}
                    </div>
                  </div>
                ) : null}
                {article.fields.whenThisApplies?.length ? (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                      When This Applies
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {article.fields.whenThisApplies.map((item, index) => (
                        <Badge key={`when-${index}`}>{item}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {article.fields.nxtTerminology ? (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                      NXT-Aligned Terminology
                    </div>
                    <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.7 }}>{article.fields.nxtTerminology}</div>
                  </div>
                ) : null}
              </div>
            </Card>
          )}

          {(article.fields.trigger ||
            article.fields.inputs?.length ||
            article.fields.steps?.length ||
            article.fields.outputs?.length ||
            article.fields.dataCreatedOrUpdated?.length ||
            article.fields.systemsUsed?.length ||
            article.fields.responsibleRoles?.length) && (
            <FieldSection title="Process Map">
              <div style={{ display: "grid", gap: "12px" }}>
                <KeyValueGrid
                  items={[
                    { label: "Trigger", value: article.fields.trigger },
                    { label: "Inputs", value: article.fields.inputs },
                    { label: "Systems Used", value: article.fields.systemsUsed },
                    { label: "Responsible Roles", value: article.fields.responsibleRoles },
                    { label: "Outputs", value: article.fields.outputs },
                    { label: "Data Created or Updated", value: article.fields.dataCreatedOrUpdated },
                  ]}
                />
                {article.fields.steps?.length ? (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                      Steps
                    </div>
                    <ol style={{ margin: 0, paddingLeft: "18px", color: "#374151", lineHeight: 1.8 }}>
                      {article.fields.steps.map((step, index) => (
                        <li key={`step-${index}`} style={{ marginBottom: "8px" }}>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            </FieldSection>
          )}

          {(article.fields.whoUsesIt?.length ||
            article.fields.dataLivesThere?.length ||
            article.fields.sourceOfTruthNotes?.length ||
            article.fields.commonIssues?.length ||
            article.fields.escalationContact) && (
            <FieldSection title="System Notes">
              <div style={{ display: "grid", gap: "12px" }}>
                <KeyValueGrid
                  items={[
                    { label: "Who Uses It", value: article.fields.whoUsesIt },
                    { label: "What Data Lives There", value: article.fields.dataLivesThere },
                    { label: "Source of Truth Notes", value: article.fields.sourceOfTruthNotes },
                    { label: "Escalation Contact", value: article.fields.escalationContact },
                  ]}
                />
                {article.fields.commonIssues?.length ? (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                      Common Issues
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {article.fields.commonIssues.map((issue, index) => (
                        <Badge key={`issue-${index}`} tone="muted">
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </FieldSection>
          )}

          {article.contentBlocks.map((block) => (
            <RenderBlock key={block.id} block={block} />
          ))}

          {(previousArticle || nextArticle) && (
            <Card padding={18}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <button
                  type="button"
                  disabled={!previousArticle}
                  onClick={() => previousArticle && onOpenArticle(previousArticle.id)}
                  style={{
                    borderRadius: "14px",
                    border: "1px solid #E5E7EB",
                    backgroundColor: previousArticle ? "#F9FAFB" : "#F9FAFB",
                    padding: "14px 16px",
                    textAlign: "left",
                    cursor: previousArticle ? "pointer" : "default",
                    opacity: previousArticle ? 1 : 0.45,
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Previous
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginTop: "6px" }}>
                    {previousArticle?.title || "None"}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={!nextArticle}
                  onClick={() => nextArticle && onOpenArticle(nextArticle.id)}
                  style={{
                    borderRadius: "14px",
                    border: "1px solid #E5E7EB",
                    backgroundColor: "#F9FAFB",
                    padding: "14px 16px",
                    textAlign: "left",
                    cursor: nextArticle ? "pointer" : "default",
                    opacity: nextArticle ? 1 : 0.45,
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Next
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginTop: "6px" }}>
                    {nextArticle?.title || "None"}
                  </div>
                </button>
              </div>
            </Card>
          )}
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <Card padding={18}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Metadata
            </div>
            <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.75 }}>
              <div>Category: {category?.title || "Unassigned"}</div>
              <div>Last updated: {article.lastUpdated || "Unknown"}</div>
              <div>Last reviewed: {article.lastReviewed || "Not recorded"}</div>
              <div>Owner: {article.owner?.name || "Not assigned"}</div>
              <div>Reviewer: {article.reviewer?.name || "Not assigned"}</div>
            </div>
          </Card>

          {relatedSystemArticles.length ? (
            <Card padding={18}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                Related Systems
              </div>
              <LinkList
                items={relatedSystemArticles.map((related) => ({ id: related.id, targetType: "article" }))}
                onSelectArticle={onOpenArticle}
                onOpenDirectory={onOpenDirectory}
                articlesById={articlesById}
              />
            </Card>
          ) : article.fields.relatedSystems?.length ? (
            <MetaList title="Related Systems" items={article.fields.relatedSystems} />
          ) : null}
          {relatedProcessArticles.length ? (
            <Card padding={18}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                Related Processes
              </div>
              <LinkList
                items={relatedProcessArticles.map((related) => ({ id: related.id, targetType: "article" }))}
                onSelectArticle={onOpenArticle}
                onOpenDirectory={onOpenDirectory}
                articlesById={articlesById}
              />
            </Card>
          ) : article.fields.relatedProcesses?.length ? (
            <MetaList title="Related Processes" items={article.fields.relatedProcesses} />
          ) : null}
          {article.fields.relatedReports?.length ? (
            <MetaList title="Related Reports" items={article.fields.relatedReports} />
          ) : null}
          {article.fields.relatedProcedures?.length ? (
            <MetaList title="Related Procedures" items={article.fields.relatedProcedures} />
          ) : null}
          {article.fields.responsibleRoles?.length ? (
            <MetaList title="Responsible Roles" items={article.fields.responsibleRoles} />
          ) : null}
          {article.fields.risksCommonFailurePoints?.length ? (
            <MetaList title="Risks / Failure Points" items={article.fields.risksCommonFailurePoints} />
          ) : null}
          {article.fields.relatedRequestLinks?.length ? (
            <Card padding={18}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                Related Forms / Requests
              </div>
              <LinkList items={article.fields.relatedRequestLinks} onSelectArticle={onOpenArticle} onOpenDirectory={onOpenDirectory} articlesById={articlesById} />
            </Card>
          ) : null}

          <Card padding={18}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              See Also
            </div>
            {relatedArticles.length ? (
              <LinkList
                items={relatedArticles.map((related) => ({ id: related.id, targetType: "article" }))}
                onSelectArticle={onOpenArticle}
                onOpenDirectory={onOpenDirectory}
                articlesById={articlesById}
              />
            ) : (
              <div style={{ fontSize: "13px", color: "#9CA3AF" }}>No related articles linked yet.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeBasePage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [activeArticleId, setActiveArticleId] = useState(null);
  const [activeDirectoryId, setActiveDirectoryId] = useState(null);
  const [knowledgeBaseHistory, setKnowledgeBaseHistory] = useState([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/knowledge-base");
      const payload = await response.json();
      if (active) {
        setData(payload);
      }
    }
    load().catch((error) => console.error("Failed to load knowledge base:", error));
    return () => {
      active = false;
    };
  }, []);

  const articles = data?.articles || [];
  const categories = data?.categories || [];
  const directories = data?.directories || [];

  const articlesById = useMemo(
    () => new Map(articles.map((article) => [article.id, article])),
    [articles],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return articles.filter((article) => {
      const blob = [
        article.title,
        article.summary,
        ...(article.tags || []),
        article.fields.purpose,
        ...(article.fields.whenThisApplies || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(normalizedQuery);
    });
  }, [articles, query]);

  const activeArticle = activeArticleId ? articlesById.get(activeArticleId) || null : null;
  const activeCategory = activeCategoryId ? categoriesById.get(activeCategoryId) || null : null;
  const activeDirectory = activeDirectoryId
    ? directories.find((directory) => directory.id === activeDirectoryId) || null
    : null;

  const directoryItems = useMemo(() => {
    if (!activeDirectory) return [];
    if (activeDirectory.kind === "system") return data?.systems || [];
    if (activeDirectory.kind === "process") return data?.processes || [];
    if (activeDirectory.kind === "glossary") return data?.glossary || [];
    if (activeDirectory.kind === "start") {
      return (data?.startHereArticleIds || [])
        .map((id) => articlesById.get(id))
        .filter(Boolean);
    }
    return [];
  }, [activeDirectory, data, articlesById]);

  const categoryArticles = useMemo(
    () => articles.filter((article) => article.categoryId === activeCategoryId && article.status !== "archived"),
    [articles, activeCategoryId],
  );

  function getCurrentKnowledgeBaseView() {
    if (activeArticleId) {
      return {
        type: "article",
        id: activeArticleId,
        categoryId: activeCategoryId,
        directoryId: activeDirectoryId,
      };
    }
    if (activeCategoryId) return { type: "category", id: activeCategoryId };
    if (activeDirectoryId) return { type: "directory", id: activeDirectoryId };
    return { type: "home" };
  }

  function isSameKnowledgeBaseView(left, right) {
    return (
      left?.type === right?.type &&
      String(left?.id || "") === String(right?.id || "") &&
      String(left?.categoryId || "") === String(right?.categoryId || "") &&
      String(left?.directoryId || "") === String(right?.directoryId || "")
    );
  }

  function applyKnowledgeBaseView(view) {
    if (view?.type === "article") {
      setActiveArticleId(view.id || null);
      setActiveCategoryId(view.categoryId || null);
      setActiveDirectoryId(view.directoryId || null);
      return;
    }

    if (view?.type === "category") {
      setActiveCategoryId(view.id || null);
      setActiveArticleId(null);
      setActiveDirectoryId(null);
      return;
    }

    if (view?.type === "directory") {
      setActiveDirectoryId(view.id || null);
      setActiveArticleId(null);
      setActiveCategoryId(null);
      return;
    }

    setActiveCategoryId(null);
    setActiveArticleId(null);
    setActiveDirectoryId(null);
  }

  function navigateKnowledgeBase(nextView) {
    const currentView = getCurrentKnowledgeBaseView();
    if (!isSameKnowledgeBaseView(currentView, nextView)) {
      setKnowledgeBaseHistory((current) => [...current, currentView].slice(-20));
    }
    applyKnowledgeBaseView(nextView);
  }

  function goBackInKnowledgeBase() {
    const previousView = knowledgeBaseHistory[knowledgeBaseHistory.length - 1] || { type: "home" };
    setKnowledgeBaseHistory((current) => current.slice(0, -1));
    applyKnowledgeBaseView(previousView);
  }

  function goHome() {
    setKnowledgeBaseHistory([]);
    setActiveCategoryId(null);
    setActiveArticleId(null);
    setActiveDirectoryId(null);
  }

  const isKnowledgeBaseHome = !activeArticle && !activeCategory && !activeDirectory;

  if (!data) {
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
        Loading Knowledge Base...
      </div>
    );
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
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid #E5E7EB",
          backgroundColor: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: "1240px",
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            gap: "14px",
            alignItems: "center",
          }}
        >
          {!isKnowledgeBaseHome ? (
            <button
              type="button"
              onClick={goBackInKnowledgeBase}
              aria-label="Back in Knowledge Base"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                display: "grid",
                placeItems: "center",
                backgroundColor: "#F3F4F6",
                border: "1px solid #E5E7EB",
                textDecoration: "none",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <ArrowLeft size={18} color="#374151" />
            </button>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "21px", fontWeight: 900, color: "#111827" }}>Knowledge Base</div>
            <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>
              Interconnected procedures, systems, process maps, and reference guidance.
            </div>
          </div>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              minHeight: "40px",
              borderRadius: "12px",
              padding: "0 13px",
              backgroundColor: "#F3F4F6",
              border: "1px solid #E5E7EB",
              color: "#374151",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 800,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <Home size={16} color="#374151" />
            Return to home
          </a>
          {data.viewer?.canEdit ? (
            <a
              href="/knowledge-base/manage"
              style={{
                textDecoration: "none",
                borderRadius: "12px",
                padding: "11px 14px",
                backgroundColor: "#111827",
                color: "white",
                fontSize: "13px",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              Manage KB
            </a>
          ) : null}
        </div>
      </header>

      <main style={{ maxWidth: "1240px", margin: "0 auto", padding: "26px 24px 60px" }}>
        <div style={{ marginBottom: "20px" }}>
          <SearchBar value={query} onChange={setQuery} />
        </div>

        {activeArticle ? (
          <ArticleView
            article={activeArticle}
            categoriesById={categoriesById}
            articlesById={articlesById}
            viewer={data.viewer}
            goHome={goHome}
            onOpenCategory={(id) => {
              navigateKnowledgeBase({ type: "category", id });
            }}
            onOpenArticle={(id) => {
              navigateKnowledgeBase({ type: "article", id });
            }}
            onOpenDirectory={(id) => {
              navigateKnowledgeBase({ type: "directory", id });
            }}
          />
        ) : activeCategory ? (
          <CategoryView
            category={activeCategory}
            categoryArticles={categoryArticles}
            categoriesById={categoriesById}
            articlesById={articlesById}
            onBack={goHome}
            onOpenArticle={(id) =>
              navigateKnowledgeBase({
                type: "article",
                id,
                categoryId: activeCategory.id,
              })
            }
            onOpenCategory={(id) => navigateKnowledgeBase({ type: "category", id })}
          />
        ) : activeDirectory ? (
          <DirectoryView
            directory={activeDirectory}
            items={directoryItems}
            articlesById={articlesById}
            onBack={goHome}
            onOpenArticle={(id) =>
              navigateKnowledgeBase({
                type: "article",
                id,
                directoryId: activeDirectory.id,
              })
            }
          />
        ) : (
          <HomeView
            data={data}
            articlesById={articlesById}
            onOpenCategory={(id) => {
              navigateKnowledgeBase({ type: "category", id });
            }}
            onOpenArticle={(id) => {
              navigateKnowledgeBase({ type: "article", id });
            }}
            onOpenDirectory={(id) => {
              navigateKnowledgeBase({ type: "directory", id });
            }}
            query={query}
            searchResults={searchResults}
          />
        )}
      </main>
    </div>
  );
}

export const PROJECT_VIEW_LIMIT = 12;
const token = value => typeof value === "string" && value.length > 0 && value.length <= 200;

export function projectViewStorageKey(viewerId, projectKey) {
  return token(viewerId) && token(projectKey)
    ? `ju:project-views:v1:${encodeURIComponent(viewerId)}:${encodeURIComponent(projectKey)}` : null;
}

export function normalizeProjectView(value) {
  if (!value || !["all", "untagged", "any", "allSelected"].includes(value.mode) ||
    !Array.isArray(value.tagIds) || value.tagIds.length > 100 || !value.tagIds.every(token) ||
    !["active", "archived", "all"].includes(value.status) || typeof value.groupSpouses !== "boolean" ||
    !token(value.sort?.key) || !["ascending", "descending"].includes(value.sort.direction)) return null;
  const tagIds = [...new Set(value.tagIds)].sort();
  if (["any", "allSelected"].includes(value.mode) && !tagIds.length) return null;
  return { mode: value.mode, tagIds: ["all", "untagged"].includes(value.mode) ? [] : tagIds,
    status: value.status, groupSpouses: value.groupSpouses, sort: { key: value.sort.key, direction: value.sort.direction } };
}

export function decodeProjectViews(raw) {
  if (!raw) return [];
  if (typeof raw !== "string" || raw.length > 100000) throw new Error("Saved views could not be read. Your current list is unchanged.");
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1 || !Array.isArray(parsed.views) || parsed.views.length > PROJECT_VIEW_LIMIT) throw new Error("Saved views could not be read. Your current list is unchanged.");
  const views = parsed.views.map(item => {
    const settings = normalizeProjectView(item?.settings);
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!token(item?.id) || !name || name.length > 60 || !settings) throw new Error("Saved views could not be read. Your current list is unchanged.");
    return { id: item.id, name, settings };
  });
  if (new Set(views.map(v => v.id)).size !== views.length || new Set(views.map(v => v.name.toLowerCase())).size !== views.length) throw new Error("Saved views could not be read. Your current list is unchanged.");
  return views;
}

export function projectViewProblem(settings, tags, sortOptions) {
  const view = normalizeProjectView(settings);
  if (!view) return "Choose at least one tag before saving this view.";
  if (view.tagIds.some(id => !tags.some(tag => tag.id === id))) return "This view includes a tag that is no longer available. The view was not applied. Choose current tags and save a new view.";
  if (!sortOptions.some(option => option.key === view.sort.key)) return "This view sorts by a column that is no longer visible. Show that column or choose a different sort before applying it.";
  return "";
}

export function matchesProjectTags(assigned, mode, tagIds) {
  if (mode === "all") return true;
  if (mode === "untagged") return !assigned?.size;
  if (!tagIds.length) return false;
  return mode === "allSelected" ? tagIds.every(id => assigned?.has(id)) : tagIds.some(id => assigned?.has(id));
}

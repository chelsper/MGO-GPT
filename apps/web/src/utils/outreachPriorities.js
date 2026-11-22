import { validActionDate } from "./actionEntryOptions";

export const PRIORITY_COUNTS = Object.freeze({
  open: "Open assignments",
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Upcoming",
  drafts: "NXT drafts",
  verification: "NXT verification",
});

export function validateOutreachPriorities(value) {
  const keys = new Set();
  if (
    typeof value?.canRecord !== "boolean" ||
    !validActionDate(value.today) ||
    !Number.isFinite(Date.parse(value.checkedAt)) ||
    !Array.isArray(value.projects) ||
    value.projects.length > 1000 ||
    (!value.canRecord && value.projects.length) ||
    value.projects.some((project) => {
      if (
        !project ||
        typeof project.key !== "string" ||
        !project.key ||
        keys.has(project.key)
      )
        return true;
      keys.add(project.key);
      return (
        Object.keys(PRIORITY_COUNTS).some(
          (key) => !Number.isSafeInteger(project[key]) || project[key] < 0,
        ) || project.open !== project.overdue + project.today + project.upcoming
      );
    })
  )
    throw new Error(
      "Saved priorities are incomplete. Open a project or reload the overview.",
    );
  return value;
}

export function prioritizeOutreachProjects(projects, summary, filter = "all") {
  const counts = new Map(
    (summary?.projects || []).map((project) => [project.key, project]),
  );
  const score = (p) =>
    p?.overdue
      ? 0
      : p?.today
        ? 1
        : p?.verification
          ? 2
          : p?.drafts
            ? 3
            : p?.open
              ? 4
              : 5;
  return projects
    .map((project) => ({ ...project, priorities: counts.get(project.key) }))
    .filter(
      (project) =>
        filter === "all" ||
        (filter === "actions"
          ? project.priorities?.drafts + project.priorities?.verification > 0
          : project.priorities?.[filter] > 0),
    )
    .sort(
      (a, b) =>
        score(a.priorities) - score(b.priorities) ||
        a.title.localeCompare(b.title) ||
        a.key.localeCompare(b.key),
    );
}

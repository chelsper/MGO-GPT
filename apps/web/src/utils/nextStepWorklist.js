export function nextStepName(item) {
  return item.prospect_name || item.constituent_name || (item.source_topic_key === "general" ? "General follow-up" : "Constituent name unavailable");
}

export function nextStepDay(value) {
  const day = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? "" : day;
}

export function formatNextStepDate(value) {
  const day = nextStepDay(value);
  return day ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${day}T12:00:00Z`)) : "No date";
}

export function formatNextStepCompletion(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Completed (date unavailable)";
  return `Completed ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(date)}`;
}

export function buildNextStepGroups(items, asOf, status = "Open", search = "") {
  const groups = status === "Done"
    ? [{ key: "completed", label: "Completed", items: [] }]
    : ["Overdue", "Today", "Upcoming", "No date"].map(label => ({ key: label, label, items: [] }));
  const query = search.trim().toLocaleLowerCase();
  const visible = items.filter(item => !query || [nextStepName(item), item.title, item.details, item.opportunity_title, item.category]
    .some(value => String(value || "").toLocaleLowerCase().includes(query)));
  visible.sort((a, b) => {
    if (status === "Done") {
      const byCompletion = String(b.completed_at || "").localeCompare(String(a.completed_at || ""));
      if (byCompletion) return byCompletion;
    }
    return (nextStepDay(a.due_date) || "9999").localeCompare(nextStepDay(b.due_date) || "9999") || Number(a.id) - Number(b.id);
  });
  for (const item of visible) {
    const date = nextStepDay(item.due_date);
    const key = status === "Done" ? "completed" : !date ? "No date" : date < asOf ? "Overdue" : date === asOf ? "Today" : "Upcoming";
    groups.find(group => group.key === key).items.push(item);
  }
  return groups;
}

export function pageNextStepGroups(groups, page, pageSize = 25) {
  let offset = 0;
  return groups.map(group => {
    const start = offset;
    offset += group.items.length;
    return { ...group, total: group.items.length, items: group.items.slice(Math.max(0, (page - 1) * pageSize - start), Math.max(0, page * pageSize - start)) };
  }).filter(group => group.items.length);
}

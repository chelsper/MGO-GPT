export const MGO_NAV_ITEMS = [
  { label: "My Prospects", href: "/my-top-prospects", section: "My Work" },
  { label: "My Reports", href: "/reports", section: "My Work" },
  { label: "Team Discussion", href: "/team-discussion", section: "My Work" },
  { label: "Log Update", href: "/action-opportunity-update", section: "Team & Support" },
  { label: "Prospect Pool", href: "/prospect-pool", section: "Team & Support" },
  { label: "Knowledge Base", href: "/knowledge-base", section: "Team & Support" },
  { label: "Find a Constituent", href: "/constituent-lookup", section: "Team & Support" },
  { label: "Submission Tracker", href: "/submissions", section: "Requests & Review" },
  { label: "Request List from DevData", href: "/request-list", section: "Requests & Review" },
  { label: "Data Requests", href: "/data-requests", section: "Requests & Review" },
  { label: "Suggest New Constituent", href: "/new-constituent", section: "Requests & Review" },
];

export const REVIEWER_NAV_ITEMS = [
  { label: "Work Queue", href: "/submissions", section: "Daily Work", description: "Start here for requests and NXT exceptions in one queue." },
  { label: "Prospect Pool", href: "/prospect-pool", section: "Daily Work", description: "Assign prospects to MGOs and follow up on contact information requests." },
  { label: "Team Discussion", href: "/team-discussion", section: "Daily Work", description: "Coordinate talking points, handoffs, and follow-up with the team." },
  { label: "Pledge Payments", href: "/pledge-payments", section: "Reports & Exports", description: "See past-due and upcoming payments, amounts paid, and pledge schedules." },
  { label: "Top Prospect Exports", href: "/prospect-exports", section: "Reports & Exports", description: "Choose one or more MGOs and download a master workbook with opportunity details." },
  { label: "List Request Queue", href: "/list-requests", section: "Requests", description: "Prioritize list requests and send questions or delivery notes to MGOs." },
  { label: "Data Request Queue", href: "/data-requests", section: "Requests", description: "Review contact information and constituent record corrections." },
  { label: "Constituency Import", href: "/constituency-import", section: "Imports", description: "Upload a file, resolve possible matches, and review changes before sending to NXT." },
  { label: "Family Import", href: "/family-import", section: "Imports", description: "Review parents and family relationships before creating or linking NXT records." },
  { label: "Import History", href: "/import-history", section: "Imports", description: "View successfully imported records and failed imports. Read-only results; nothing to approve." },
  { label: "Find a Constituent", href: "/constituent-lookup", section: "Tools & Guidance", description: "Search NXT and open a constituent profile." },
  { label: "Knowledge Base", href: "/knowledge-base", section: "Tools & Guidance", description: "Find standards, examples, and process guidance." },
  { label: "Edit Knowledge Base", href: "/knowledge-base/manage", section: "Tools & Guidance", description: "Maintain the team's shared guidance and examples." },
];

export const ADMIN_WORKSPACE_ITEMS = [
  { label: "Field Settings", href: "/blackbaud-mapping", section: "Admin & Workspace", description: "Manage field mapping, ownership, and NXT sync behavior." },
  { label: "Security & Access", href: "/access-management", section: "Admin & Workspace", description: "Manage workspace users, roles, invitations, and access." },
  {
    label: "Organization Settings",
    href: "/organization-configurations",
    section: "Admin & Workspace",
    description: "Manage organization details, notifications, and giving society definitions.",
  },
  {
    label: "Report Access & Configurations",
    href: "/report-configurations",
    section: "Reports & Exports",
    description: "Build report panels, choose data sources, and manage who can view them.",
  },
];

const SECTION_ORDER = ["Daily Work", "Reports & Exports", "Requests", "Imports", "Tools & Guidance", "My Work", "Team & Support", "Requests & Review", "Admin & Workspace"];

const ROUTE_LABELS = {
  "/": "Home",
  "/access-management": "Security & Access",
  "/action-opportunity-update": "Log Update",
  "/blackbaud-mapping": "Field Settings",
  "/constituency-import": "Constituency Import",
  "/constituent-lookup": "Find a Constituent",
  "/data-requests": "Data Requests",
  "/family-import": "Family Import",
  "/import-history": "Import History",
  "/knowledge-base": "Knowledge Base",
  "/knowledge-base/manage": "Edit Knowledge Base",
  "/list-requests": "List Request Queue",
  "/log-donor-update": "Log Donor Update",
  "/my-top-prospects": "My Prospects",
  "/new-constituent": "Suggest New Constituent",
  "/organization-configurations": "Organization Settings",
  "/prospect-pool": "Prospect Pool",
  "/prospect-exports": "Top Prospect Exports",
  "/pledge-payments": "Pledge Payments",
  "/report-configurations": "Report Access & Configurations",
  "/reports": "My Reports",
  "/request-list": "Request List from DevData",
  "/settings": "My Account & Connections",
  "/submissions": "Work Queue",
  "/team-discussion": "Team Discussion",
  "/update-opportunity": "Update Opportunity",
};

const REPORT_ROUTE_LABELS = {
  "/reports/future-made-phase-ii": "Future. Made. Phase II",
  "/reports/alumni-family-engagement": "Alumni & Family Engagement",
  "/reports/executive-team-standings": "Team Standings",
};

export function getNavigationItems({ isReviewer, canManageWorkspace }) {
  if (!isReviewer) return MGO_NAV_ITEMS;
  return canManageWorkspace
    ? [...REVIEWER_NAV_ITEMS, ...ADMIN_WORKSPACE_ITEMS]
    : REVIEWER_NAV_ITEMS;
}

export function groupNavigationItems(items) {
  return SECTION_ORDER.map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);
}

export function isNavigationItemActive(pathname, href) {
  if (href === "/") return pathname === "/";
  if (href === "/reports") {
    return pathname === href || pathname.startsWith("/reports/");
  }
  return pathname === href;
}

export function getBreadcrumbs(pathname) {
  if (!pathname || pathname === "/") return [];

  const exactLabel = ROUTE_LABELS[pathname];
  if (exactLabel) {
    return [
      { label: "Home", href: "/" },
      { label: exactLabel },
    ];
  }

  if (pathname.startsWith("/reports/")) {
    const fallback = pathname
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return [
      { label: "Home", href: "/" },
      { label: "My Reports", href: "/reports" },
      { label: REPORT_ROUTE_LABELS[pathname] || fallback || "Report" },
    ];
  }

  return [
    { label: "Home", href: "/" },
    { label: "Current page" },
  ];
}

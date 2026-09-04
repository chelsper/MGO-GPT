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
  { label: "Prospect Pool", href: "/prospect-pool", section: "My Work" },
  { label: "Team Discussion", href: "/team-discussion", section: "Team & Support" },
  { label: "Knowledge Base", href: "/knowledge-base", section: "Team & Support" },
  { label: "Edit Knowledge Base", href: "/knowledge-base/manage", section: "Team & Support" },
  { label: "Find a Constituent", href: "/constituent-lookup", section: "Team & Support" },
  { label: "Work Queue", href: "/submissions", section: "Requests & Review" },
  { label: "List Requests", href: "/list-requests", section: "Requests & Review" },
  { label: "Data Requests", href: "/data-requests", section: "Requests & Review" },
  { label: "Import Preview", href: "/constituency-import", section: "Requests & Review" },
  { label: "Family Import", href: "/family-import", section: "Requests & Review" },
];

export const ADMIN_WORKSPACE_ITEMS = [
  { label: "Field Settings", href: "/blackbaud-mapping", section: "Admin & Workspace" },
  { label: "Security & Access", href: "/access-management", section: "Admin & Workspace" },
  {
    label: "Organization Settings",
    href: "/organization-configurations",
    section: "Admin & Workspace",
  },
  {
    label: "Report Access & Configurations",
    href: "/report-configurations",
    section: "Admin & Workspace",
  },
];

const SECTION_ORDER = ["My Work", "Team & Support", "Requests & Review", "Admin & Workspace"];

const ROUTE_LABELS = {
  "/": "Home",
  "/access-management": "Security & Access",
  "/action-opportunity-update": "Log Update",
  "/blackbaud-mapping": "Field Settings",
  "/constituency-import": "Constituency Import",
  "/constituent-lookup": "Find a Constituent",
  "/data-requests": "Data Requests",
  "/family-import": "Family Import",
  "/knowledge-base": "Knowledge Base",
  "/knowledge-base/manage": "Edit Knowledge Base",
  "/list-requests": "List Request Queue",
  "/log-donor-update": "Log Donor Update",
  "/my-top-prospects": "My Prospects",
  "/new-constituent": "Suggest New Constituent",
  "/organization-configurations": "Organization Settings",
  "/prospect-pool": "Prospect Pool",
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
  "/reports/executive-team-standings": "Executive Team Standings",
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCircle2,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import {
  canManageWorkspaceRole,
  canUseExecutiveViewRole,
  canViewWorkspaceAsRole,
  getWorkspaceRoleLabel,
} from "@/utils/workspaceRoles";
import {
  getBreadcrumbs,
  getNavigationItems,
  groupNavigationItems,
  isNavigationItemActive,
} from "@/utils/appNavigation";
import WorkQueueAlertBadge from "@/components/WorkQueueAlertBadge";
import styles from "./AppShell.module.css";

const PUBLIC_ROUTE_PREFIXES = ["/account/", "/forgot-password", "/reset-password"];

const REVIEWER_NOTIFICATIONS = [
  { key: "submissions", label: "Submissions need review", href: "/submissions" },
  { key: "dataRequests", label: "Data requests are open", href: "/data-requests" },
  { key: "listRequests", label: "List requests are open", href: "/list-requests" },
  { key: "constituencyImports", label: "Constituency imports need attention", href: "/constituency-import" },
  { key: "familyImports", label: "Family imports need attention", href: "/family-import" },
  { key: "prospectPool", label: "Prospect pool records need follow-up", href: "/prospect-pool" },
  { key: "discussions", label: "Team discussions are open", href: "/team-discussion" },
];

const MGO_NOTIFICATIONS = [
  { key: "overdueNextSteps", label: "Next steps are overdue", href: "/my-top-prospects" },
  { key: "clarificationRequests", label: "Requests need clarification", href: "/submissions" },
  { key: "openDiscussionItems", label: "Team discussions need attention", href: "/team-discussion" },
];

function safeCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function NavigationCount({ item, queueCounts, discussionCount }) {
  if (item.href === "/team-discussion") {
    const count = safeCount(discussionCount);
    if (!count) return null;
    return <span className={styles.countBadge}>{count.toLocaleString()}</span>;
  }

  return <WorkQueueAlertBadge href={item.href} counts={queueCounts} compact />;
}

function Breadcrumbs({ pathname }) {
  const breadcrumbs = getBreadcrumbs(pathname);
  if (!breadcrumbs.length) return null;

  return (
    <div className={styles.breadcrumbBar}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <span className={styles.breadcrumbItem} key={`${item.href || "current"}-${item.label}`}>
              {index > 0 ? <ChevronRight aria-hidden="true" size={14} /> : null}
              {item.href && !isLast ? (
                <a href={item.href}>{item.label}</a>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

export default function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user, loading: userLoading } = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const notificationsRef = useRef(null);
  const accountRef = useRef(null);
  const pathname = location.pathname;
  const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  const { data: profilePayload } = useQuery({
    queryKey: ["app-shell-profile", user?.email || "anonymous"],
    queryFn: async () => {
      const response = await fetch("/api/users/profile", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Failed to load profile");
      return payload;
    },
    enabled: Boolean(user && !isPublicRoute),
    staleTime: 5 * 60 * 1000,
  });
  const profile = profilePayload?.user || null;
  const {
    isAdmin,
    adminViewMode,
    effectiveRole,
    isMgoView,
    isReviewerView,
    setViewMode,
  } = useWorkspaceView(profile?.role);
  const canManageWorkspace = canManageWorkspaceRole(profile?.role);
  const canSwitchMgoWorkspace = canUseExecutiveViewRole(profile?.role);
  const navigationItems = useMemo(
    () => getNavigationItems({ isReviewer: isReviewerView, canManageWorkspace }),
    [canManageWorkspace, isReviewerView],
  );
  const navigationGroups = useMemo(
    () => groupNavigationItems(navigationItems),
    [navigationItems],
  );

  const { data: worklist, isError: worklistFailed } = useQuery({
    queryKey: ["app-shell-worklist", profile?.id, effectiveRole],
    queryFn: async () => {
      const response = await fetch(`/api/worklist?view=${encodeURIComponent(effectiveRole)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Failed to load notifications");
      return payload;
    },
    enabled: Boolean(user && profile && !isPublicRoute),
    staleTime: 60 * 1000,
    refetchInterval: isReviewerView ? 60 * 1000 : 2 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
  const queueCounts = isReviewerView ? worklist?.queueCounts : undefined;
  const discussionCount = isReviewerView
    ? safeCount(queueCounts?.discussions)
    : safeCount(worklist?.summary?.openDiscussionItems);
  const notifications = useMemo(() => {
    const definitions = isReviewerView ? REVIEWER_NOTIFICATIONS : MGO_NOTIFICATIONS;
    const source = isReviewerView ? worklist?.queueCounts : worklist?.summary;
    return definitions
      .map((definition) => ({ ...definition, count: safeCount(source?.[definition.key]) }))
      .filter((item) => item.count > 0);
  }, [isReviewerView, worklist]);
  const notificationCount = notifications.reduce((sum, item) => sum + item.count, 0);

  const { data: actingWorkspaceStatus } = useQuery({
    queryKey: ["acting-workspace-status", profile?.id, effectiveRole],
    queryFn: async () => {
      const response = await fetch("/api/admin/workspace-user");
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Failed to load acting workspace");
      return payload;
    },
    enabled: Boolean(canSwitchMgoWorkspace && isMgoView && !isPublicRoute),
  });
  const { data: mgoUsers = [] } = useQuery({
    queryKey: ["workspace-mgo-users", profile?.id, effectiveRole],
    queryFn: async () => {
      const response = await fetch("/api/users/mgos");
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload?.error || "Failed to load MGO users");
      return Array.isArray(payload) ? payload : [];
    },
    enabled: Boolean(canSwitchMgoWorkspace && isMgoView && !isPublicRoute),
  });
  const actingUser = actingWorkspaceStatus?.actingUser || null;

  useEffect(() => {
    setDrawerOpen(false);
    setNotificationsOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen && !notificationsOpen && !accountOpen) return undefined;

    function handleEscape(event) {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
      setNotificationsOpen(false);
      setAccountOpen(false);
    }

    function handlePointerDown(event) {
      if (notificationsOpen && !notificationsRef.current?.contains(event.target)) {
        setNotificationsOpen(false);
      }
      if (accountOpen && !accountRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [accountOpen, drawerOpen, notificationsOpen]);

  useEffect(() => {
    if (pathname !== "/constituent-lookup") return;
    setSearchText(new URLSearchParams(location.search).get("q") || "");
  }, [location.search, pathname]);

  function handleSearch(event) {
    event.preventDefault();
    const query = searchText.trim();
    navigate(query ? `/constituent-lookup?q=${encodeURIComponent(query)}` : "/constituent-lookup");
  }

  async function handleViewModeChange(nextMode) {
    if (!isAdmin || nextMode === adminViewMode) return;
    setViewMode(nextMode);
    setAccountOpen(false);
    if (nextMode === "mgo") {
      await fetch("/api/admin/workspace-user", { method: "DELETE" }).catch(() => null);
    }
    window.location.replace("/");
  }

  async function handleActingWorkspaceChange(nextUserId) {
    if (!canSwitchMgoWorkspace || !isMgoView) return;
    setWorkspaceError("");

    try {
      const returningToSelf = !nextUserId || String(nextUserId) === String(profile?.id || "");
      const response = await fetch("/api/admin/workspace-user", {
        method: returningToSelf ? "DELETE" : "POST",
        headers: returningToSelf ? undefined : { "Content-Type": "application/json" },
        body: returningToSelf ? undefined : JSON.stringify({ userId: Number(nextUserId) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Failed to switch workspace");
      queryClient.setQueryData(["acting-workspace-status", profile?.id, effectiveRole], {
        adminUser: profile,
        actingUser: returningToSelf ? null : payload?.actingUser || null,
      });
      window.location.replace("/");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Failed to switch workspace");
    }
  }

  if (isPublicRoute || userLoading || !user) return children;

  const workspaceLabel = isReviewerView ? "Advancement Services" : "MGO Workspace";
  const roleLabel = isAdmin
    ? `Admin · ${isReviewerView ? "Advancement Services view" : "MGO view"}`
    : getWorkspaceRoleLabel(profile?.role) || workspaceLabel;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandArea}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu aria-hidden="true" size={20} />
            </button>
            <a className={styles.brand} href="/" aria-label="JUMGOGPT home">
              <span className={styles.brandMark} aria-hidden="true">JU</span>
              <span className={styles.brandName}>JUMGOGPT</span>
            </a>
            <span className={styles.workspaceLabel}>{workspaceLabel}</span>
          </div>

          <form className={styles.searchForm} role="search" onSubmit={handleSearch}>
            <Search aria-hidden="true" size={18} />
            <input
              aria-label="Search constituents"
              placeholder="Search constituents"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </form>

          <div className={styles.headerActions}>
            <div className={styles.menuAnchor} ref={notificationsRef}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={notificationCount ? `${notificationCount} items need attention` : "Notifications"}
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setAccountOpen(false);
                }}
              >
                <Bell aria-hidden="true" size={19} />
                {notificationCount ? (
                  <span className={styles.notificationBadge}>
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                ) : null}
              </button>
              {notificationsOpen ? (
                <div className={styles.popover} role="dialog" aria-label="Notifications">
                  <div className={styles.popoverHeading}>
                    <div>
                      <strong>Needs attention</strong>
                      <span>{workspaceLabel}</span>
                    </div>
                    {worklistFailed ? <span className={styles.errorText}>Could not refresh</span> : null}
                  </div>
                  <div className={styles.notificationList}>
                    {notifications.length ? notifications.map((item) => (
                      <a href={item.href} key={item.key} className={styles.notificationItem}>
                        <span>{item.label}</span>
                        <strong>{item.count.toLocaleString()}</strong>
                      </a>
                    )) : (
                      <div className={styles.emptyState}>No items need your attention right now.</div>
                    )}
                  </div>
                  <a className={styles.popoverFooter} href={isReviewerView ? "/submissions" : "/"}>
                    {isReviewerView ? "Open work queue" : "Open today’s focus"}
                    <ChevronRight aria-hidden="true" size={15} />
                  </a>
                </div>
              ) : null}
            </div>

            <a className={`${styles.iconButton} ${styles.helpButton}`} href="/knowledge-base" aria-label="Help and knowledge base">
              <HelpCircle aria-hidden="true" size={19} />
            </a>

            <div className={styles.menuAnchor} ref={accountRef}>
              <button
                type="button"
                className={styles.accountButton}
                aria-label="Open account menu"
                aria-expanded={accountOpen}
                onClick={() => {
                  setAccountOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
              >
                <UserCircle2 aria-hidden="true" size={18} />
                <span>{profile?.name?.split(" ")[0] || "Account"}</span>
                <ChevronDown aria-hidden="true" size={15} />
              </button>
              {accountOpen ? (
                <div className={`${styles.popover} ${styles.accountPopover}`} role="menu" aria-label="Account menu">
                  <div className={styles.accountIdentity}>
                    <strong>{profile?.name || user?.name || "JUMGOGPT User"}</strong>
                    <span>{profile?.email || user?.email || ""}</span>
                    <small>{roleLabel}</small>
                  </div>

                  {isAdmin ? (
                    <div className={styles.accountSection}>
                      <span className={styles.fieldLabel}>Workspace view</span>
                      <div className={styles.segmentedControl}>
                        <button
                          type="button"
                          className={adminViewMode === "reviewer" ? styles.segmentActive : ""}
                          onClick={() => handleViewModeChange("reviewer")}
                        >
                          Advancement Services
                        </button>
                        <button
                          type="button"
                          className={adminViewMode === "mgo" ? styles.segmentActive : ""}
                          onClick={() => handleViewModeChange("mgo")}
                        >
                          MGO
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {canSwitchMgoWorkspace && isMgoView ? (
                    <label className={styles.accountSection}>
                      <span className={styles.fieldLabel}>View workspace</span>
                      <select
                        value={actingUser?.id || profile?.id || ""}
                        onChange={(event) => handleActingWorkspaceChange(event.target.value)}
                      >
                        <option value={profile?.id || ""}>My workspace</option>
                        {mgoUsers
                          .filter((mgoUser) =>
                            canViewWorkspaceAsRole(profile?.role, mgoUser.role)
                            && String(mgoUser.id) !== String(profile?.id || ""))
                          .map((mgoUser) => (
                            <option value={mgoUser.id} key={mgoUser.id}>
                              {mgoUser.name || mgoUser.email}
                            </option>
                          ))}
                      </select>
                      {workspaceError ? <span className={styles.errorText}>{workspaceError}</span> : null}
                    </label>
                  ) : null}

                  <div className={styles.accountLinks}>
                    <a href="/settings" role="menuitem">
                      <Settings aria-hidden="true" size={16} />
                      My Account &amp; Connections
                    </a>
                    <a href="/account/logout" role="menuitem" className={styles.dangerLink}>
                      <LogOut aria-hidden="true" size={16} />
                      Sign out
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {drawerOpen ? (
        <div className={styles.drawerLayer}>
          <button
            type="button"
            className={styles.drawerBackdrop}
            aria-label="Close navigation menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Primary navigation">
            <div className={styles.drawerHeader}>
              <a className={styles.brand} href="/">
                <span className={styles.brandMark} aria-hidden="true">JU</span>
                <span className={styles.brandName}>JUMGOGPT</span>
              </a>
              <button type="button" className={styles.iconButton} aria-label="Close navigation menu" onClick={() => setDrawerOpen(false)}>
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <div className={styles.drawerWorkspace}>
              <span>Workspace</span>
              <strong>{workspaceLabel}</strong>
              {actingUser?.name ? <small>Viewing {actingUser.name}</small> : null}
            </div>
            <nav className={styles.drawerNav} aria-label="Application navigation">
              {navigationGroups.map((group) => (
                <section key={group.section}>
                  <h2>{group.section}</h2>
                  <div>
                    {group.items.map((item) => {
                      const active = isNavigationItemActive(pathname, item.href);
                      return (
                        <a
                          href={item.href}
                          key={item.href}
                          className={active ? styles.navLinkActive : styles.navLink}
                          aria-current={active ? "page" : undefined}
                        >
                          <span>{item.label}</span>
                          <NavigationCount
                            item={item}
                            queueCounts={queueCounts}
                            discussionCount={discussionCount}
                          />
                        </a>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>
            <div className={styles.drawerFooter}>
              <strong>{profile?.name || user?.name || "Signed in"}</strong>
              <span>{roleLabel}</span>
            </div>
          </aside>
        </div>
      ) : null}

      <Breadcrumbs pathname={pathname} />
      <div className={styles.pageContent}>{children}</div>
    </div>
  );
}

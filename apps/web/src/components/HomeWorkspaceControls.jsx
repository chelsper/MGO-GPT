import { ChevronDown } from "lucide-react";
import { canEditWorkspace, canViewWorkspaceAsRole, getWorkspaceRoleLabel, isAdminRole } from "@/utils/workspaceRoles";

export default function HomeWorkspaceControls({
  profile,
  isReviewer,
  actingUser,
  mgoUsers = [],
  workspaceResolved = false,
  workspaceFailed = false,
  usersPending = false,
  usersFailed = false,
  onViewModeChange,
  onActingWorkspaceChange,
}) {
  if (!isAdminRole(profile?.role)) return null;

  const workspaceKnown = workspaceResolved && !workspaceFailed;
  const ownerLabel = actingUser?.name || actingUser?.email || "Selected workspace";
  const canEdit = workspaceKnown && actingUser && canEditWorkspace({ sessionUser: profile, workspaceUser: actingUser, isActing: true });
  const viewableUsers = mgoUsers.filter(user => canViewWorkspaceAsRole(profile.role, user.role) && String(user.id) !== String(profile.id));
  const selectionMissing = actingUser && !viewableUsers.some(user => String(user.id) === String(actingUser.id));

  return <section aria-label="Workspace controls" className="mb-6 rounded-xl border border-gray-200 bg-white text-gray-900">
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Workspace</span>
          <span className="min-w-0 break-words text-sm font-semibold">
            {isReviewer ? "Advancement Services" : `MGO: ${workspaceKnown ? actingUser ? ownerLabel : "My workspace" : workspaceFailed ? "Could not verify workspace" : "Loading workspace..."}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-emerald-700">
          Change<span className="sr-only"> workspace</span>
          <ChevronDown aria-hidden="true" size={18} className="group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid gap-4 border-t border-gray-200 p-4 md:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">Workspace view</legend>
          <div className="flex flex-wrap gap-2">
            {[{ value: "reviewer", label: "Advancement Services" }, { value: "mgo", label: "MGO" }].map(option => {
              const active = isReviewer === (option.value === "reviewer");
              return <button key={option.value} type="button" aria-pressed={active} disabled={active}
                onClick={() => onViewModeChange(option.value)}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${active ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
                {option.label}
              </button>;
            })}
          </div>
        </fieldset>
        {!isReviewer && <div className="min-w-0">
          <label htmlFor="home-workspace-owner" className="mb-2 block text-sm font-semibold">Work in a workspace</label>
          <select id="home-workspace-owner" value={workspaceKnown ? actingUser?.id || profile.id : ""}
            disabled={!workspaceKnown || usersPending || usersFailed}
            onChange={event => onActingWorkspaceChange(event.target.value)}
            aria-describedby="home-workspace-help"
            className="min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            {!workspaceKnown && <option value="">{workspaceFailed ? "Workspace unavailable" : "Loading workspace..."}</option>}
            <option value={profile.id}>My workspace</option>
            {selectionMissing && <option value={actingUser.id}>{ownerLabel}</option>}
            {viewableUsers.map(user => <option key={user.id} value={user.id}>
              {user.name || user.email}{getWorkspaceRoleLabel(user.role) === "Executive" ? " (Executive)" : ""}
            </option>)}
          </select>
          <p id="home-workspace-help" className="mt-2 text-xs leading-relaxed text-gray-600">
            {usersFailed ? "The workspace list could not load. Reload the page to try again. Your selected workspace has not changed."
              : usersPending ? "Loading available workspaces..."
                : "Choose My workspace to return to your own work. Executive workspaces are read-only."}
          </p>
        </div>}
      </div>
    </details>
    {!isReviewer && workspaceFailed && <p role="alert" className="rounded-b-xl border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      The current workspace could not be verified. Reload the page before entering actions for someone else.
    </p>}
    {!isReviewer && workspaceKnown && actingUser && <p className="rounded-b-xl border-t border-teal-100 bg-teal-50 px-4 py-3 text-sm leading-relaxed text-teal-900">
      {canEdit ? <>Editing as Admin. Actions credit <strong>{ownerLabel}</strong> and record you as the person who entered them.</>
        : <>Viewing <strong>{ownerLabel}</strong>&apos;s workspace. This workspace is read-only.</>}
    </p>}
  </section>;
}

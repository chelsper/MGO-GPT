import { createContext, useContext } from "react";
import { getWorkspaceRoleLabels } from "@/utils/workspaceRoles";
import { DEFAULT_DASHBOARD_ASSISTANT, normalizeDashboardAssistant } from "@/utils/dashboardAssistantSettings";

const WorkspaceTerminologyContext = createContext(getWorkspaceRoleLabels());
const DashboardAssistantContext = createContext(DEFAULT_DASHBOARD_ASSISTANT);

// Reuse the shell's settings read; labels never control permissions or NXT values.
export function WorkspaceTerminologyProvider({ terminology, dashboardAssistant, children }) {
  return <WorkspaceTerminologyContext.Provider value={getWorkspaceRoleLabels(terminology)}>
    <DashboardAssistantContext.Provider value={normalizeDashboardAssistant(dashboardAssistant)}>{children}</DashboardAssistantContext.Provider>
  </WorkspaceTerminologyContext.Provider>;
}

export function useDashboardAssistantSettings() {
  return useContext(DashboardAssistantContext);
}

export function useWorkspaceLabels() {
  return useContext(WorkspaceTerminologyContext);
}

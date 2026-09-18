import { createContext, useContext } from "react";
import { getWorkspaceRoleLabels } from "@/utils/workspaceRoles";

const WorkspaceTerminologyContext = createContext(getWorkspaceRoleLabels());

// Reuse the shell's settings read; labels never control permissions or NXT values.
export function WorkspaceTerminologyProvider({ terminology, children }) {
  return <WorkspaceTerminologyContext.Provider value={getWorkspaceRoleLabels(terminology)}>
    {children}
  </WorkspaceTerminologyContext.Provider>;
}

export function useWorkspaceLabels() {
  return useContext(WorkspaceTerminologyContext);
}

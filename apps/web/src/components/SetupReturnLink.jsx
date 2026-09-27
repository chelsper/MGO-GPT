import { ArrowLeft } from "lucide-react";
import WorkflowReturnLink from "./WorkflowReturnLink";
import { getSafeInternalReturnPath } from "@/utils/workflowNavigation";

export default function SetupReturnLink({
  canManageWorkspace = true,
  className = "",
  returnTo = "",
}) {
  const destination = getSafeInternalReturnPath(returnTo);
  if (canManageWorkspace && destination)
    return <WorkflowReturnLink href={destination} className={className} />;
  return (
    <a
      href={canManageWorkspace ? "/setup" : "/"}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg py-2 text-sm font-semibold text-indigo-700 no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${className}`}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {canManageWorkspace ? "Back to Setup Hub" : "Back to home"}
    </a>
  );
}

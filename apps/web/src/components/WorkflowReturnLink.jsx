import { ArrowLeft } from "lucide-react";
import { getReturnDestination } from "@/utils/workflowNavigation";

export default function WorkflowReturnLink({ href = "/", className = "" }) {
  const destination = getReturnDestination(href);
  return <a href={destination.href} className={`inline-flex min-h-11 items-center gap-2 rounded-lg py-2 text-sm font-semibold text-indigo-700 no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${className}`}>
    <ArrowLeft size={16} aria-hidden="true" />{destination.label}
  </a>;
}

import { useEffect, useState } from "react";
import { getReturnDestination, resolveWorkflowReturnPath } from "./workflowNavigation";

export default function useWorkflowReturn(fallback = "/") {
  const [path, setPath] = useState(() => getReturnDestination(fallback).href);
  useEffect(() => {
    setPath(resolveWorkflowReturnPath({
      currentUrl: window.location.href,
      referrer: document.referrer,
      fallback,
    }));
  }, [fallback]);
  return getReturnDestination(path, fallback);
}

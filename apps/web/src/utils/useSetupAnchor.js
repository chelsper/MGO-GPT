import { useEffect } from "react";

const anchors = new Set([
  "institution-profile",
  "workspace-terminology",
  "notification-delivery",
  "giving-societies",
  "reporting-rules",
  "blackbaud-connection",
  "workspace-users",
]);

// Native fragment navigation can run before an asynchronous editor renders.
export default function useSetupAnchor(ready) {
  useEffect(() => {
    if (!ready) return;
    const navigate = () => {
      const id = window.location.hash.slice(1);
      if (!anchors.has(id)) return;
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ block: "start" });
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, [ready]);
}

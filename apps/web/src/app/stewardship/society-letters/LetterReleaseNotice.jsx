import { useEffect, useRef, useState } from "react";
import { recoverLetterRelease } from "./letterReleaseRecovery";

export default function LetterReleaseNotice({
  busy = false,
  buildCommit = import.meta.env.VITE_GIT_COMMIT_SHA,
}) {
  const [latest, setLatest] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const recovery = useRef(null);
  useEffect(
    () => () => {
      recovery.current?.abort();
      recovery.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!buildCommit) return;
    let controller;
    let disposed = false;
    let checking = false;
    let lastCheck = -Infinity;
    async function check() {
      if (
        disposed ||
        checking ||
        document.hidden ||
        Date.now() - lastCheck < 60000
      )
        return;
      checking = true;
      lastCheck = Date.now();
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        // A credentialed request would follow the very stale deployment pin
        // being diagnosed. This public endpoint receives no login or NXT data.
        const response = await fetch("/api/version", {
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const version = await response.json();
        if (!disposed && !controller.signal.aborted)
          setLatest(
            version.environment === "production" &&
              /^[a-f0-9]{40}$/.test(version.commitSha || "") &&
              /^dpl_[A-Za-z0-9]+$/.test(version.deploymentId || "") &&
              version.commitSha !== buildCommit
              ? version.deploymentId
              : null,
          );
      } catch {
        // Version discovery must not interrupt normal work or retry in a loop.
      } finally {
        clearTimeout(timeout);
        checking = false;
      }
    }
    check();
    window.addEventListener("focus", check);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener("focus", check);
    };
  }, [buildCommit]);
  if (!latest) return null;
  return (
    <section
      role="status"
      className="my-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
    >
      <p className="font-semibold">
        A newer version of Society Letters is ready.
      </p>
      <p className="mt-1 text-sm">
        Your browser is still using an older version. Save any edits and pause
        running work, then load the update. Saved reviews and approved letters
        stay in place; loading the update does not send letters or apply
        appeals.
      </p>
      <button
        type="button"
        className="mt-3 min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 font-semibold text-emerald-900 disabled:opacity-50"
        disabled={busy || updating}
        onClick={async () => {
          if (
            busy ||
            recovery.current ||
            !window.confirm(
              "Have you saved your edits and paused any running batch? Load the latest version now?",
            )
          )
            return;
          const controller = new AbortController();
          recovery.current = controller;
          setUpdating(true);
          setError(null);
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const destination = await recoverLetterRelease(
              window.location.pathname +
                window.location.search +
                window.location.hash,
              { signal: controller.signal },
            );
            if (!controller.signal.aborted) window.location.assign(destination);
          } catch {
            if (recovery.current === controller)
              setError(
                "The update could not be confirmed. Your saved letters are unchanged. Try loading the latest version again.",
              );
          } finally {
            clearTimeout(timeout);
            if (recovery.current === controller) {
              recovery.current = null;
              setUpdating(false);
            }
          }
        }}
      >
        {updating ? "Loading latest version..." : "Load latest version"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-amber-900">
          {error}
        </p>
      )}
    </section>
  );
}

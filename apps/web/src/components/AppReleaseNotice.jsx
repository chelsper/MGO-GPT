import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { appReleasePath, recoverAppRelease, validAppVersion } from "@/utils/appRelease";
import { pendingAppWrites, subscribeAppWrites } from "@/utils/appWriteActivity";

const serverWrites = () => 0;

export default function AppReleaseNotice({ path, buildCommit = import.meta.env.VITE_GIT_COMMIT_SHA }) {
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const recovery = useRef(null);
  const writes = useSyncExternalStore(subscribeAppWrites, pendingAppWrites, serverWrites);
  const supported = Boolean(appReleasePath(path)) && !path.startsWith("/stewardship/society-letters");

  useEffect(() => () => {
    recovery.current?.abort();
    recovery.current = null;
  }, [path]);

  useEffect(() => {
    if (!supported || !/^[a-f0-9]{40}$/.test(buildCommit || "")) return;
    let controller;
    let disposed = false;
    let checking = false;
    let lastCheck = -Infinity;
    async function check() {
      if (disposed || checking || document.hidden || Date.now() - lastCheck < 60000) return;
      checking = true;
      lastCheck = Date.now();
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        // Public metadata must bypass the stale version cookie being diagnosed.
        const response = await fetch("/api/version", {
          credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal,
        });
        if (!response.ok) return;
        const version = await response.json();
        if (!disposed && !controller.signal.aborted)
          setAvailable(validAppVersion(version) && version.commitSha !== buildCommit);
      } catch {
        // A failed version check must never interrupt normal app use.
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
  }, [supported, buildCommit]);

  if (!supported || !available) return null;
  async function update() {
    if (pendingAppWrites() || recovery.current || !window.confirm(
      "Save any unsaved edits and pause running batches first. Load the latest version and return to this view?",
    )) return;
    const controller = new AbortController();
    recovery.current = controller;
    setUpdating(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const destination = await recoverAppRelease(path, {
        signal: controller.signal,
        beforeReset: () => {
          if (pendingAppWrites()) throw new Error("An app save is still running.");
        },
      });
      if (!controller.signal.aborted) window.location.assign(destination);
    } catch {
      if (recovery.current === controller) setError(
        "The update could not be confirmed. Your work has not been reloaded. Finish any active saves, then try again.",
      );
    } finally {
      clearTimeout(timeout);
      if (recovery.current === controller) {
        recovery.current = null;
        setUpdating(false);
      }
    }
  }
  return (
    <section role="status" aria-label="App update" className="mx-auto my-3 max-w-7xl rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-semibold">A newer version is ready.</p>
          <p className="mt-1 text-sm">Save your edits and pause running work before updating. You will return to this view; saved records stay unchanged.</p>
        </div>
        <button type="button" onClick={update} disabled={writes > 0 || updating}
          className="min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50">
          {updating ? "Loading latest version..." : "Load latest version"}
        </button>
      </div>
      {writes > 0 && <p className="mt-2 text-sm">Waiting for the current save to finish.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-amber-900">{error}</p>}
    </section>
  );
}

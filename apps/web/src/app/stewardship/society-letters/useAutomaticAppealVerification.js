import { useEffect, useRef, useState } from "react";
import { nextAutomaticAppealCheck } from "@/utils/societyLetterVerification";

export default function useAutomaticAppealVerification({
  data,
  paused,
  verify,
}) {
  const [visible, setVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [notice, setNotice] = useState("");
  const attempted = useRef(new Set());
  const inFlight = useRef(false);
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    const change = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const next = nextAutomaticAppealCheck(data);
  const token =
    next &&
    JSON.stringify([
      data.reviewerId,
      data.revision,
      next.body,
      next.key,
      next.attempts,
      next.dueAt,
    ]);
  useEffect(() => {
    if (!next) {
      setNotice("");
      return;
    }
    if (
      paused ||
      !visible ||
      inFlight.current ||
      attempted.current.has(token)
    )
      return;
    const timer = setTimeout(
      async () => {
        attempted.current.add(token);
        inFlight.current = true;
        setNotice(
          "Checking the saved NXT submission automatically. No appeal is being added.",
        );
        try {
          const result = await verify(next.body);
          setNotice(
            result
              ? ""
              : "The automatic NXT check paused. Your letters and approvals are saved. Reload this page to reconnect.",
          );
        } catch {
          setNotice(
            "The automatic NXT check paused. Your letters and approvals are saved. Reload this page to reconnect.",
          );
        } finally {
          inFlight.current = false;
          setSettled((value) => value + 1);
        }
      },
      Math.max(1000, Math.min(next.delay, 2147483647)),
    );
    return () => clearTimeout(timer);
  }, [token, paused, visible, settled]);
  return notice;
}

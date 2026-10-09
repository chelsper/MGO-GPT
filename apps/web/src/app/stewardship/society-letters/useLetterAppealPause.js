import { useEffect, useState } from "react";
import { letterAppealRetryAt } from "@/utils/societyLetterVerification";

export default function useLetterAppealPause(receipts) {
  const [, tick] = useState(0);
  const retryAt = Math.max(0, ...receipts.map(letterAppealRetryAt));
  const waiting = retryAt > Date.now();
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(
      () => tick((value) => value + 1),
      Math.max(1, retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [retryAt, waiting]);
  return { retryAt, waiting };
}

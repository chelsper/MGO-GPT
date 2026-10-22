import { useEffect, useRef, useState } from "react";
import LetterRecipientDialog from "./LetterRecipientDialog";

export default function RecipientReviewQueue({
  items,
  rows,
  templates,
  channel = "post",
  busy,
  error,
  onSave,
  onExclude,
  exclusion,
  notice,
  onNavigate,
  onClose,
  startIndex = 0,
  drafts = {},
  onDraftChange,
  onDiscardDraft,
  onPosition,
  conflict,
  onReloadSaved,
  onResolveConflict,
}) {
  const [index, setIndex] = useState(startIndex);
  const [saved, setSaved] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const activeItems = items.filter(
    (item) => !excluded.includes(item.householdId),
  );
  const item = activeItems[index] || activeItems.at(-1);
  const current = rows.find((row) => row.householdId === item?.householdId);
  const recipient = current || item;
  const positionCallback = useRef(onPosition);
  positionCallback.current = onPosition;
  useEffect(() => {
    if (recipient) positionCallback.current?.(recipient.householdId);
  }, [recipient?.householdId]);
  function go(next) {
    onNavigate();
    setIndex(next);
  }
  function advance(savedIds, excludedIds = excluded) {
    const remaining = items.filter(
      (item) => !excludedIds.includes(item.householdId),
    );
    const originalIndex = items.findIndex(
      (item) => item.householdId === recipient.householdId,
    );
    const next = items
      .slice(originalIndex + 1)
      .find((item) => !excludedIds.includes(item.householdId));
    if (!next) {
      const unfinished = remaining.find(
        (item) =>
          !savedIds.includes(item.householdId) &&
          (drafts[item.householdId] ||
            rows.find((row) => row.householdId === item.householdId)
              ?.recipientReview?.status !== "saved"),
      );
      if (unfinished) onPosition?.(unfinished.householdId);
      onClose(savedIds.length, items.length, !unfinished, excludedIds.length);
    } else
      go(remaining.findIndex((item) => item.householdId === next.householdId));
  }
  if (!recipient) return null;
  return (
    <LetterRecipientDialog
      key={recipient.householdId}
      recipient={recipient}
      draft={drafts[recipient.householdId]}
      onDraftChange={
        onDraftChange
          ? (draft) => onDraftChange(recipient.householdId, draft)
          : undefined
      }
      onDiscardDraft={() => onDiscardDraft?.(recipient.householdId)}
      conflict={conflict}
      onReloadSaved={
        onReloadSaved ? () => onReloadSaved(recipient.householdId) : undefined
      }
      onResolveConflict={onResolveConflict}
      channel={channel}
      template={templates.find(
        (template) => template.societyKey === recipient.societyKey,
      )}
      busy={busy}
      unavailable={
        !current?.recipientReview?.editable || current.status !== "ready"
      }
      error={error}
      notice={notice}
      exclusion={exclusion}
      onExclude={
        onExclude
          ? async (values) => {
              const result = await onExclude({
                householdId: recipient.householdId,
                ...values,
              });
              if (!result) return result;
              const excludedIds = [
                ...new Set([...excluded, recipient.householdId]),
              ];
              const savedIds = saved.filter(
                (id) => id !== recipient.householdId,
              );
              setExcluded(excludedIds);
              setSaved(savedIds);
              advance(savedIds, excludedIds);
              return result;
            }
          : undefined
      }
      navigation={{
        items: activeItems,
        index,
        savedCount: saved.length,
        excludedCount: excluded.length,
        onNavigate: go,
        onSkip: () => advance(saved),
      }}
      onClose={() =>
        onClose(saved.length, items.length, false, excluded.length)
      }
      onSave={async (values) => {
        const result = await onSave({
          householdId: recipient.householdId,
          ...values,
        });
        if (!result) return;
        const updated = [...new Set([...saved, recipient.householdId])];
        setSaved(updated);
        advance(updated);
      }}
    />
  );
}

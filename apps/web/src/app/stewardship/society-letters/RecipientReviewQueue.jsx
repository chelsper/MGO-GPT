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
  const current = rows.find(
    (row) => row.householdId === items[index].householdId,
  );
  const recipient = current || items[index];
  const positionCallback = useRef(onPosition);
  positionCallback.current = onPosition;
  useEffect(() => {
    positionCallback.current?.(recipient.householdId);
  }, [recipient.householdId]);
  function go(next) {
    onNavigate();
    setIndex(next);
  }
  function advance(savedIds) {
    if (index === items.length - 1) {
      const unfinished = items.find(
        (item) =>
          !savedIds.includes(item.householdId) &&
          (drafts[item.householdId] ||
            rows.find((row) => row.householdId === item.householdId)
              ?.recipientReview?.status !== "saved"),
      );
      if (unfinished) onPosition?.(unfinished.householdId);
      onClose(savedIds.length, items.length, !unfinished);
    } else go(index + 1);
  }
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
      navigation={{
        items,
        index,
        savedCount: saved.length,
        onNavigate: go,
        onSkip: () => advance(saved),
      }}
      onClose={() => onClose(saved.length, items.length)}
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

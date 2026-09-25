import { useState } from "react";
import LetterRecipientDialog from "./LetterRecipientDialog";

export default function RecipientReviewQueue({
  items,
  rows,
  templates,
  busy,
  error,
  onSave,
  onNavigate,
  onClose,
}) {
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState([]);
  const current = rows.find(
    (row) => row.householdId === items[index].householdId,
  );
  const recipient = current || items[index];
  function go(next) {
    onNavigate();
    setIndex(next);
  }
  function advance(savedIds) {
    if (index === items.length - 1) onClose(savedIds.length, items.length);
    else go(index + 1);
  }
  return (
    <LetterRecipientDialog
      key={recipient.householdId}
      recipient={recipient}
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

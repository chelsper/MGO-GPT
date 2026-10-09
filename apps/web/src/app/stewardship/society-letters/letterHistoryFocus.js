export const savedLetterElementId = (id) => `saved-letter-${id}`;

export function focusSavedLetter(id) {
  const element = document.getElementById(savedLetterElementId(id));
  if (!element) return;
  const details = element.closest("details");
  if (details) details.open = true;
  element.focus();
  element.scrollIntoView?.({ block: "start", behavior: "smooth" });
}

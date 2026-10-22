// An incomplete contact response is not evidence that a contact is missing.
export function completeImportContactCollection(payload) {
  const invalid = () => { throw new Error("NXT returned incomplete contact information. Reload current contacts before sending; no missing contacts were assumed."); };
  if (Array.isArray(payload)) {
    if (payload.some((value) => !value || typeof value !== "object" || Array.isArray(value))) return invalid();
    return payload;
  }
  if (!payload || typeof payload !== "object") return invalid();
  if (payload.next_link || payload.nextLink || payload.next_page || payload.next || payload.links?.next || payload.has_more === true || payload.hasMore === true) return invalid();
  const list = [payload.value, payload.items, payload.data, payload.results].find(Array.isArray);
  if (!list || (payload.count != null && (!Number.isFinite(Number(payload.count)) || Number(payload.count) > list.length))) return invalid();
  if (list.some((value) => !value || typeof value !== "object" || Array.isArray(value))) return invalid();
  return list;
}

// Shared transport; the existing server route owns NXT creation and receipts.
export async function submitOpportunityUpdate(body) {
  const response = await fetch("/api/submissions/opportunity-update", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data?.error || "Failed to submit opportunity update"), {
    notSubmitted: data?.notSubmitted === true, writeReceipt: data?.writeReceipt,
  });
  return data;
}

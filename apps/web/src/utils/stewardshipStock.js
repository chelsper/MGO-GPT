import { receiptId } from "./stewardshipReceipts";

export const STOCK_LIMIT = 1000000;
export const STOCK_KINDS = Object.freeze({
  opening: "Opening count", restock: "Restock", return: "Return to stock",
  adjustment: "Count correction", fulfillment: "Gift fulfilled",
});
export function stockCommand(body) {
  const fields = ["operation", "viewerKey", "id", "stockVersion", "token", "kind", "quantity", "reason", "confirmed"];
  if (!body || body.operation !== "stock" || Object.keys(body).some(key => !fields.includes(key)) ||
      typeof body.viewerKey !== "string" || !body.viewerKey.trim() || body.viewerKey.length > 320 ||
      !receiptId(body.id) || !Number.isInteger(body.stockVersion) || body.stockVersion < 0 || body.stockVersion >= 2147483647 ||
      !["opening", "restock", "return", "adjustment"].includes(body.kind) || body.confirmed !== true ||
      !Number.isSafeInteger(body.quantity) || body.quantity < (["opening", "adjustment"].includes(body.kind) ? 0 : 1) || body.quantity > STOCK_LIMIT ||
      typeof body.reason !== "string" || body.reason.length > 1000 || (["return", "adjustment"].includes(body.kind) && !body.reason.trim()) ||
      typeof body.token !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.token)) return null;
  return { ...body, token: body.token.toLowerCase(), reason: body.reason.trim() };
}
export const stockLabel = item => item.on_hand == null ? "Not counted" : `${item.on_hand} on hand`;

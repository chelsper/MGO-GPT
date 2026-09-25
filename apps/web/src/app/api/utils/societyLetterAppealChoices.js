import { blackbaudApiFetch } from "./blackbaud";
import { completeAppealCatalog } from "./societyLetterAppealCatalog";
import { letterError } from "@/utils/societyLetters";

export async function letterAppealChoices(ctx, fetcher = blackbaudApiFetch) {
  let result;
  try {
    result = await fetcher(
      "/fundraising/v1/appeals?include_inactive=true&limit=5000",
      {
        userId: ctx.user.id,
        origin: ctx.origin,
        method: "GET",
        timeoutMs: 5000,
        maxRetries: 0,
      },
    );
  } catch (error) {
    throw letterError(
      error.httpStatus === 429
        ? "Blackbaud has paused appeal lookup. Wait for the cooldown before loading again. Your settings have not changed."
        : "Appeal choices could not be loaded. Check the NXT connection and appeal-read permissions, then try again. Your settings have not changed.",
      error.httpStatus === 429 ? 429 : 502,
    );
  }
  const catalog = completeAppealCatalog(result);
  const codes = new Map();
  const descriptions = new Map();
  for (const appeal of catalog) {
    const code =
      typeof appeal.lookup_id === "string"
        ? appeal.lookup_id.toLowerCase()
        : "";
    const description = appeal.description.trim().toLowerCase();
    codes.set(code, (codes.get(code) || 0) + 1);
    descriptions.set(description, (descriptions.get(description) || 0) + 1);
  }
  // Do not offer ambiguous codes/descriptions that the existing save verifier rejects.
  const appeals = catalog
    .filter(
      (appeal) =>
        appeal.inactive === false &&
        /^[1-9][0-9]{0,17}$/.test(String(appeal.id)) &&
        typeof appeal.lookup_id === "string" &&
        appeal.lookup_id.trim() === appeal.lookup_id &&
        appeal.lookup_id.length > 0 &&
        appeal.lookup_id.length <= 100 &&
        appeal.description.trim() === appeal.description &&
        appeal.description.length > 0 &&
        appeal.description.length <= 300 &&
        codes.get(appeal.lookup_id.toLowerCase()) === 1 &&
        descriptions.get(appeal.description.toLowerCase()) === 1,
    )
    .map((appeal) => ({
      lookupId: appeal.lookup_id,
      description: appeal.description,
    }))
    .sort(
      (a, b) =>
        a.description.localeCompare(b.description) ||
        a.lookupId.localeCompare(b.lookupId),
    );
  return { appeals, omittedCount: catalog.length - appeals.length };
}

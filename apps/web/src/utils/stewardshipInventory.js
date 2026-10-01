export const GIFT_AVAILABILITY = Object.freeze({
  unknown: "Not checked",
  available: "Available",
  unavailable: "Unavailable",
});

// Names supplied by JU from its NXT action custom fields, not a live stock feed.
// Keep stable keys independent of editable catalog names and never infer NXT IDs.
export const JU_GIFT_STARTERS = Object.freeze(
  [
    ["quarter-zip-nike", "1/4 ZIP Nike"],
    ["athletics-baseball-hat", "2023-2024 Athletics Baseball Hat"],
    ["wooden-dolphin-ju", "3-D Wooden Dolphin (JU)"],
    ["wooden-dolphin-steam", "3-D Wooden Dolphin (STEAM)"],
    ["dolphin-statue", "3D Dolphin Statue"],
    ["acrylic-serving-tray", "Acrylic Serving Tray"],
    ["argyle-socks", "Argyle Socks"],
    ["baby-bib", "Baby Bib"],
    ["baby-onesie", "Baby Onesie"],
    ["decanters", "Decanters"],
    ["framed-dolphin-painting", "Framed Dolphin Statue Painting"],
    ["glassblown-vase", "Glassblown Vase"],
    ["ju-blanket", "JU Blanket"],
    ["ju-pen-case", "JU Pen & Case"],
    ["ju-rocks-glasses", "JU Rocks Glasses"],
    ["ju-symbolic-key", "JU Symbolic Key"],
    ["license-plate-cover", "License Plate Cover"],
    ["ood-society-magnet", "OOD Society Magnet"],
    ["pint-glasses", "Pint Glasses"],
    ["smathers-branson-keychain", "Smathers & Branson Keychain"],
    ["champagne-bottle-chocolate", "Thank You Champagne Bottle Chocolate"],
    ["vineyard-vines-bowtie", "Vineyard Vines Bowtie"],
    ["vineyard-vines-scarf", "Vineyard Vines Scarf"],
    ["vineyard-vines-tie", "Vineyard Vines Tie"],
    ["vineyard-vines-tote", "Vineyard Vines Tote"],
    ["wooden-cutting-board", "Wooden Cutting Board"],
  ].map(([key, name]) =>
    Object.freeze({ key: `ju-action-field:${key}`, name }),
  ),
);

export const inventoryNameKey = (name) =>
  name.trim().replace(/\s+/g, " ").toLowerCase();
export const inventoryId = (id) =>
  typeof id === "string" && /^[1-9]\d{0,17}$/.test(id);
const text = (value, max, required = false) =>
  typeof value === "string" &&
  value.length <= max &&
  (!required || value.trim().length > 0);

export function validateInventoryCommand(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const common = ["operation", "viewerKey"];
  const itemFields = ["name", "description", "location", "availability"];
  const operations = {
    create: ["requestId", ...itemFields],
    import: ["keys"],
    update: ["id", "version", ...itemFields],
    archive: ["id", "version", "reason"],
    restore: ["id", "version"],
  };
  const fields = Object.hasOwn(operations, body.operation)
    ? operations[body.operation]
    : null;
  if (
    !fields ||
    Object.keys(body).some((key) => ![...common, ...fields].includes(key)) ||
    !text(body.viewerKey, 320, true)
  )
    return null;
  if (
    ["update", "archive", "restore"].includes(body.operation) &&
    (!inventoryId(body.id) ||
      !Number.isSafeInteger(body.version) ||
      body.version < 1 ||
      body.version >= 2147483647)
  )
    return null;
  if (
    body.operation === "create" &&
    (typeof body.requestId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        body.requestId,
      ))
  )
    return null;
  if (
    ["create", "update"].includes(body.operation) &&
    (!text(body.name, 160, true) ||
      !text(body.description, 2000) ||
      !text(body.location, 240) ||
      !Object.hasOwn(GIFT_AVAILABILITY, body.availability))
  )
    return null;
  if (body.operation === "archive" && !text(body.reason, 1000)) return null;
  if (
    body.operation === "import" &&
    (!Array.isArray(body.keys) ||
      !body.keys.length ||
      body.keys.length > JU_GIFT_STARTERS.length ||
      new Set(body.keys).size !== body.keys.length ||
      body.keys.some(
        (key) => !JU_GIFT_STARTERS.some((item) => item.key === key),
      ))
  )
    return null;
  return {
    ...body,
    ...Object.fromEntries(
      ["name", "description", "location", "reason"]
        .filter((key) => key in body)
        .map((key) => [key, body[key].trim()]),
    ),
  };
}

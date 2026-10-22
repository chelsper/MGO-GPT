// Opt-in disposable local PostgreSQL only; no DATABASE_URL, NXT, or donor data.
import { execFile } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Papa from "papaparse";
import schema from "./stewardshipInventorySchema";
import {
  readGiftInventory,
  readGiftItemHistory,
  writeGiftInventory,
  readGiftPhoto,
} from "./stewardshipInventory";
import { JU_GIFT_STARTERS } from "@/utils/stewardshipInventory";

const socket = process.env.STEWARDSHIP_INVENTORY_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/ju-maintenance-pg-[A-Za-z0-9]+$/.test(
  socket || "",
);
const literal = (value) =>
  value == null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
function execute(statement) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "/opt/homebrew/opt/postgresql@18/bin/psql",
      [
        "-X",
        "--no-password",
        "-q",
        "--csv",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        socket,
        "-p",
        "55443",
        "-d",
        "postgres",
      ],
      { encoding: "utf8" },
      (error, output) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(
          output.trim()
            ? Papa.parse(output.trim(), { header: true }).data.map((row) =>
                Object.fromEntries(
                  Object.entries(row).map(([key, value]) => [
                    key,
                    value === ""
                      ? null
                      : key === "snapshot"
                        ? JSON.parse(value)
                        : value,
                  ]),
                ),
              )
            : [],
        );
      },
    );
    child.stdin.end(
      `SET search_path=stewardship_inventory_fixture;\n${statement}`,
    );
  });
}
const db = (parts, ...values) => {
  const text = parts.reduce(
    (query, part, index) =>
      query + part + (index < values.length ? literal(values[index]) : ""),
    "",
  );
  return {
    text,
    then: (resolve, reject) => execute(text).then(resolve, reject),
  };
};
db.transaction = async (queries) => {
  const rows = await execute(
    `BEGIN;\n\\o /dev/null\n${queries
      .slice(0, -1)
      .map((query) => `${query.text};`)
      .join(
        "\n",
      )} SELECT pg_sleep(0.02);\n\\o\n${queries.at(-1).text}; COMMIT;`,
  );
  return [...queries.slice(0, -1).map(() => []), rows];
};
const actor = { id: 2, name: "Inventory Admin", role: "admin", active: true };
const create = {
  operation: "create",
  viewerKey: "auth-2",
  requestId: "18d02230-07b2-4f12-8967-3e0b0147c900",
  name: "Test gift",
  description: "Gift details",
  location: "Shelf A",
  availability: "available",
};
const write = (body) =>
  writeGiftInventory(actor, { viewerKey: "auth-2", ...body }, db);
const starter = {
  operation: "import",
  keys: JU_GIFT_STARTERS.map((item) => item.key),
};

describe.skipIf(!enabled)("gift inventory PostgreSQL persistence", () => {
  beforeAll(async () => {
    await execute(`DROP SCHEMA IF EXISTS stewardship_inventory_fixture CASCADE; CREATE SCHEMA stewardship_inventory_fixture; SET search_path=stewardship_inventory_fixture;
      CREATE TABLE users(id bigint PRIMARY KEY, name text, role text, active boolean DEFAULT TRUE);`);
    await schema(db);
    await schema(db);
  });
  beforeEach(async () => {
    await execute(`TRUNCATE users,stewardship_gift_items,stewardship_gift_item_events RESTART IDENTITY CASCADE;
      INSERT INTO users VALUES (2,'Inventory Admin','admin',TRUE),(3,'Services','advancement_services',TRUE),(4,'Officer','mgo',TRUE);`);
  });
  afterAll(async () => {
    await execute("DROP SCHEMA stewardship_inventory_fixture CASCADE");
  });
  it("imports existing gift names once with unknown availability and an audit for each", async () => {
    const rows = await write(starter);
    expect(rows).toHaveLength(26);
    expect(
      rows.every(
        (row) =>
          row.availability === "unknown" &&
          row.version === 1 &&
          !row.archived_at,
      ),
    ).toBe(true);
    expect(await write(starter)).toHaveLength(0);
    expect(await readGiftInventory(actor, db)).toHaveLength(26);
    expect(
      (await execute("SELECT COUNT(*) FROM stewardship_gift_item_events"))[0]
        .count,
    ).toBe("26");
  });
  it("serializes concurrent imports without duplicate items or audit entries", async () => {
    const results = await Promise.all([
      write(starter),
      write(starter),
      write(starter),
    ]);
    expect(results.reduce((sum, rows) => sum + rows.length, 0)).toBe(26);
    expect(
      (await execute("SELECT COUNT(*) FROM stewardship_gift_items"))[0].count,
    ).toBe("26");
    expect(
      (await execute("SELECT COUNT(*) FROM stewardship_gift_item_events"))[0]
        .count,
    ).toBe("26");
  });
  it("archives and restores the same ID without erasing reason or prior metadata history", async () => {
    const [item] = await write(create);
    const [archived] = await write({
      operation: "archive",
      id: item.id,
      version: 1,
      reason: "No longer offered",
    });
    expect(archived).toMatchObject({
      id: item.id,
      version: 2,
      archive_reason: "No longer offered",
    });
    expect(archived.archived_at).toBeTruthy();
    const [restored] = await write({
      operation: "restore",
      id: item.id,
      version: 2,
    });
    expect(restored).toMatchObject({
      id: item.id,
      version: 3,
      availability: "unknown",
      archived_at: null,
      location: "Shelf A",
      description: "Gift details",
    });
    const events = await readGiftItemHistory(actor, item.id, db);
    expect(events.map((event) => event.operation)).toEqual([
      "restore",
      "archive",
      "create",
    ]);
    expect(events[1].snapshot.archive_reason).toBe("No longer offered");
    expect(events[0].snapshot.id).toBe(Number(item.id));
  });
  it("never resurrects archived imports or recreates them after a rename", async () => {
    const [item] = await write({
      operation: "import",
      keys: [JU_GIFT_STARTERS[0].key],
    });
    await write({
      operation: "update",
      id: item.id,
      version: 1,
      name: "Renamed gift",
      description: "Updated description",
      location: "Shelf B",
      availability: "unavailable",
    });
    await write({
      operation: "archive",
      id: item.id,
      version: 2,
      reason: "Discontinued",
    });
    expect(
      await write({ operation: "import", keys: [JU_GIFT_STARTERS[0].key] }),
    ).toHaveLength(0);
    const [saved] = await readGiftInventory(actor, db);
    expect(saved).toMatchObject({
      id: item.id,
      name: "Renamed gift",
      version: 3,
      availability: "unavailable",
    });
    expect(saved.archived_at).toBeTruthy();
  });
  it("deduplicates normalized names and create retries even after archiving", async () => {
    const [item] = await write(create);
    await write({ operation: "archive", id: item.id, version: 1, reason: "" });
    expect(await write(create)).toHaveLength(0);
    expect(
      await write({
        ...create,
        requestId: "18d02230-07b2-4f12-8967-3e0b0147c901",
        name: " test   GIFT ",
      }),
    ).toHaveLength(0);
    expect(await readGiftInventory(actor, db)).toHaveLength(1);
    expect(await readGiftItemHistory(actor, item.id, db)).toHaveLength(2);
  });
  it("allows exactly one competing edit and does not allow editing archived items", async () => {
    const [item] = await write(create);
    const results = await Promise.all(
      ["Staff A", "Staff B"].map((reason) =>
        write({ operation: "archive", id: item.id, version: 1, reason }),
      ),
    );
    expect(results.flat()).toHaveLength(1);
    expect(
      await write({
        operation: "update",
        id: item.id,
        version: 2,
        name: "Wrong",
        description: "",
        location: "",
        availability: "unknown",
      }),
    ).toHaveLength(0);
    expect(
      await write({ operation: "restore", id: item.id, version: 1 }),
    ).toHaveLength(0);
    expect(await readGiftItemHistory(actor, item.id, db)).toHaveLength(2);
  });
  it.each([
    "UPDATE users SET role='mgo' WHERE id=2",
    "UPDATE users SET active=FALSE WHERE id=2",
  ])(
    "rechecks changed actor permissions inside the transaction: %s",
    async (statement) => {
      const [item] = await write(create);
      await execute(statement);
      expect(await write(starter)).toHaveLength(0);
      expect(
        await write({
          operation: "archive",
          id: item.id,
          version: 1,
          reason: "Not permitted",
        }),
      ).toHaveLength(0);
      expect(
        (await execute("SELECT version FROM stewardship_gift_items"))[0]
          .version,
      ).toBe("1");
      expect(await readGiftInventory(actor, db)).toHaveLength(0);
    },
  );
  it("permits services staff but refuses an MGO at the store boundary", async () => {
    expect(
      await writeGiftInventory(
        { id: 4, role: "mgo", active: true },
        create,
        db,
      ),
    ).toBeNull();
    expect(
      await readGiftInventory({ id: 4, role: "mgo", active: true }, db),
    ).toBeNull();
    expect(
      await writeGiftInventory(
        { id: 3, role: "advancement_services", active: true },
        create,
        db,
      ),
    ).toHaveLength(1);
  });
  it("rolls the item change back if saving its audit fails", async () => {
    const [item] = await write(create);
    await execute(`CREATE FUNCTION reject_inventory_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test audit rejection'; END $$;
      CREATE TRIGGER reject_audit BEFORE INSERT ON stewardship_gift_item_events FOR EACH ROW EXECUTE FUNCTION reject_inventory_audit();`);
    try {
      await expect(
        write({
          operation: "archive",
          id: item.id,
          version: 1,
          reason: "Must not persist",
        }),
      ).rejects.toThrow();
      expect((await readGiftInventory(actor, db))[0]).toMatchObject({
        version: 1,
        archived_at: null,
      });
    } finally {
      await execute(
        "DROP TRIGGER reject_audit ON stewardship_gift_item_events; DROP FUNCTION reject_inventory_audit()",
      );
    }
  });
  it("does not overwrite another item when a rename collides", async () => {
    const [first] = await write(create);
    await write({
      ...create,
      requestId: "18d02230-07b2-4f12-8967-3e0b0147c902",
      name: "Other item",
    });
    await expect(
      write({
        operation: "update",
        id: first.id,
        version: 1,
        name: "Other item",
        description: "",
        location: "",
        availability: "unknown",
      }),
    ).rejects.toThrow();
    expect(
      (await readGiftInventory(actor, db)).find((item) => item.id === first.id)
        .version,
    ).toBe(1);
    expect(await readGiftItemHistory(actor, first.id, db)).toHaveLength(1);
  });
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVh0AAAAASUVORK5CYII=";
  const photo = { operation: "replace", dataUrl: png, alt: "Green gift" };
  const edit = (item, change = {}) => ({ operation: "update", id: item.id, version: item.version, name: item.name, description: item.description || "", location: item.location || "", availability: item.availability, ...change });
  it("stores photos separately from catalog and audit payloads and preserves legacy edits", async () => {
    const [item] = await write({ ...create, photo });
    expect(item).toMatchObject({ has_photo: "t", photo_alt: "Green gift", photo_version: "1" });
    expect(await readGiftPhoto(actor, item.id, 1, db)).toBe(png);
    expect(JSON.stringify(await readGiftInventory(actor, db))).not.toContain("base64");
    expect(JSON.stringify(await readGiftItemHistory(actor, item.id, db))).not.toContain("base64");
    const [updated] = await write(edit(item, { name: "Renamed" }));
    expect(updated.photo_version).toBe("1"); expect(await readGiftPhoto(actor, item.id, 1, db)).toBe(png);
    expect(await readGiftPhoto(actor, item.id, 2, db)).toBeNull();
  });
  it("describes, replaces, and removes photos atomically without changing stock", async () => {
    let [item] = await write({ ...create, photo });
    await execute("UPDATE stewardship_gift_items SET on_hand=7,stock_version=3");
    [item] = await write(edit(item, { photo: { operation: "describe", alt: "Revised description" } }));
    expect(item).toMatchObject({ photo_version: "2", photo_alt: "Revised description", on_hand: "7", stock_version: "3" });
    [item] = await write(edit(item, { photo: { ...photo, alt: "Replacement" } }));
    expect(await readGiftPhoto(actor, item.id, 3, db)).toBe(png);
    expect(await write(edit({ ...item, version: 1 }, { photo: { operation: "remove" } }))).toHaveLength(0);
    [item] = await write(edit(item, { photo: { operation: "remove" } }));
    expect(item).toMatchObject({ has_photo: "f", photo_alt: null, photo_version: "4", on_hand: "7", stock_version: "3" });
    expect(await execute("SELECT * FROM stewardship_gift_item_photos")).toHaveLength(0);
    expect(await readGiftItemHistory(actor, item.id, db)).toHaveLength(4);
  });
  it("retains photos through archive and restore and refuses archived replacements", async () => {
    const [item] = await write({ ...create, photo });
    const [archived] = await write({ operation: "archive", id: item.id, version: 1, reason: "Retired" });
    expect(await readGiftPhoto(actor, item.id, 1, db)).toBe(png);
    expect(await write(edit(archived, { photo: { operation: "remove" } }))).toHaveLength(0);
    await write({ operation: "restore", id: item.id, version: 2 });
    expect(await readGiftPhoto(actor, item.id, 1, db)).toBe(png);
  });
  it("denies photo reads after a permission change and rejects stale or concurrent edits", async () => {
    const [item] = await write({ ...create, photo });
    const results = await Promise.all(["First", "Second"].map(alt => write(edit(item, { photo: { operation: "describe", alt } }))));
    expect(results.flat()).toHaveLength(1);
    expect(await readGiftPhoto({ id: 4, role: "mgo" }, item.id, 2, db)).toBeNull();
    await execute("UPDATE users SET active=FALSE WHERE id=2");
    expect(await readGiftPhoto(actor, item.id, 2, db)).toBeNull();
  });
  it("rolls photo removal and catalog metadata back together if the audit fails", async () => {
    const [item] = await write({ ...create, photo });
    await execute("ALTER TABLE stewardship_gift_item_events ADD CONSTRAINT reject_photo_audit CHECK(version<2)");
    try { await expect(write(edit(item, { photo: { operation: "remove" } }))).rejects.toThrow(); }
    finally { await execute("ALTER TABLE stewardship_gift_item_events DROP CONSTRAINT reject_photo_audit"); }
    expect(await readGiftPhoto(actor, item.id, 1, db)).toBe(png);
    expect((await readGiftInventory(actor, db))[0].version).toBe(1);
  });
  it("rolls creation back if photo storage fails and cannot describe a nonexistent photo", async () => {
    await execute("ALTER TABLE stewardship_gift_item_photos ADD CONSTRAINT reject_photo_storage CHECK(item_id<0)");
    try { await expect(write({ ...create, photo })).rejects.toThrow(); }
    finally { await execute("ALTER TABLE stewardship_gift_item_photos DROP CONSTRAINT reject_photo_storage"); }
    expect(await readGiftInventory(actor, db)).toHaveLength(0);
    const [item] = await write(create);
    expect(await write(edit(item, { photo: { operation: "describe", alt: "Missing" } }))).toHaveLength(0);
  });
});

// Disposable Unix-socket PostgreSQL only. Never reads DATABASE_URL or calls NXT.
import { execFileSync } from "node:child_process";
import Papa from "papaparse";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import relationshipOriginatorSchema from "./relationshipOriginatorSchema";
const socket = process.env.ORIGINATOR_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/relationship-originator-pg\.[A-Za-z0-9]+$/.test(socket || "");
function execute(query) {
  const output = execFileSync("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55451", "-d", "postgres"],
    { input: `SET search_path=originator_fixture;\n${query}`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  return output.trim() ? Papa.parse(output.trim(), { header: true }).data : [];
}
describe.skipIf(!enabled)("originator durable PostgreSQL safeguards", () => {
  beforeAll(async () => {
    execute("CREATE SCHEMA originator_fixture; SET search_path=originator_fixture; CREATE TABLE users(id BIGINT PRIMARY KEY); INSERT INTO users VALUES(1),(2);");
    const db = async parts => execute(parts.join(""));
    await relationshipOriginatorSchema(db); await relationshipOriginatorSchema(db);
  });
  beforeEach(() => execute("TRUNCATE relationship_originator_changes, relationship_originator_refresh_locks;"));
  const insert = (owner = 1, state = "pending") => `INSERT INTO relationship_originator_changes
    (constituent_id,owner_user_id,entered_by_user_id,originator_name,origin_date,previous_fields,state)
    VALUES('200',${owner},${owner},'Fictional Fundraiser','2026-07-01','[]','${state}') ON CONFLICT DO NOTHING RETURNING id;`;
  it("blocks a second claimant across user accounts and keeps ambiguous writes locked", () => {
    expect(execute(insert())).toHaveLength(1); expect(execute(insert(2))).toHaveLength(0);
    execute("UPDATE relationship_originator_changes SET state='review';");
    expect(execute(insert(2))).toHaveLength(0);
  });
  it("retains confirmed audit history while allowing an explicit new correction claim", () => {
    execute(insert()); execute("UPDATE relationship_originator_changes SET state='confirmed',remote_field_id='71';");
    expect(execute(insert(2))).toHaveLength(1);
    expect(execute("SELECT * FROM relationship_originator_changes;")).toHaveLength(2);
  });
  it("rejects invalid owners and unknown state transitions at the storage boundary", () => {
    expect(() => execute(insert(999))).toThrow();
    expect(() => execute(insert(1, "retry"))).toThrow();
  });
  it("keeps a live refresh exclusive and lets a timed-out refresh be reclaimed", () => {
    const claim = token => `INSERT INTO relationship_originator_refresh_locks VALUES('report','${token}',NOW()+INTERVAL '5 minutes')
      ON CONFLICT(cache_key) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at
      WHERE relationship_originator_refresh_locks.expires_at < NOW() RETURNING token;`;
    expect(execute(claim("first"))[0].token).toBe("first"); expect(execute(claim("second"))).toHaveLength(0);
    execute("UPDATE relationship_originator_refresh_locks SET expires_at=NOW()-INTERVAL '1 second';");
    expect(execute(claim("second"))[0].token).toBe("second");
  });
});

import { expect, it } from "vitest";
import { stockCommand, stockLabel } from "./stewardshipStock";
const command = { operation: "stock", viewerKey: "auth-2", id: "1", stockVersion: 0,
  token: "74512c41-89cd-41be-946e-10a056cae491", kind: "opening", quantity: 0, reason: "", confirmed: true };
it("distinguishes uncounted from zero and validates opening counts", () => {
  expect(stockLabel({ on_hand: null })).toBe("Not counted");
  expect(stockLabel({ on_hand: 0 })).toBe("0 on hand");
  expect(stockCommand(command)).toEqual(command);
});
it.each([{ quantity: -1 }, { quantity: 1.5 }, { quantity: "1" }, { quantity: 1000001 }, { confirmed: false }, { stockVersion: -1 },
  { kind: "fulfillment" }, { kind: "restock", quantity: 0 }, { kind: "return", quantity: 1 }, { kind: "adjustment" },
  { token: "bad" }, { actorId: "2" }, { id: "lookup" }])("rejects invalid or privileged stock input %o", patch => {
  expect(stockCommand({ ...command, ...patch })).toBeNull();
});
it("requires reasons for returns and recounts", () => {
  expect(stockCommand({ ...command, kind: "adjustment", quantity: 0, reason: " Physical recount " }).reason).toBe("Physical recount");
  expect(stockCommand({ ...command, kind: "return", quantity: 1, reason: "Returned unused" })).not.toBeNull();
});

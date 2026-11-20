import { describe, expect, it } from "vitest";
import { pledgeReminderEmailRecipient, reminderEmailText, reminderEmailLinks, reminderPdfFilename, validReminderEmail } from "./pledgeReminderHandoff";
const person = () => ({ id: "10", deceased: false, inactive: false, email: { constituent_id: "10", address: "avery@example.test", inactive: false, do_not_email: false } });
describe("pledge reminder email handoff", () => {
  it("uses only the matched active primary NXT email", () => {
    expect(pledgeReminderEmailRecipient(person(), "10")).toEqual({ address: "avery@example.test", reason: "" });
    expect(() => pledgeReminderEmailRecipient(person(), "20")).toThrow(/identity/);
    const p = person(); p.email.constituent_id = "20";
    expect(pledgeReminderEmailRecipient(p, "10")).toMatchObject({ address: "", reason: expect.stringContaining("match") });
  });
  it.each([true, undefined, null])("holds restricted or unverified email flags %s", flag => {
    for (const key of ["do_not_email", "inactive"]) {
      const p = person(); p.email[key] = flag;
      expect(pledgeReminderEmailRecipient(p, "10").address).toBe("");
    }
  });
  it.each([true, undefined, null])("holds unconfirmed constituent status %s", flag => {
    for (const key of ["deceased", "inactive"]) {
      const p = person(); p[key] = flag;
      expect(pledgeReminderEmailRecipient(p, "10").address).toBe("");
    }
  });
  it("keeps missing email separate from PDF eligibility", () => {
    expect(pledgeReminderEmailRecipient({ ...person(), email: null }, "10").reason).toContain("PDF is still available");
  });
  it.each(["a@example.test,b@example.test", "a@example.test; b@example.test", "a@example.test\r\nBcc: b@example.test", "A <a@example.test>", "a@localhost", "a@-example.test", "a@example.test?bcc=other@test.com"])("rejects unsafe recipients %s", address => {
    expect(validReminderEmail(address)).toBe(false);
    expect(reminderEmailLinks(address, "Reminder", "Hello")).toBe(null);
  });
  it("encodes all text and uses only fixed compose destinations without attachment or send parameters", () => {
    const links = reminderEmailLinks("a+tag@example.test", "Reminder &bcc=other@example.test", "Dear A & B,\nHello # everyone?");
    const parsed = new URL(links.outlook);
    expect(parsed.origin + parsed.pathname).toBe("https://outlook.office.com/mail/deeplink/compose");
    expect([...parsed.searchParams.keys()]).toEqual(["to", "subject", "body"]);
    expect(parsed.searchParams.get("to")).toBe("a+tag@example.test");
    expect(parsed.searchParams.get("body")).toBe("Dear A & B,\nHello # everyone?");
    expect(links.desktop).toMatch(/^mailto:a%2Btag%40example.test\?subject=/);
  });
  it("limits subject/body and rejects control characters, keeping long links unavailable", () => {
    for (const [subject, message] of [["", "Hello"], ["Bad\r\nCc: hi", "Hello"], ["Reminder", "\x00unsafe"], ["x".repeat(161), "Hello"], ["Reminder", "x".repeat(2001)], ["Reminder", "\u4e00".repeat(1000)]])
      expect(reminderEmailLinks("a@example.test", subject, message)).toBe(null);
  });
  it("keeps amount and bank details out of the email link's default message", () => {
    const email = reminderEmailText("Avery\nExample");
    expect(email.message).toContain("Dear Avery Example,"); expect(email.message).toContain("attached");
    expect(email.message).not.toMatch(/\$|routing|balance|invoice paid/i);
  });
  it("creates safe, distinct PDF filenames and rejects invalid dates", () => {
    expect(reminderPdfFilename({ lookupId: '../../P100"\r\n' }, "2026-11-20")).toBe("pledge-reminder-______P100___-2026-11-20.pdf");
    expect(() => reminderPdfFilename({ id: "1" }, "2026-02-30")).toThrow();
  });
});

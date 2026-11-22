import { expect, it } from "vitest";
import { outreachContactRows, outreachPhoneHref } from "./outreachContacts";

it.each([
  ["(904) 555-0100", "tel:9045550100"],
  ["+1 (904) 555-0100", "tel:+19045550100"],
  ["904.555.0100 ext. 123", "tel:9045550100;ext=123"],
  ["9045550100 x42", "tel:9045550100;ext=42"],
  ["555-0100", "tel:5550100"],
  ["+44 20 7946 0958", "tel:+442079460958"],
])("makes a call link only from a single explicit phone: %s", (value, expected) => {
  expect(outreachPhoneHref(value)).toBe(expected);
});
it.each(["",null,123,"911","javascript:alert(1)","5550100/5550101","5550100,5550101","5550100;123","5550100#123","5550100\n123","5550100\r\nX:123","5550100 ext. someone","+1+9045550100","1234567890123456","1-800-FLOWERS","<5550100>","5550100 ext 123456789"])("keeps unsafe or ambiguous phones non-clickable: %j", value => {
  expect(outreachPhoneHref(value)).toBeNull();
});
it("deduplicates the same number across mapped columns but preserves distinct extensions", () => {
  expect(outreachContactRows({phones:["904-555-0100"],alternatePhones:["(904) 555-0100","9045550100 x2"],emails:["avery@example.test","avery@example.test",""]}).map(c=>[c.label,c.href,c.value])).toEqual([
    ["Phone","tel:9045550100","904-555-0100"],
    ["Alternate phone","tel:9045550100;ext=2","9045550100 x2"],
    ["Email",null,"avery@example.test"],
  ]);
});
it("keeps empty optional contacts hidden and never makes email send links", () => {
  expect(outreachContactRows(null)).toEqual([]);
  expect(outreachContactRows({phones:[],emails:["avery@example.test"]})[0].href).toBeNull();
});

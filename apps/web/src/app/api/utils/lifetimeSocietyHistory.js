import { visitResultCsv } from "./dashboardQueryResults";
import { centsFromText } from "./fyRevenueGoals";
import { LIFETIME_RULE_VERSION, lifetimeConstituentType, lifetimeError } from "@/utils/lifetimeSocieties";

export const LIFETIME_LIMITS = { bytes: 32 * 1024 * 1024, rows: 250000, people: 10000, gifts: 150000 };
const idPattern = /^[1-9]\d{0,18}$/;
const token = value => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const directFlags = new Set(["Regular Gift", "Company MG-Pledge", "Company MG-Payment"]);
const matchingFlags = new Set(["Constituent MG-Pledge", "Constituent MG-Payment"]);
const softFlags = new Set(["Soft Credit Recipient", "Soft Credit Recipient Company for MG Pledge", "Soft Credit Recipient Company for MG Payment"]);
const uncomplicatedTypes = new Set(["onetimegift", "cash", "giftinkind", "other", "stockproperty", "recurringgiftpayment"]);

export function lifetimeDay(value) {
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: 12:00:00 AM)?$/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : null;
  if (!parts) return null;
  const day = parts.map((v, i) => v.padStart(i === 0 ? 4 : 2, "0")).join("-");
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

// Deliberately conservative first release: complicated gift histories remain
// visible for review, rather than manufacturing a precise entry date.
export function aggregateLifetimeHistory(content, inspection, societies, expectedRows, now = new Date()) {
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0 || expectedRows > LIFETIME_LIMITS.rows)
    throw lifetimeError("The completed query row count is missing or exceeds the report limit. Saved results are unchanged.");
  if (!inspection.ready || !["system", "lookup"].includes(inspection.identityMode))
    throw lifetimeError("Add the missing query outputs before importing gift history.");
  const people = new Map(), gifts = new Map(), conflictingPeople = new Set(), directOwners = new Map(), lookupOwners = new Map(); let indexes, repeatedRows = 0;
  const today = now.toISOString().slice(0, 10);
  const { rowCount } = visitResultCsv(content, { maxRows: LIFETIME_LIMITS.rows,
    onHeaders(headers) {
      if (Object.values(inspection.columns).filter(Boolean).some(name => !headers.includes(name)))
        throw lifetimeError("The downloaded results do not match the inspected query outputs. Saved results are unchanged.");
      indexes = Object.fromEntries(Object.entries(inspection.columns).map(([key, name]) => [key, headers.indexOf(name)]));
    },
    onRow(row) {
      const cell = key => indexes[key] >= 0 ? row[indexes[key]].trim() : "";
      const systemId = cell("constituentId"), giftId = cell("giftId"), name = cell("name"), lookupId = cell("lookupId");
      if ((inspection.identityMode === "system" ? !idPattern.test(systemId) : !lookupId) ||
        !idPattern.test(giftId) || !name || name.length > 300 || lookupId.length > 100 || /[\u0000-\u001f\u007f]/.test(lookupId))
        throw lifetimeError("A row has a missing or invalid constituent identifier, gift system record ID or name. No identities were guessed.");
      // Query-local keys are never API IDs. Preserve lookup-ID case and leading zeros.
      const id = JSON.stringify([inspection.identityMode, inspection.identityMode === "system" ? systemId : lookupId]);
      if (lookupId) {
        if (lookupOwners.has(lookupId) && lookupOwners.get(lookupId) !== id)
          throw lifetimeError("A Constituent ID points to conflicting system records. Saved results are unchanged.");
        lookupOwners.set(lookupId, id);
      }
      const credit = cell("credit"), dateText = cell("date"), amountText = cell("amount"), type = cell("type");
      const signature = JSON.stringify([dateText, amountText, type]);
      const key = JSON.stringify([id, giftId, credit]);
      if (gifts.has(key)) {
        if (gifts.get(key) !== signature) conflictingPeople.add(id);
        repeatedRows++;
      } else {
        gifts.set(key, signature);
      }
      if (directFlags.has(credit)) {
        const owner = directOwners.get(giftId);
        if (owner && owner !== id) { conflictingPeople.add(owner); conflictingPeople.add(id); }
        directOwners.set(giftId, id);
      }
      let person = people.get(id);
      if (person && (person.name !== name || person.lookupId !== lookupId)) throw lifetimeError("A constituent has conflicting identity rows. Saved results are unchanged.");
      if (!person) { person = { id, systemId: systemId || null, name, lookupId, types: new Set(), events: new Map() }; people.set(id, person); }
      person.types.add(lifetimeConstituentType(cell("constituentType")));
      if (people.size > LIFETIME_LIMITS.people || gifts.size > LIFETIME_LIMITS.gifts) throw lifetimeError("The report exceeds its supported history size. Nothing was truncated.", 413);
      let cents = null;
      try { if (amountText) cents = centsFromText(amountText); } catch { /* Keep the person visible for review. */ }
      person.events.set(`${giftId}:${credit}`, { giftId, credit, day: lifetimeDay(dateText), cents, type });
    },
  });
  if (rowCount !== expectedRows) throw lifetimeError("The downloaded and completed query row counts differ. Saved results are unchanged.");
  const results = [];
  for (const person of people.values()) {
    const constituentType = person.types.size === 1 ? [...person.types][0] : "unknown";
    const constituentTypeNote = person.types.size > 1 ? "Constituent type is inconsistent across query rows; no type was guessed." :
      constituentType === "unknown" ? "Constituent Key Indicator is missing or unrecognized; retained in the combined view." : "";
    for (const society of societies) {
      const reasons = new Set(), events = [], ownGiftIds = new Set(), directEvents = new Map();
      if (conflictingPeople.has(person.id)) reasons.add("Repeated gift records conflict; reconcile amounts, dates, types or ownership.");
      if (inspection.restrictedHistory) reasons.add("Gift-level criteria may exclude earlier qualifying gifts.");
      const sources = society.countSources;
      const thresholdCents = Math.round(society.minimumAmount * 100);
      if (!sources.includes("committed") || sources.some(source => !["committed", "recognition_credit"].includes(source)))
        reasons.add("This society's saved recognition rule needs a separate historical calculation.");
      for (const event of person.events.values()) if (directFlags.has(event.credit)) ownGiftIds.add(event.giftId);
      for (const event of person.events.values()) {
        if (matchingFlags.has(event.credit)) continue; // Employee matching credit is not the company's own gift.
        const soft = softFlags.has(event.credit);
        if (!directFlags.has(event.credit) && !soft) { reasons.add("An unrecognized credit flag needs review."); continue; }
        if (soft && (!sources.includes("recognition_credit") || ownGiftIds.has(event.giftId))) continue;
        if (soft) { reasons.add("Recognition credit needs recipient-level allocation verification."); continue; }
        const previous = directEvents.get(event.giftId);
        if (previous) {
          if (JSON.stringify([previous.day, previous.cents, previous.type]) !== JSON.stringify([event.day, event.cents, event.type]))
            reasons.add("Repeated gift records conflict; reconcile amounts, dates, types or ownership.");
          continue;
        }
        directEvents.set(event.giftId, event);
        if (!event.day || event.day > today) reasons.add("A gift date is missing, invalid or in the future.");
        if (event.cents === null || event.cents < 0) reasons.add("A missing, invalid or negative gift amount needs review.");
        if (!uncomplicatedTypes.has(token(event.type))) {
          reasons.add("Pledges, payments, write-offs or other complex gifts need linked history reconciliation.");
          continue;
        }
        events.push(event);
      }
      let totalCents = 0, date = null, crossingGiftIds = [];
      // Treat same-day giving as one event; row order is not evidence of timing.
      const daily = new Map();
      if (!reasons.size) {
        for (const event of events) {
          const day = daily.get(event.day) || { cents: 0, ids: [] };
          day.cents += event.cents; day.ids.push(event.giftId); daily.set(event.day, day);
          if (!Number.isSafeInteger(day.cents)) throw lifetimeError("Gift totals exceed the supported reporting range.");
        }
        for (const [day, value] of [...daily].sort(([a], [b]) => a.localeCompare(b))) {
          totalCents += value.cents;
          if (!Number.isSafeInteger(totalCents)) throw lifetimeError("Gift totals exceed the supported reporting range.");
          if (!date && totalCents >= thresholdCents) { date = day; crossingGiftIds = [...new Set(value.ids)].sort(); }
        }
        if (!date) reasons.add("The available history does not demonstrate this milestone; it is not proof of ineligibility.");
      } else totalCents = null;
      results.push({ id: person.id, systemId: person.systemId, name: person.name, lookupId: person.lookupId, constituentType, constituentTypeNote, societyKey: society.key, societyName: society.name,
        thresholdCents, totalCents, date, crossingGiftIds, giftCount: person.events.size,
        status: date ? "provisional" : "review", reasons: [...reasons] });
    }
  }
  return { ruleVersion: LIFETIME_RULE_VERSION, identityMode: inspection.identityMode, rows: results.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    peopleCount: people.size, rawRows: rowCount, uniqueCreditGifts: gifts.size, repeatedRows,
    provisionalCount: results.filter(row => row.date).length, reviewCount: results.filter(row => !row.date).length };
}

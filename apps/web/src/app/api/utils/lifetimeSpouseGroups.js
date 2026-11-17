export function lifetimeMaritalStatus(value) {
  const status = value.trim().toLowerCase();
  // JU treats this alumni-specific table value as the same married status.
  return status === "alum married to alum" ? "married" : status;
}

// Use exact, reciprocal query identities. A name, shared gift, or shared
// address is never evidence of marriage, and no external records are added.
export function lifetimeSpouseGroups(people, inspection) {
  const pairs = [], notes = new Map();
  if (!inspection.householdsReady) return { pairs, notes };
  const records = [...people.values()];
  const isIndividual = person => person?.types.size === 1 && person.types.has("individual");
  const married = person => person?.maritalStatuses.size === 1 && person.maritalStatuses.has("married");
  const identities = new Map(records.map(person => [inspection.spouseIdentityMode === "system" ? person.systemId : person.lookupId, person]).filter(([id]) => id));
  const links = new Map(), incoming = new Map();
  const valid = id => inspection.spouseIdentityMode === "system" ? /^[1-9]\d{0,18}$/.test(id) : id.length <= 100 && !/[\u0000-\u001f\u007f]/.test(id);
  for (const person of records) {
    if (!isIndividual(person)) continue;
    // Include all claims in collision detection, even if one row conflicts.
    for (const id of person.spouseIds) {
      const target = identities.get(id);
      if (id && valid(id) && target) {
        if (!incoming.has(target.id)) incoming.set(target.id, new Set());
        incoming.get(target.id).add(person.id);
      }
    }
    const [spouseId] = person.spouseIds;
    if (person.spouseIds.size !== 1 || (spouseId && !valid(spouseId))) {
      notes.set(person.id, "Spouse identifiers are invalid or inconsistent across query rows; kept separate.");
    } else if (!spouseId) {
      if (married(person)) notes.set(person.id, "Married record has no spouse identifier in the query; kept separate.");
    } else if (!married(person)) {
      notes.set(person.id, "Marital status is not consistently Married or Alum married to alum; no automatic household was created.");
    } else {
      const spouse = identities.get(spouseId);
      if (!spouse) notes.set(person.id, "Spouse is not included in this query's gift history; kept separate. No missing history was fetched or assumed.");
      else if (spouse.id === person.id || !isIndividual(spouse)) notes.set(person.id, "Spouse link does not identify another individual; kept separate.");
      else links.set(person.id, spouse.id);
    }
  }
  for (const [id, spouseId] of links) {
    if (links.get(spouseId) !== id || incoming.get(id)?.size !== 1 || incoming.get(spouseId)?.size !== 1) {
      notes.set(id, "Spouse links are one-sided, conflicting, or lack a recognized married status on both records; kept separate for review.");
    } else if (id.localeCompare(spouseId) < 0) pairs.push([people.get(id), people.get(spouseId)]);
  }
  return { pairs, notes };
}

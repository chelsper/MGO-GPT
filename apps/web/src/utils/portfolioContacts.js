const CONTACT_FIELDS = ["email", "phone", "address"];
export const PORTFOLIO_CONTACT_TTL_MS = 24 * 60 * 60 * 1000;

export function portfolioContactsAreFresh(person, now = Date.now()) {
  const checkedAt = Date.parse(person?.contactCheckedAt || "");
  return hasSavedPortfolioContacts(person) && Number.isFinite(checkedAt) &&
    checkedAt <= now && now - checkedAt < PORTFOLIO_CONTACT_TTL_MS;
}

export function hasSavedPortfolioContacts(constituent) {
  return Boolean(
    constituent &&
      CONTACT_FIELDS.every(
        (field) => constituent[field] === null || typeof constituent[field] === "string",
      ),
  );
}

export function mergeSavedPortfolioContacts(person, constituent, {
  source = "nxt-summary-cache",
  checkedAt = null,
} = {}) {
  if (!hasSavedPortfolioContacts(constituent)) return person;

  const previousTime = Date.parse(person?.contactCheckedAt || "");
  const nextTime = Date.parse(checkedAt || "");
  if (Number.isFinite(previousTime) && (!Number.isFinite(nextTime) || nextTime < previousTime)) {
    return person;
  }

  // An explicit empty contact is a saved result, not permission to restore an
  // older local value. Incomplete/failed reads never replace the saved fields.
  return {
    ...person,
    email: constituent.email?.trim() || null,
    phone: constituent.phone?.trim() || null,
    address: constituent.address?.trim() || null,
    contactDataSource: source,
    contactCheckedAt: Number.isFinite(nextTime) ? new Date(nextTime).toISOString() : null,
  };
}

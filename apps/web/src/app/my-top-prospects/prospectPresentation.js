
export const nxtProfileLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: "999px",
  border: "1px solid #93C5FD",
  backgroundColor: "white",
  color: "#1D4ED8",
  fontSize: "12px",
  fontWeight: "700",
  textDecoration: "none",
};

export const smallActionButton = {
  border: "1px solid #93C5FD",
  borderRadius: "9px",
  backgroundColor: "white",
  color: "#1D4ED8",
  padding: "8px 11px",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
};

export function buildPortfolioUpdateHref(person, mode) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("returnTo", "/my-top-prospects?tab=portfolio");

  if (person?.name) {
    params.set("donor", person.name);
  }

  if (person?.constituentId) {
    params.set("blackbaudConstituentId", String(person.constituentId));
  }

  if (person?.lookupId) {
    params.set("lookupId", String(person.lookupId));
  }

  return `/action-opportunity-update?${params.toString()}`;
}

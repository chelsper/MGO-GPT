import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORGANIZATION_SETTINGS,
  normalizeOrganizationSettings,
  validateOrganizationSettings,
} from "./organizationSettings";

describe("organization settings", () => {
  it("seeds the current JU defaults without requiring a database row", () => {
    expect(normalizeOrganizationSettings()).toEqual(DEFAULT_ORGANIZATION_SETTINGS);
  });

  it("normalizes settings received from the database and form", () => {
    expect(
      normalizeOrganizationSettings({
        institution_name: "Example College",
        short_name: "EC",
        application_name: "Advancement Hub",
        advancement_services_notification_email: "devdata@example.edu",
        notification_sender_name: "Example Advancement Hub",
        time_zone: "America/Chicago",
        currency_code: "cad",
        date_format: "YYYY-MM-DD",
        fiscal_year_start_month: "1",
        allowed_email_domains: ["@example.edu", "example.edu", " alumni.example.edu "],
        terminology: {
          mgo: "Gift Officer",
          advancement_services: "Data Services",
          executive: "Leadership",
        },
      }),
    ).toEqual({
      institutionName: "Example College",
      shortName: "EC",
      applicationName: "Advancement Hub",
      advancementServicesNotificationEmail: "devdata@example.edu",
      notificationSenderName: "Example Advancement Hub",
      timeZone: "America/Chicago",
      currencyCode: "CAD",
      dateFormat: "YYYY-MM-DD",
      fiscalYearStartMonth: 1,
      allowedEmailDomains: ["example.edu", "alumni.example.edu"],
      terminology: {
        mgo: "Gift Officer",
        advancementServices: "Data Services",
        executive: "Leadership",
      },
    });
  });

  it("rejects unsafe institution profile values before they are saved", () => {
    expect(
      validateOrganizationSettings({
        institutionName: "",
        shortName: "EC",
        applicationName: "App",
        advancementServicesNotificationEmail: "devdata@example.edu",
        notificationSenderName: "App",
        timeZone: "America/New_York",
        currencyCode: "USD",
        dateFormat: "MM/DD/YYYY",
        fiscalYearStartMonth: 7,
      }),
    ).toBe("Institution name is required");

    expect(
      validateOrganizationSettings({
        institutionName: "Example College",
        shortName: "EC",
        applicationName: "App",
        advancementServicesNotificationEmail: "devdata@example.edu",
        notificationSenderName: "App",
        timeZone: "Not/A_Real_Timezone",
        currencyCode: "USD",
        dateFormat: "MM/DD/YYYY",
        fiscalYearStartMonth: 7,
      }),
    ).toBe("Select a valid IANA time zone");

    expect(
      validateOrganizationSettings({
        institutionName: "Example College",
        shortName: "EC",
        applicationName: "App",
        advancementServicesNotificationEmail: "devdata@example.edu",
        notificationSenderName: "App",
        timeZone: "America/New_York",
        currencyCode: "US",
        dateFormat: "MM/DD/YYYY",
        fiscalYearStartMonth: 7,
      }),
    ).toBe("Currency code must use three uppercase letters, such as USD");

    expect(
      validateOrganizationSettings({
        institutionName: "Example College",
        shortName: "EC",
        applicationName: "App",
        advancementServicesNotificationEmail: "not-an-email",
        notificationSenderName: "App",
        timeZone: "America/New_York",
        currencyCode: "USD",
        dateFormat: "MM/DD/YYYY",
        fiscalYearStartMonth: 7,
      }),
    ).toBe("Enter a valid Advancement Services notification email");
  });

  it("accepts a complete profile without changing any runtime behavior", () => {
    expect(
      validateOrganizationSettings({
        institutionName: "Example College",
        shortName: "EC",
        applicationName: "Advancement Hub",
        advancementServicesNotificationEmail: "devdata@example.edu",
        notificationSenderName: "Advancement Hub",
        timeZone: "America/New_York",
        currencyCode: "USD",
        dateFormat: "MM/DD/YYYY",
        fiscalYearStartMonth: 7,
        allowedEmailDomains: ["example.edu"],
        terminology: {
          mgo: "Gift Officer",
          advancementServices: "Advancement Services",
          executive: "Executive",
        },
      }),
    ).toBeNull();
  });
});

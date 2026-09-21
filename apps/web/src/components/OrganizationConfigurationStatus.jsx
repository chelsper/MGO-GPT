const fieldLabels = {
  institutionName: "Institution name", shortName: "Short name", applicationName: "Application name",
  advancementServicesNotificationEmail: "Notification inbox", notificationSenderName: "Sender name",
  terminology: "Workspace labels", allowedEmailDomains: "Documented email domains",
  logoDataUrl: "Organization logo",
};

export default function OrganizationConfigurationStatus({ policy, history = [] }) {
  return <div className="my-5 space-y-4 text-sm">
    <section id="reporting-rules" aria-label="Active reporting rules" className="scroll-mt-24 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <h3 className="font-bold">Reporting rules are release-managed</h3>
      {policy ? <p className="mt-2 break-words">Fiscal year begins {new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, policy.fiscalYearStartMonth - 1, 1)))} 1.
        {" "}Reporting timezone: {policy.timeZone}. Currency: {policy.currencyCode}.
        {" "}Pledges: query {policy.pledgeQuery.id}, {policy.pledgeQuery.type} records, {policy.pledgeQuery.systemIdHeader} system-ID column.</p>
        : <p className="mt-2">Reporting policy could not be loaded. Reload the saved profile before making changes.</p>}
      <p className="mt-2">Calendar, currency, date-format, and query changes are not enabled here. They require validated mappings and a historical-report migration. Saving branding does not refresh NXT or recalculate reports.</p>
      <p className="mt-2">Disabled fields below retain earlier stored preferences; the active rules above take precedence.</p>
    </section>
    <details className="rounded-xl border border-gray-200 bg-white p-4">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">Recent organization changes</summary>
      {!history.length ? <p className="mt-2 text-gray-600">No audited changes recorded yet. Earlier edits predate this history.</p>
        : <ul className="mt-2 space-y-3">{history.map(entry => <li key={entry.id} className="break-words">
          <strong>{entry.actor_name || "Workspace administrator"}</strong>{" · "}
          <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
          <p>{entry.changed_fields.map(key => fieldLabels[key] || key).join(", ")}</p>
        </li>)}</ul>}
      <p className="mt-3 text-gray-600">Latest 10 changes. Saved values and the responsible account are retained in the audit; this list omits email values.</p>
    </details>
  </div>;
}

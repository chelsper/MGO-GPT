import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";

export const poolButtonStyle = {
  border: "1px solid #C7D2FE",
  borderRadius: "10px",
  padding: "10px 14px",
  background: "white",
  color: "#4338CA",
  fontWeight: 700,
  cursor: "pointer",
};

export function ProspectPoolNavigation({
  tab,
  onTabChange,
  activeCount,
  archiveCount,
  search,
  onSearchChange,
  sort,
  onSortChange,
}) {
  return (
    <section
      aria-label="Browse prospect pool"
      style={{
        background: "white",
        borderRadius: "18px",
        padding: "18px",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "14px",
        }}
      >
        {[
          ["active", "Active", activeCount],
          ["archive", "Archive", archiveCount],
        ].map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => onTabChange(value)}
            style={{
              ...poolButtonStyle,
              background: tab === value ? "#EEF2FF" : "white",
              borderColor: tab === value ? "#6A5BFF" : "#C7D2FE",
            }}
          >
            {label} ({count})
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
        <label
          style={{
            display: "grid",
            gap: "6px",
            flex: "1 1 240px",
            minWidth: 0,
          }}
        >
          Search {tab === "archive" ? "archive" : "active pool"}
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Name, NXT ID, email, or note"
            style={{
              ...poolButtonStyle,
              color: "#111827",
              fontWeight: 400,
              minWidth: 0,
              cursor: "text",
            }}
          />
        </label>
        {onSortChange ? (
          <label style={{ display: "grid", gap: "6px" }}>
            Sort by
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value)}
              style={poolButtonStyle}
            >
              <option value="oldest">Oldest assignment first</option>
              <option value="newest">Newest assignment first</option>
              <option value="name">Name A-Z</option>
            </select>
          </label>
        ) : null}
      </div>
      <p style={{ color: "#6B7280", fontSize: "13px", marginBottom: 0 }}>
        {tab === "archive"
          ? "Completed pool entries. Archiving does not remove the constituent from their NXT portfolio."
          : "Open a card to review details, request help, or assign the prospect to your portfolio."}
      </p>
    </section>
  );
}

export function ProspectPoolArchiveCard({
  entry,
  formatDate,
  showPortfolioLink = true,
}) {
  const nxtUrl = buildBlackbaudConstituentProfileUrl(
    entry.linked_blackbaud_constituent_id || entry.blackbaud_constituent_id,
  );
  const outcomeNeedsAttention =
    entry.mgogpt_disposition_value &&
    entry.mgogpt_disposition_sync_state !== "success";
  return (
    <article
      style={{
        background: "white",
        borderRadius: "18px",
        padding: "20px",
        border: "1px solid #E5E7EB",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div>
          <span style={{ color: "#047857", fontSize: "13px", fontWeight: 700 }}>
            Assigned to portfolio
          </span>
          <h2 style={{ margin: "6px 0", fontSize: "20px" }}>
            {entry.prospect_name}
          </h2>
          <p style={{ color: "#6B7280", margin: "6px 0" }}>
            Lead Solicitor:{" "}
            {entry.assigned_user_name ||
              entry.assigned_user_email ||
              "Assigned MGO"}
            {" | "}
            {entry.solicitor_assignment_synced_at
              ? formatDate(entry.solicitor_assignment_synced_at)
              : "Assignment date unavailable"}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {showPortfolioLink ? (
            <a href="/my-top-prospects?tab=portfolio" style={poolButtonStyle}>
              View in Portfolio
            </a>
          ) : null}
          {nxtUrl ? (
            <a
              href={nxtUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={poolButtonStyle}
            >
              Open NXT profile
            </a>
          ) : null}
        </div>
      </div>
      <p>
        Outcome:{" "}
        <strong>{entry.mgogpt_disposition_value || "Not recorded"}</strong>
      </p>
      {outcomeNeedsAttention || entry.needs_contact_info ? (
        <div
          role="status"
          style={{
            background: "#FFFBEB",
            color: "#92400E",
            borderRadius: "10px",
            padding: "12px",
          }}
        >
          {outcomeNeedsAttention ? (
            <div>
              The assignment succeeded, but the outcome still needs NXT
              follow-up. Contact Advancement Services.
            </div>
          ) : null}
          {entry.needs_contact_info ? (
            <div>
              A contact-information request remains open with Advancement
              Services.
            </div>
          ) : null}
        </div>
      ) : null}
      <details style={{ marginTop: "12px" }}>
        <summary
          style={{ cursor: "pointer", color: "#4338CA", fontWeight: 700 }}
        >
          View archived notes
        </summary>
        <p>
          Pool assignment: {formatDate(entry.assigned_at || entry.created_at)}
        </p>
        <p>
          Assigned by:{" "}
          {entry.assignment_updated_by_name ||
            entry.created_by_name ||
            "Advancement Services"}
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>
          Pool note: {entry.note || "None"}
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>
          Outcome comment: {entry.mgogpt_disposition_comment || "None"}
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>
          Contact request: {entry.contact_info_request_note || "None"}
        </p>
      </details>
    </article>
  );
}

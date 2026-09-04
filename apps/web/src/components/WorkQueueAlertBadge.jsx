const QUEUE_BADGES = {
  "/submissions": ["workQueue", "items in the work queue"],
  "/list-requests": ["listRequests", "list requests to work"],
  "/data-requests": ["dataRequests", "open or in-progress data requests"],
  "/constituency-import": ["constituencyImports", "unfinished constituency import batches"],
  "/family-import": ["familyImports", "unfinished family import batches"],
  "/prospect-pool": ["prospectPool", "pool entries needing follow-up"],
};

export default function WorkQueueAlertBadge({ href, counts, compact = false }) {
  const definition = QUEUE_BADGES[href];
  if (!definition) return null;
  const [key, description] = definition;
  const count = counts?.[key];
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  const label = `${count} ${description}`;

  return (
    <span
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        flexShrink: 0,
        padding: compact ? "3px 7px" : "4px 9px",
        borderRadius: "999px",
        backgroundColor: "#FEF3C7",
        border: "1px solid #FCD34D",
        color: "#92400E",
        fontSize: compact ? "12px" : "13px",
        fontWeight: 800,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true">!</span>
      <span aria-hidden="true">{count.toLocaleString()}</span>
    </span>
  );
}

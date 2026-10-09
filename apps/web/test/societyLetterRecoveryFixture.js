export function unsubmittedLetter() {
  const batchId = "00000000-0000-4000-8000-000000000002";
  return {
    id: "00000000-0000-4000-8000-000000000001",
    batchId,
    householdId: "10",
    members: ["10", "11"],
    name: "Alex and Pat Example",
    addressee: "Alex and Pat Example",
    salutation: "Alex and Pat",
    period: { key: "2026", start: "2026-01-01", end: "2026-12-31" },
    societyKey: "presidents",
    societyName: "President's Society",
    coveredKeys: ["presidents", "ood"],
    channel: "post",
    status: "prepared",
    preparedAt: "2026-10-09T12:00:00Z",
    postalApproval: { batchId, index: 0 },
    postalDocument: {
      id: "00000000-0000-4000-8000-000000000003",
      format: "pdf",
      sha256: "fictional-hash",
      size: 100,
    },
    letterAppeals: {
      status: "pending",
      appeal: { id: "100", description: "Example CY2026 letter appeal" },
      members: [
        { id: "10", status: "pending" },
        { id: "11", status: "pending" },
      ],
    },
  };
}

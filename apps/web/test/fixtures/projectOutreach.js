export const report = {
  key: "list-fictional-outreach",
  title: "Fictional year-end calls",
  revision: "2026-11-20 12:00:00+00",
  dataConfiguration: {
    section: "project-prospecting",
    source: "saved_query",
    systemIdColumn: "System ID",
  },
};
export const snapshot = {
  generatedAt: "2026-11-20T12:00:00.000Z",
  headers: ["System ID", "Name", "Phone", "Restrictions"],
  tableRows: [
    ["123", "Fictional Avery", "555-0100", ""],
    ["123", "Fictional Avery", "555-0101", "Do not call"],
    ["456", "Fictional Blake", "", ""],
  ],
};
export const settings = {
  nameColumn: "Name",
  phoneColumn: "Phone",
  restrictionColumn: "Restrictions",
  deadline: "2026-12-31",
  instructions: "Fictional test only.",
  interactionType: "Solicitation",
};
export const ids = {
  task: "11111111-1111-4111-8111-111111111111",
  event: "22222222-2222-4222-8222-222222222222",
};
export const result = {
  eventId: ids.event,
  taskId: ids.task,
  version: 1,
  outcome: "reached",
  notes: "Fictional outcome.",
  actionDate: "2026-11-20",
  stage: "complete",
  nextDate: "",
  contactReviewed: true,
};
export const saved = {
  settings,
  settingsVersion: 1,
  revision: report.revision,
  snapshotAt: snapshot.generatedAt,
  viewerId: 8,
  canManage: false,
  canRecord: true,
  today: "2026-11-20",
  callers: [],
  overlaps: [],
  tasks: [
    {
      id: ids.task,
      constituentId: "123",
      name: "Fictional Avery",
      assigneeId: 8,
      assigneeName: "Fictional Caller",
      assigneeAvailable: true,
      inCurrentQuery: true,
      dueDate: "2026-12-31",
      stage: "not_started",
      version: 1,
      events: [],
    },
  ],
};

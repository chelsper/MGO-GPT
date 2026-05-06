const STARTER_CATEGORIES = [
  {
    id: "advancement-services-processes",
    title: "Advancement Services Processes",
    description: "Operational procedures, handoffs, queues, and service standards.",
    icon: "workflow",
  },
  {
    id: "gift-processing",
    title: "Gift Processing",
    description: "Gift entry, receipting, acknowledgment, and exception handling.",
    icon: "gift",
  },
  {
    id: "mgo-workflows",
    title: "MGO Workflows",
    description: "Gift officer process guidance, portfolio workflows, and team expectations.",
    icon: "target",
  },
  {
    id: "systems-documentation",
    title: "Systems Documentation",
    description: "System ownership, source-of-truth notes, and operational dependencies.",
    icon: "monitor-cog",
  },
  {
    id: "blackbaud-guidance",
    title: "Raiser’s Edge NXT / Blackbaud Guidance",
    description: "Platform-specific guidance, field usage, and operational standards.",
    icon: "database",
  },
  {
    id: "sky-api-sync-guidance",
    title: "SKY API / App Sync Guidance",
    description: "Integration behavior, sync expectations, and troubleshooting guidance.",
    icon: "plug-zap",
  },
  {
    id: "scholarship-restricted-funds",
    title: "Scholarship & Restricted Fund Procedures",
    description: "Restricted fund handling, scholarship support, and related controls.",
    icon: "graduation-cap",
  },
  {
    id: "donor-acknowledgement",
    title: "Donor Acknowledgement Standards",
    description: "Acknowledgment timing, language controls, and quality review.",
    icon: "mail-check",
  },
  {
    id: "troubleshooting-scenarios",
    title: "Common Scenarios & Troubleshooting",
    description: "Operational edge cases, issue diagnosis, and recovery patterns.",
    icon: "wrench",
  },
  {
    id: "glossary-terminology",
    title: "Glossary & Terminology",
    description: "Shared definitions, preferred terms, and NXT-aligned terminology.",
    icon: "book-key",
  },
];

export const ARTICLE_TYPES = [
  { value: "procedure", label: "Procedure" },
  { value: "policy", label: "Policy / Standard" },
  { value: "process", label: "Process Map" },
  { value: "system", label: "System Directory" },
  { value: "glossary", label: "Glossary Term" },
  { value: "troubleshooting", label: "Scenario / Troubleshooting" },
  { value: "reference", label: "Reference" },
];

export const ARTICLE_TEMPLATES = [
  {
    key: "procedure",
    label: "Procedure article",
    articleType: "procedure",
    fields: {
      purpose: "",
      whenThisApplies: [],
      steps: [],
      relatedSystems: [],
      relatedProcesses: [],
      relatedRequestLinks: [],
      risksCommonFailurePoints: [],
      ownerNotes: "",
    },
    contentBlocks: [
      { id: "summary", type: "text", title: "Summary", text: "" },
      { id: "procedure-steps", type: "steps", title: "Step-by-step procedure", items: [] },
      { id: "see-also", type: "list", title: "See also", items: [] },
    ],
  },
  {
    key: "process",
    label: "Process map",
    articleType: "process",
    fields: {
      purpose: "",
      trigger: "",
      inputs: [],
      steps: [],
      systemsUsed: [],
      dataCreatedOrUpdated: [],
      responsibleRoles: [],
      outputs: [],
      relatedProcedures: [],
      risksCommonFailurePoints: [],
    },
    contentBlocks: [
      { id: "overview", type: "text", title: "Overview", text: "" },
      { id: "process-steps", type: "steps", title: "Steps", items: [] },
    ],
  },
  {
    key: "system",
    label: "System directory page",
    articleType: "system",
    fields: {
      purpose: "",
      whoUsesIt: [],
      dataLivesThere: [],
      sourceOfTruthNotes: [],
      relatedProcesses: [],
      relatedReports: [],
      commonIssues: [],
      escalationContact: "",
    },
    contentBlocks: [
      { id: "system-overview", type: "text", title: "Overview", text: "" },
      { id: "common-issues", type: "list", title: "Common issues", items: [] },
    ],
  },
  {
    key: "glossary",
    label: "Glossary term",
    articleType: "glossary",
    fields: {
      definition: "",
      nxtTerminology: "",
      relatedArticles: [],
    },
    contentBlocks: [
      { id: "definition", type: "text", title: "Definition", text: "" },
    ],
  },
];

export const DIRECTORY_LINKS = [
  {
    id: "start-here",
    title: "Start here",
    description: "Suggested first reads for new users and cross-functional handoffs.",
    kind: "start",
  },
  {
    id: "systems",
    title: "Systems directory",
    description: "Browse system pages, ownership, source-of-truth notes, and related processes.",
    kind: "system",
  },
  {
    id: "processes",
    title: "Process maps",
    description: "Browse trigger-to-output process pages and linked procedures.",
    kind: "process",
  },
  {
    id: "glossary",
    title: "Glossary",
    description: "Shared terminology, definitions, and NXT-aligned terms.",
    kind: "glossary",
  },
];

export function mergeCategories(baseCategories) {
  const merged = [...(Array.isArray(baseCategories) ? baseCategories : [])];
  const seen = new Set(merged.map((category) => category.id));
  for (const category of STARTER_CATEGORIES) {
    if (!seen.has(category.id)) {
      merged.push(category);
      seen.add(category.id);
    }
  }
  return merged;
}

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createArticleId(prefix = "article") {
  const stamp = `${Date.now()}`.slice(-8);
  return `${prefix}-${stamp}`;
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeDateString(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function legacySectionsToBlocks(sections) {
  const blocks = [];
  const source = sections && typeof sections === "object" ? sections : {};

  if (Array.isArray(source.rulesStandards) && source.rulesStandards.length > 0) {
    blocks.push({
      id: "rules-standards",
      type: "list",
      title: "Rules & Standards",
      items: source.rulesStandards,
      tone: "default",
    });
  }

  if (Array.isArray(source.examples) && source.examples.length > 0) {
    blocks.push({
      id: "examples",
      type: "examples",
      title: "Examples",
      items: source.examples.map((example, index) => ({
        id: example?.id || `example-${index + 1}`,
        title: example?.title || "",
        content: example?.content || "",
      })),
    });
  }

  if (source.whyThisMatters) {
    blocks.push({
      id: "why-this-matters",
      type: "text",
      title: "Why This Matters",
      text: source.whyThisMatters,
      tone: "warn",
    });
  }

  if (Array.isArray(source.commonMistakes) && source.commonMistakes.length > 0) {
    blocks.push({
      id: "common-mistakes",
      type: "list",
      title: "Common Mistakes",
      items: source.commonMistakes,
      tone: "danger",
    });
  }

  if (Array.isArray(source.steps) && source.steps.length > 0) {
    blocks.push({
      id: "steps",
      type: "steps",
      title: "Step-by-step Procedure",
      items: source.steps,
    });
  }

  if (blocks.length === 0) {
    blocks.push({
      id: "summary",
      type: "text",
      title: "Summary",
      text: "",
    });
  }

  return blocks;
}

export function getStructuredFields(sections) {
  const source = sections && typeof sections === "object" ? sections : {};
  return {
    purpose: source?.fields?.purpose || source.purpose || "",
    whenThisApplies: asArray(source?.fields?.whenThisApplies || source.whenThisApplies),
    trigger: source?.fields?.trigger || source.trigger || "",
    inputs: asArray(source?.fields?.inputs || source.inputs),
    steps: asArray(source?.fields?.steps || source.steps),
    systemsUsed: asArray(source?.fields?.systemsUsed || source.systemsUsed),
    relatedSystems: asArray(source?.fields?.relatedSystems || source.relatedSystems),
    relatedProcesses: asArray(source?.fields?.relatedProcesses || source.relatedProcesses),
    relatedReports: asArray(source?.fields?.relatedReports || source.relatedReports),
    relatedProcedures: asArray(source?.fields?.relatedProcedures || source.relatedProcedures),
    relatedRequestLinks: asArray(
      source?.fields?.relatedRequestLinks || source.relatedRequestLinks,
    ),
    dataCreatedOrUpdated: asArray(
      source?.fields?.dataCreatedOrUpdated || source.dataCreatedOrUpdated,
    ),
    responsibleRoles: asArray(source?.fields?.responsibleRoles || source.responsibleRoles),
    outputs: asArray(source?.fields?.outputs || source.outputs),
    risksCommonFailurePoints: asArray(
      source?.fields?.risksCommonFailurePoints || source.risksCommonFailurePoints,
    ),
    whoUsesIt: asArray(source?.fields?.whoUsesIt || source.whoUsesIt),
    dataLivesThere: asArray(source?.fields?.dataLivesThere || source.dataLivesThere),
    sourceOfTruthNotes: asArray(
      source?.fields?.sourceOfTruthNotes || source.sourceOfTruthNotes,
    ),
    commonIssues: asArray(source?.fields?.commonIssues || source.commonIssues),
    escalationContact: source?.fields?.escalationContact || source.escalationContact || "",
    definition: source?.fields?.definition || source.definition || "",
    nxtTerminology: source?.fields?.nxtTerminology || source.nxtTerminology || "",
    ownerNotes: source?.fields?.ownerNotes || source.ownerNotes || "",
  };
}

export function serializeSections({ contentBlocks, fields, relatedArticleIds }) {
  return {
    fields: fields || {},
    contentBlocks: contentBlocks || [],
    relatedArticles: relatedArticleIds || [],
  };
}

import { randomUUID } from "node:crypto";
import sql from "./sql";
import { listError } from "./listConfigurations";
import { canManageWorkspaceRole, isMgoRole, isAdminRole } from "@/utils/workspaceRoles";
import { readOutreachNxtReadiness } from "./projectOutreachReadiness";
import {
  outreachPeople,
  OUTREACH_LIMIT,
  outreachUuid,
  outreachVersion,
  validateOutreachOutcome,
  validateOutreachSettings,
} from "@/utils/projectOutreach";
import { validActionDate } from "@/utils/actionEntryOptions";

const managerRole = `regexp_split_to_array(lower(trim(u.role)), '\\s*,\\s*') && ARRAY['admin','advancement_services','reviewer','advancement_admin']`;
const writerRole = `regexp_split_to_array(lower(trim(u.role)), '\\s*,\\s*') && ARRAY['mgo','admin','advancement_services','reviewer','advancement_admin']`;
const access = `SELECT r.report_key FROM report_configurations r JOIN users u ON u.id=$3::bigint
  WHERE r.report_key=$1 AND r.configuration_kind='constituent_list' AND r.active=TRUE AND u.active=TRUE
  AND r.visibility='specific_users' AND r.specific_user_ids @> jsonb_build_array(u.id)
  AND r.data_configuration->>'section'='project-prospecting' AND r.updated_at::text=$4`;
const base = (c) => [
  c.report.key,
  c.origin,
  Number(c.user.id),
  c.report.revision,
];
const changed = () =>
  listError(
    "Access, assignments, or saved results changed. Reload outreach before continuing.",
    409,
  );
const canWrite = (user) =>
  canManageWorkspaceRole(user.role) || isMgoRole(user.role);

export function createProjectOutreachStore(db = sql) {
  const query = (text, values) => db(text, values);
  async function mutate(
    c,
    text,
    values,
    { manager = false, snapshotKey = "", otherUserId = null } = {},
  ) {
    if (manager ? !canManageWorkspaceRole(c.user.role) : !canWrite(c.user))
      throw listError("This account cannot change project outreach.", 403);
    // Locks serialize project changes and prevent access revocation or refresh
    // from slipping between validation and a local mutation/remote-write claim.
    const lockValues = base(c);
    const result = await db.transaction(
      [
        query(
          "SELECT report_key FROM report_configurations WHERE report_key=$1 FOR UPDATE",
          [c.report.key],
        ),
        query(
          "SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE",
          [[Number(c.user.id), ...(otherUserId ? [otherUserId] : [])]],
        ),
        query(
          "SELECT report_key FROM report_snapshots_cache WHERE report_key=$1 FOR SHARE",
          [snapshotKey],
        ),
        query(
          `WITH allowed AS (${access} AND ${manager ? managerRole : writerRole}) ${text}`,
          [...lockValues, ...values],
        ),
      ],
      { isolationLevel: "ReadCommitted" },
    );
    if (!result[3]?.length) throw changed();
    return result[3][0];
  }
  return {
    async read(c, state) {
      const [project] = await query(
        "SELECT settings, revision FROM project_outreach_projects WHERE project_key=$1 AND origin=$2",
        [c.report.key, c.origin],
      );
      const rows = await query(
        `SELECT t.id,t.constituent_id,t.assignee_id,t.name,t.stage,t.revision,t.due_date::text AS due_date, u.name AS assignee_name,
        (u.active=TRUE AND r.specific_user_ids @> jsonb_build_array(u.id) AND ${writerRole}) AS assignee_available
        FROM project_outreach_tasks t JOIN users u ON u.id=t.assignee_id
        JOIN report_configurations r ON r.report_key=t.project_key
        WHERE t.project_key=$1 AND t.origin=$2 ORDER BY t.name, t.id LIMIT 10001`,
        [c.report.key, c.origin],
      );
      const events = await query(
        `SELECT e.id,e.task_id,e.actor_id,e.result,e.state,e.action_id,e.created_at,u.name AS actor_name
        FROM project_outreach_events e JOIN project_outreach_tasks t ON t.id=e.task_id JOIN users u ON u.id=e.actor_id
        WHERE t.project_key=$1 AND t.origin=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT 10001`,
        [c.report.key, c.origin],
      );
      if (rows.length > 10000 || events.length > 10000)
        throw listError(
          "This project is too large for the pilot view. Split the next outreach cycle into a new project; no history was deleted.",
          422,
        );
      const people = outreachPeople(
        state.snapshot,
        c.report.dataConfiguration,
        project?.settings,
      );
      const current = new Map(people.map((p) => [p.constituentId, p]));
      const callers = canManageWorkspaceRole(c.user.role)
        ? await query(
            `SELECT u.id,u.name FROM users u JOIN report_configurations r ON r.report_key=$1
        WHERE u.active=TRUE AND r.specific_user_ids @> jsonb_build_array(u.id) AND ${writerRole} ORDER BY u.name,u.id`,
            [c.report.key],
          )
        : [];
      const overlap = await query(
        `SELECT t.constituent_id, count(*)::integer AS count
        FROM project_outreach_tasks t JOIN report_configurations r ON r.report_key=t.project_key
        WHERE t.origin=$2 AND t.project_key<>$1 AND t.stage<>'complete' AND r.active=TRUE
        AND r.visibility='specific_users' AND r.specific_user_ids @> jsonb_build_array($3::bigint)
        AND t.constituent_id=ANY($4::text[]) GROUP BY t.constituent_id`,
        [c.report.key, c.origin, c.user.id, people.map((p) => p.constituentId)],
      );
      return {
        settings: project?.settings || null,
        settingsVersion: Number(project?.revision || 0),
        revision: c.report.revision,
        snapshotAt: state.snapshot?.generatedAt || null,
        viewerId: Number(c.user.id),
        canManage: canManageWorkspaceRole(c.user.role),
        canRecord: canWrite(c.user),
        canManageAccounts: isAdminRole(c.user.role),
        nxtReadiness: await readOutreachNxtReadiness(c, db),
        callers: callers.map((u) => ({ id: Number(u.id), name: u.name })),
        overlaps: overlap,
        tasks: rows.map((t) => ({
          id: t.id,
          constituentId: t.constituent_id,
          assigneeId: Number(t.assignee_id),
          assigneeName: t.assignee_name,
          assigneeAvailable: t.assignee_available,
          name: current.get(t.constituent_id)?.name || t.name,
          dueDate: t.due_date,
          stage: t.stage,
          version: Number(t.revision),
          inCurrentQuery: current.has(t.constituent_id),
          events: events
            .filter((e) => e.task_id === t.id)
            .map((e) => ({
              id: e.id,
              actorId: Number(e.actor_id),
              actorName: e.actor_name,
              result: e.result,
              state: e.state,
              actionId: e.action_id,
              createdAt: e.created_at,
            })),
        })),
      };
    },
    async settings(c, state, body) {
      const error = validateOutreachSettings(
        body.settings,
        state.snapshot?.headers,
      );
      if (error || !outreachVersion(body.settingsVersion))
        throw listError(error || "Reload outreach settings.");
      if (!state.snapshot?.generatedAt) throw changed();
      return mutate(
        c,
        `, saved AS (
        INSERT INTO project_outreach_projects(project_key,origin,settings,updated_by)
        SELECT report_key,$2,$5::jsonb,$3::bigint FROM allowed WHERE $6::integer=0
          AND EXISTS(SELECT 1 FROM report_snapshots_cache WHERE report_key=$7 AND payload->>'generatedAt'=$8)
        ON CONFLICT(project_key,origin) DO NOTHING RETURNING revision
      ), edited AS (
        UPDATE project_outreach_projects SET settings=$5::jsonb, revision=revision+1, updated_by=$3::bigint,updated_at=NOW()
        WHERE project_key=$1 AND origin=$2 AND revision=$6::integer AND EXISTS(SELECT 1 FROM allowed)
          AND EXISTS(SELECT 1 FROM report_snapshots_cache WHERE report_key=$7 AND payload->>'generatedAt'=$8) RETURNING revision
      ), audit AS (
        INSERT INTO project_outreach_audits(project_key,origin,actor_id,operation,details)
        SELECT $1,$2,$3::bigint,'settings',$5::jsonb WHERE EXISTS(SELECT 1 FROM saved UNION ALL SELECT 1 FROM edited)
      ) SELECT revision FROM saved UNION ALL SELECT revision FROM edited`,
        [
          JSON.stringify(body.settings),
          body.settingsVersion,
          state.keys.snapshot,
          state.snapshot.generatedAt,
        ],
        { manager: true, snapshotKey: state.keys.snapshot },
      );
    },
    async assign(c, state, body) {
      if (
        !Array.isArray(body.people) ||
        !body.people.length ||
        body.people.length > OUTREACH_LIMIT ||
        body.people.some(
          (p) =>
            !p ||
            typeof p.constituentId !== "string" ||
            !outreachVersion(p.version) ||
            Object.keys(p).some(
              (k) => !["constituentId", "version"].includes(k),
            ),
        ) ||
        new Set(body.people.map((p) => p.constituentId)).size !==
          body.people.length ||
        !Number.isSafeInteger(body.assigneeId) ||
        body.assigneeId < 1 ||
        !validActionDate(body.dueDate) ||
        !outreachVersion(body.settingsVersion)
      )
        throw listError("Select up to 100 people, a caller, and a due date.");
      if (
        state.identity.error ||
        !state.snapshot?.generatedAt ||
        body.snapshotAt !== state.snapshot.generatedAt
      )
        throw changed();
      const [project] = await query(
        "SELECT settings FROM project_outreach_projects WHERE project_key=$1 AND origin=$2",
        [c.report.key, c.origin],
      );
      if (
        !project ||
        validateOutreachSettings(project.settings, state.snapshot.headers)
      )
        throw listError("Save valid outreach settings first.", 422);
      const people = new Map(
        outreachPeople(
          state.snapshot,
          c.report.dataConfiguration,
          project.settings,
        ).map((p) => [p.constituentId, p]),
      );
      if (body.people.some((p) => !people.has(p.constituentId)))
        throw changed();
      const selected = body.people.map((p) => ({
        ...p,
        id: randomUUID(),
        name: people.get(p.constituentId).name,
      }));
      return mutate(
        c,
        `, selected AS (SELECT * FROM jsonb_to_recordset($5::jsonb) AS x("constituentId" text,version integer,id uuid,name text)),
      eligible AS (SELECT report_key FROM allowed WHERE
        EXISTS(SELECT 1 FROM project_outreach_projects p WHERE p.project_key=$1 AND p.origin=$2 AND p.revision=$8::integer)
        AND EXISTS(SELECT 1 FROM users u JOIN report_configurations r ON r.report_key=$1 WHERE u.id=$6::bigint AND u.active=TRUE
          AND r.specific_user_ids @> jsonb_build_array(u.id) AND ${writerRole})
        AND EXISTS(SELECT 1 FROM report_snapshots_cache s WHERE s.report_key=$9 AND s.payload->>'generatedAt'=$10)
        AND NOT EXISTS(SELECT 1 FROM selected s LEFT JOIN project_outreach_tasks t ON t.project_key=$1 AND t.origin=$2 AND t.constituent_id=s."constituentId"
          WHERE COALESCE(t.revision,0)<>s.version OR EXISTS(SELECT 1 FROM project_outreach_events e WHERE e.task_id=t.id AND e.state IN ('processing','review')))),
      saved AS (INSERT INTO project_outreach_tasks(id,project_key,origin,constituent_id,assignee_id,assigned_by,name,due_date)
        SELECT s.id,a.report_key,$2,s."constituentId",$6::bigint,$3::bigint,s.name,$7::date FROM selected s CROSS JOIN eligible a
        ON CONFLICT(project_key,origin,constituent_id) DO UPDATE SET assignee_id=EXCLUDED.assignee_id,assigned_by=EXCLUDED.assigned_by,
          name=EXCLUDED.name,due_date=EXCLUDED.due_date,revision=project_outreach_tasks.revision+1,assigned_at=NOW(),updated_at=NOW()
        RETURNING id), audit AS (INSERT INTO project_outreach_audits(project_key,origin,task_id,actor_id,operation,details)
        SELECT $1,$2,id,$3::bigint,'assign',jsonb_build_object('assigneeId',$6::bigint,'dueDate',$7::text) FROM saved)
      SELECT count(*)::integer AS changed FROM saved HAVING count(*)>0`,
        [
          JSON.stringify(selected),
          body.assigneeId,
          body.dueDate,
          body.settingsVersion,
          state.keys.snapshot,
          body.snapshotAt,
        ],
        {
          manager: true,
          snapshotKey: state.keys.snapshot,
          otherUserId: body.assigneeId,
        },
      );
    },
    async record(c, state, body, today) {
      const error = validateOutreachOutcome(body.result, today);
      if (error) throw listError(error);
      const r = body.result;
      if (
        state.identity.error ||
        !state.snapshot?.generatedAt ||
        body.snapshotAt !== state.snapshot.generatedAt
      )
        throw changed();
      const [project] = await query(
        "SELECT settings,revision FROM project_outreach_projects WHERE project_key=$1 AND origin=$2",
        [c.report.key, c.origin],
      );
      if (
        !project ||
        Number(project.revision) !== body.settingsVersion ||
        validateOutreachSettings(project.settings, state.snapshot.headers)
      )
        throw changed();
      const result = {
        ...r,
        notes: r.notes.trim(),
        interactionType: project.settings.interactionType,
        projectTitle: c.report.title,
      };
      return mutate(
        c,
        `, existing AS (SELECT e.id FROM project_outreach_events e JOIN project_outreach_tasks t ON t.id=e.task_id
        WHERE e.id=$5::uuid AND e.task_id=$6::uuid AND e.actor_id=$3::bigint AND e.result=$7::jsonb
          AND t.project_key=$1 AND t.origin=$2 AND EXISTS(SELECT 1 FROM allowed)),
      saved AS (INSERT INTO project_outreach_events(id,task_id,actor_id,result)
        SELECT $5::uuid,t.id,$3::bigint,$7::jsonb FROM project_outreach_tasks t WHERE t.id=$6::uuid AND t.project_key=$1 AND t.origin=$2
          AND t.assignee_id=$3::bigint AND t.revision=$8::integer AND t.constituent_id=ANY($9::text[])
          AND EXISTS(SELECT 1 FROM allowed) AND NOT EXISTS(SELECT 1 FROM existing)
          AND EXISTS(SELECT 1 FROM project_outreach_projects p WHERE p.project_key=$1 AND p.origin=$2 AND p.revision=$14::integer)
          AND EXISTS(SELECT 1 FROM report_snapshots_cache s WHERE s.report_key=$10 AND s.payload->>'generatedAt'=$11)
        ON CONFLICT(id) DO NOTHING RETURNING id,task_id),
      updated AS (UPDATE project_outreach_tasks SET stage=$12,due_date=COALESCE($13::date,due_date),revision=revision+1,updated_at=NOW()
        WHERE id IN (SELECT task_id FROM saved)),
      audit AS (INSERT INTO project_outreach_audits(project_key,origin,task_id,actor_id,operation,details)
        SELECT $1,$2,task_id,$3::bigint,'outcome',jsonb_build_object('eventId',id) FROM saved)
      SELECT id FROM saved UNION ALL SELECT id FROM existing`,
        [
          r.eventId,
          r.taskId,
          JSON.stringify(result),
          r.version,
          state.identity.ids,
          state.keys.snapshot,
          body.snapshotAt,
          r.stage,
          r.nextDate || null,
          body.settingsVersion,
        ],
        { snapshotKey: state.keys.snapshot },
      );
    },
    async event(c, eventId) {
      if (!outreachUuid(eventId)) throw listError("Choose a saved outcome.");
      const [row] = await query(
        `SELECT e.*,t.constituent_id,t.project_key,t.origin,t.name,p.settings
        FROM project_outreach_events e JOIN project_outreach_tasks t ON t.id=e.task_id
        JOIN project_outreach_projects p ON p.project_key=t.project_key AND p.origin=t.origin
        WHERE e.id=$1 AND t.project_key=$2 AND t.origin=$3 AND e.actor_id=$4`,
        [eventId, c.report.key, c.origin, c.user.id],
      );
      if (!row)
        throw listError(
          "Only the person who recorded this outcome can submit or verify its NXT action.",
          403,
        );
      return row;
    },
    async claim(c, event, payload) {
      return mutate(
        c,
        `UPDATE project_outreach_events e SET state='processing',payload=$6::jsonb,updated_at=NOW()
        FROM project_outreach_tasks t WHERE e.id=$5::uuid AND e.task_id=t.id AND t.project_key=$1 AND t.origin=$2
        AND e.actor_id=$3::bigint AND e.state='draft' AND EXISTS(SELECT 1 FROM allowed)
        AND NOT EXISTS(SELECT 1 FROM project_outreach_events other WHERE other.task_id=t.id AND other.state IN ('processing','review')) RETURNING e.*`,
        [event.id, JSON.stringify(payload)],
      );
    },
    async checkpoint(eventId, receipt) {
      const rows = await query(
        `UPDATE project_outreach_events SET receipt_id=$2::bigint,action_id=COALESCE($3,action_id),updated_at=NOW()
        WHERE id=$1::uuid AND state='processing' RETURNING id`,
        [eventId, receipt.id, receipt.remote_id || null],
      );
      if (!rows.length) throw new Error("Outreach receipt was not saved");
    },
    async hold(eventId) {
      await query(
        "UPDATE project_outreach_events SET state='review',updated_at=NOW() WHERE id=$1::uuid AND state='processing'",
        [eventId],
      );
    },
    async unclaimUnsent(c, event) {
      // Only used when the create guard explicitly refused before calling NXT.
      // A matching durable receipt always prevents reopening this event.
      return mutate(
        c,
        `, saved AS (UPDATE project_outreach_events e SET state='draft',payload=NULL,updated_at=NOW()
        FROM project_outreach_tasks t WHERE e.id=$5::uuid AND e.task_id=t.id AND t.project_key=$1 AND t.origin=$2
          AND e.actor_id=$3::bigint AND e.state='processing' AND e.receipt_id IS NULL AND e.action_id IS NULL
          AND e.payload=$6::jsonb AND EXISTS(SELECT 1 FROM allowed)
          AND NOT EXISTS(SELECT 1 FROM nxt_create_receipts WHERE owner_user_id=$3::bigint AND kind='action' AND payload=$6::jsonb)
        RETURNING e.id,e.task_id), audit AS (INSERT INTO project_outreach_audits(project_key,origin,task_id,actor_id,operation,details)
          SELECT $1,$2,task_id,$3::bigint,'nxt_not_submitted',jsonb_build_object('eventId',id) FROM saved)
        SELECT id FROM saved`,
        [event.id, JSON.stringify(event.payload)],
      );
    },
    async confirm(c, event, actionId, receipt) {
      return mutate(
        c,
        `, eligible AS (SELECT e.id FROM project_outreach_events e JOIN project_outreach_tasks t ON t.id=e.task_id
        WHERE e.id=$5::uuid AND t.project_key=$1 AND t.origin=$2 AND e.actor_id=$3::bigint
          AND e.state IN ('processing','review') AND e.payload=$8::jsonb AND (e.action_id IS NULL OR e.action_id=$6)
          AND EXISTS(SELECT 1 FROM allowed) FOR UPDATE OF e),
        verified AS (UPDATE nxt_create_receipts SET state='verified',remote_id=$6,
        verified_by_user_id=$3::bigint,verified_at=NOW(),updated_at=NOW()
        WHERE id=$7::bigint AND owner_user_id=$3::bigint AND kind='action' AND payload=$8::jsonb
          AND (remote_id IS NULL OR remote_id=$6) AND EXISTS(SELECT 1 FROM eligible) RETURNING id),
        saved AS (UPDATE project_outreach_events e SET state='confirmed',action_id=$6,receipt_id=$7::bigint,updated_at=NOW()
          WHERE e.id IN (SELECT id FROM eligible) AND EXISTS(SELECT 1 FROM verified) RETURNING e.id,e.task_id),
        audit AS (INSERT INTO project_outreach_audits(project_key,origin,task_id,actor_id,operation,details)
          SELECT $1,$2,task_id,$3::bigint,'nxt_confirmed',jsonb_build_object('eventId',id,'actionId',$6::text) FROM saved)
        SELECT id FROM saved`,
        [event.id, actionId, receipt.id, JSON.stringify(event.payload)],
      );
    },
    async receipt(event) {
      if (!event.payload) return null;
      const [row] = await query(
        `SELECT * FROM nxt_create_receipts WHERE owner_user_id=$1 AND kind='action' AND payload=$2::jsonb
        AND ($3::bigint IS NULL OR id=$3::bigint) ORDER BY id DESC LIMIT 1`,
        [
          event.actor_id,
          JSON.stringify(event.payload),
          event.receipt_id || null,
        ],
      );
      return row || null;
    },
  };
}

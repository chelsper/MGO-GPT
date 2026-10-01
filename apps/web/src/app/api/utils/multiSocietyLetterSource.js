import { createHash, randomUUID } from "node:crypto";
import { advanceQueryList } from "./constituentQueryList";
import { getBlackbaudSavedQueryById } from "./blackbaud";
import { readSocietyConstituentQueryResult } from "./societyConstituentQueryResult";
import { getQueryJobMetadataRowCount } from "./savedQueryExecution";
import {
  constituentHouseholdsFromQuery,
  letterError,
  mergeSocietyLetterCohorts,
  verifyConstituentLetterIdColumns,
} from "@/utils/societyLetters";

export async function refreshMultipleSocietySources({
  state,
  signature,
  period,
  hierarchy,
  body,
  store,
  context,
}) {
  const sources = state.settings.societySources;
  if (
    !sources?.length ||
    sources.some(
      (s) =>
        s.queryPeriodStart !== period.start || s.queryPeriodEnd !== period.end,
    )
  )
    throw letterError(
      "Confirm every society query's qualification dates for this letter period before refreshing.",
    );
  if (["refresh", "restart"].includes(body.action)) {
    if (body.action === "restart" && body.confirm !== true)
      throw letterError("Confirm the query restart first.");
    if (
      body.action === "refresh" &&
      ["running", "starting"].includes(state.job?.status)
    )
      throw letterError(
        "A query refresh is already in progress. Resume it or explicitly restart the unfinished queries.",
        409,
      );
    state.job = {
      id: randomUUID(),
      status: "running",
      signature,
      period,
      ownerId: context.user.id,
      sourceIndex: 0,
      cohorts: [],
      queryState: null,
    };
    await store.save(state);
  } else if (
    !state.job ||
    state.job.id !== body.jobId ||
    state.job.signature !== signature ||
    state.job.period?.key !== period.key ||
    state.job.ownerId !== context.user.id ||
    state.job.status !== "running"
  ) {
    throw letterError(
      "The query context changed or submission is uncertain. Explicitly restart the refresh with your connected account.",
      409,
    );
  }

  const job = state.job;
  const previousSnapshot = state.snapshot;
  const source = sources[job.sourceIndex];
  if (!source)
    throw letterError(
      "The society query checkpoint is invalid. Restart the refresh.",
      409,
    );
  const society = hierarchy.find((d) => d.key === source.societyKey);
  if (!society)
    throw letterError(
      "A query's annual society is no longer active. Review source settings.",
      409,
    );
  const sourceSettings = {
    ...source,
    sourceMode: "constituents",
    querySocietyKey: source.societyKey,
  };
  const definitionSignature = async () => {
    const definition = await getBlackbaudSavedQueryById({
      userId: context.user.id,
      origin: context.origin,
      queryId: source.queryId,
    });
    verifyConstituentLetterIdColumns(definition, sourceSettings);
    return createHash("sha256")
      .update(
        JSON.stringify([
          definition.type_id,
          definition.select_fields,
          definition.filter_fields,
          definition.summary_fields,
          definition.gift_processing_options,
          definition.constituent_filters,
        ]),
      )
      .digest("hex");
  };
  try {
    if (!job.queryState) {
      job.queryState = { stage: "members", profileOffset: 0 };
      job.queryState.definitionSignature = await definitionSignature();
      // Persist the uncertain-submission barrier before creating an NXT job.
      // A process exit here requires an explicit restart, never a blind replay.
      job.status = "starting";
      await store.save(state);
    }
    const result = await advanceQueryList({
      job: job.queryState,
      user: context.user,
      origin: context.origin,
      readResult: (url, options, result) =>
        readSocietyConstituentQueryResult(
          url,
          options,
          sourceSettings,
          getQueryJobMetadataRowCount(result),
        ),
      source: {
        source: "query",
        queryId: source.queryId,
        leadFundraiser: { enabled: false },
      },
    });
    job.queryState = result.job;
    if (result.snapshot) {
      if (
        !result.job.definitionSignature ||
        result.job.definitionSignature !== (await definitionSignature())
      )
        throw letterError(
          "The saved NXT query changed during this refresh. Confirm its output fields and restart; prior results were retained.",
        );
      const rows = constituentHouseholdsFromQuery(
        result.snapshot,
        sourceSettings,
        hierarchy,
        period,
      );
      job.cohorts.push({
        societyKey: source.societyKey,
        queryId: source.queryId,
        generatedAt: result.snapshot.generatedAt,
        deduplication: result.snapshot.metadata?.deduplication || null,
        rows,
      });
      if (Buffer.byteLength(JSON.stringify(job.cohorts)) > 4 * 1024 * 1024)
        throw letterError(
          "The combined society preview exceeds 4 MB. Reduce query output; no partial preview was saved.",
          413,
        );
      const combined = mergeSocietyLetterCohorts(
        job.cohorts,
        hierarchy,
        period,
      );
      job.sourceIndex += 1;
      job.queryState = null;
      if (job.sourceIndex === sources.length) {
        const timestamps = job.cohorts.map((c) => c.generatedAt);
        if (
          timestamps.some(
            (value) => !value || !Number.isFinite(Date.parse(value)),
          )
        )
          throw letterError(
            "A society query's verification time is unavailable. Prior results were retained.",
          );
        const generatedAt = timestamps.sort(
          (a, b) => Date.parse(a) - Date.parse(b),
        )[0];
        state.snapshot = {
          rows: combined,
          signature,
          period,
          generatedAt,
          sources: job.cohorts.map(({ rows: cohortRows, ...entry }) => ({
            ...entry,
            householdCount: cohortRows.length,
          })),
        };
        state.job = {
          id: job.id,
          status: "complete",
          completedSources: sources.length,
          totalSources: sources.length,
          message: `${sources.length} society queries checked. ${combined.length} households in the combined preview.`,
        };
        await store.save(state);
        return;
      }
    }
    job.status = "running";
    job.message = `${job.sourceIndex} of ${sources.length} society queries checked. ${result.snapshot ? "Next query is ready to start." : `Checking ${society.name}.`}`;
    await store.save(state);
  } catch (error) {
    state.snapshot = previousSnapshot;
    state.job = {
      ...job,
      status: "needs_review",
      message: `${society.name}: ${error.status ? error.message : "The query could not finish. Prior results and letter history are unchanged. Check the connection and restart."}`,
    };
    await store.save(state);
  }
}

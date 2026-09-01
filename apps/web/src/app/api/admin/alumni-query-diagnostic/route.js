import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  createBlackbaudQueryJob,
  downloadBlackbaudQueryResultWithMetadata,
  getBlackbaudConfigIssues,
  getBlackbaudQueryJob,
} from "@/app/api/utils/blackbaud";
import {
  getSasUri,
  isTerminalQueryJobStatus,
  reconcileQueryResultCounts,
  summarizeQueryJobResponse,
  summarizeQueryResultFile,
} from "@/app/api/utils/queryExecutionDiagnostic";
import { isAdminRole } from "@/utils/workspaceRoles";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 120;

const DIAGNOSTIC_QUERY_ID = "30976";
const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 40;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Expires: "0",
  Pragma: "no-cache",
};

function createDiagnosticResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function waitForNextPoll() {
  return new Promise((resolve) => {
    setTimeout(resolve, POLL_INTERVAL_MS);
  });
}

function safeFailure(stage, error) {
  return {
    stage,
    httpStatus: Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
    topLevelFieldNames: Array.isArray(error?.topLevelFieldNames)
      ? error.topLevelFieldNames
      : [],
    message:
      "The Blackbaud diagnostic request did not complete. No report snapshot, cache, dashboard, or configuration was changed.",
  };
}

function createExecutionScope() {
  return {
    queryId: DIAGNOSTIC_QUERY_ID,
    reportSnapshotsRead: false,
    reportSnapshotsWritten: false,
    reportCachesRead: false,
    reportCachesWritten: false,
    dashboardUiChanged: false,
    reportConfigurationChanged: false,
  };
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth(request);
    if (!session?.user?.email) {
      return createDiagnosticResponse({ error: "Unauthorized" }, 401);
    }

    const { sessionUser } = await getWorkspaceUser(session, request);
    if (!sessionUser || !isAdminRole(sessionUser.role)) {
      return createDiagnosticResponse(
        { error: "Forbidden - administrators only" },
        403,
      );
    }

    const origin = new URL(request.url).origin;
    const configIssues = getBlackbaudConfigIssues(origin);
    if (configIssues.length > 0) {
      return createDiagnosticResponse(
        {
          queryId: DIAGNOSTIC_QUERY_ID,
          executionScope: createExecutionScope(),
          status: "blocked",
          failure: {
            stage: "configuration",
            message:
              "Blackbaud is not fully configured for this diagnostic. No saved query was executed.",
          },
        },
        400,
      );
    }

    let postExecution;
    let postRawPayload = null;
    try {
      const response = await createBlackbaudQueryJob({
        userId: sessionUser.id,
        authUserId: sessionUser.id,
        origin,
        queryId: DIAGNOSTIC_QUERY_ID,
        includeResponseMetadata: true,
      });
      postRawPayload = response?.payload || null;
      postExecution = summarizeQueryJobResponse(response);
    } catch (error) {
      return createDiagnosticResponse(
        {
          queryId: DIAGNOSTIC_QUERY_ID,
          executionScope: createExecutionScope(),
          status: "failed",
          postExecution: null,
          pollHistory: [],
          resultFile: null,
          reconciliation: reconcileQueryResultCounts({}),
          failure: safeFailure("create_job", error),
        },
        502,
      );
    }

    if (!postExecution.jobId) {
      return createDiagnosticResponse(
        {
          queryId: DIAGNOSTIC_QUERY_ID,
          executionScope: createExecutionScope(),
          status: "failed",
          postExecution,
          pollHistory: [],
          resultFile: null,
          reconciliation: reconcileQueryResultCounts({
            jobRowCount: postExecution.rowCount,
          }),
          failure: {
            stage: "create_job",
            httpStatus: postExecution.httpStatus,
            topLevelFieldNames: postExecution.topLevelFieldNames,
            message:
              "Blackbaud did not return a usable saved-query job identifier. No result URL was used.",
          },
        },
        502,
      );
    }

    const pollHistory = [];
    let latestJob = postExecution;
    let latestRawPayload = postRawPayload;
    // Some job implementations expose sas_uri in the POST response before it
    // appears on a subsequent status poll, so retain it without exposing it.
    let sasUri = getSasUri(postRawPayload);
    let terminalReached = false;

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
      try {
        const response = await getBlackbaudQueryJob({
          userId: sessionUser.id,
          authUserId: sessionUser.id,
          origin,
          jobId: postExecution.jobId,
          includeResponseMetadata: true,
        });
        latestRawPayload = response?.payload || null;
        latestJob = summarizeQueryJobResponse(response);
        sasUri = getSasUri(latestRawPayload) || sasUri;
        pollHistory.push({
          poll: attempt,
          ...latestJob,
        });

        if (isTerminalQueryJobStatus(latestJob.jobStatus)) {
          terminalReached = true;
          break;
        }
      } catch (error) {
        return createDiagnosticResponse(
          {
            queryId: DIAGNOSTIC_QUERY_ID,
            executionScope: createExecutionScope(),
            status: "failed",
            postExecution,
            pollHistory,
            resultFile: null,
            reconciliation: reconcileQueryResultCounts({
              jobRowCount: latestJob.rowCount,
            }),
            failure: safeFailure("poll_job", error),
          },
          502,
        );
      }

      if (attempt < MAX_POLL_ATTEMPTS) {
        await waitForNextPoll();
      }
    }

    let resultFile = {
      endpoint: "sas_uri",
      available: Boolean(sasUri),
      fetchAttempted: false,
    };
    if (sasUri) {
      try {
        const response = await downloadBlackbaudQueryResultWithMetadata(sasUri, {
          userId: sessionUser.id,
          authUserId: sessionUser.id,
          origin,
        });
        resultFile = {
          ...summarizeQueryResultFile(response),
          available: true,
          fetchAttempted: true,
        };
      } catch (error) {
        resultFile = {
          endpoint: "sas_uri",
          available: true,
          fetchAttempted: true,
          fetchFailure: safeFailure("download_sas_uri", error),
        };
      }
    }

    const reconciliation = reconcileQueryResultCounts({
      jobRowCount: latestJob.rowCount,
      parsedDataRowCount: resultFile?.parsedDataRowCount,
    });

    return createDiagnosticResponse({
      queryId: DIAGNOSTIC_QUERY_ID,
      executionScope: createExecutionScope(),
      status: terminalReached ? "complete" : "poll_timeout",
      postExecution,
      pollHistory,
      terminalState: {
        terminalReached,
        jobStatus: latestJob.jobStatus,
        rowCount: latestJob.rowCount,
      },
      resultFile,
      reconciliation,
    });
  } catch (error) {
    console.error("Alumni query diagnostic error:", error?.message || "unknown error");
    return createDiagnosticResponse(
      {
        queryId: DIAGNOSTIC_QUERY_ID,
        executionScope: createExecutionScope(),
        status: "failed",
        failure: safeFailure("setup", error),
      },
      500,
    );
  }
}

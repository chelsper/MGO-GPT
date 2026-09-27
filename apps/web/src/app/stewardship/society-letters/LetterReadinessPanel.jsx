"use client";
import { useEffect, useState } from "react";
import AppealPicker, {
  AppealChoicesLoader,
  useAppealChoices,
} from "./AppealPicker";

const button =
  "min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50";
const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal";
export const readinessLabels = {
  unchecked: "Not checked",
  ready_for_preview: "Ready for preview",
  needs_review: "Needs review",
  already_acknowledged: "Already acknowledged",
};

export function ReadinessSettings({ data, busy, act }) {
  const choices = useAppealChoices();
  const [appeals, setAppeals] = useState(() =>
    Object.fromEntries(
      Object.entries(data.readiness.policy?.appeals || {}).map(
        ([key, appeal]) => [
          key,
          {
            ...appeal,
            identifierType: appeal.lookupId ? "lookup" : "system",
          },
        ],
      ),
    ),
  );
  const [confirm, setConfirm] = useState(false);
  const tiers = data.definitions.filter((d) =>
    data.settings.societyKeys.includes(d.key),
  );
  const complete = tiers.every((tier) => {
    const value = appeals[tier.key];
    return (
      value?.description?.trim() &&
      (value.identifierType === "system"
        ? /^[1-9][0-9]{0,17}$/.test(value.id || "")
        : value.lookupId?.trim())
    );
  });
  function edit(key, field, value) {
    setAppeals((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
    setConfirm(false);
  }
  return (
    <details className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold">
        Letter appeal settings for this period
      </summary>
      <p className="mt-2 text-sm text-gray-600">
        Use each society&apos;s dedicated {data.period.start} to{" "}
        {data.period.end} letter-sent appeal. Search by name or code and select
        the result to fill its exact description. Saving settings re-verifies
        the appeal; it does not assign appeals or send letters.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || choices.loading || !confirm || !complete || !tiers.length)
            return;
          const requested = Object.fromEntries(
            tiers.map((tier) => {
              const appeal = appeals[tier.key] || {};
              return [
                tier.key,
                {
                  [appeal.identifierType === "system" ? "id" : "lookupId"]:
                    appeal.identifierType === "system"
                      ? appeal.id || ""
                      : appeal.lookupId || "",
                  description: appeal.description || "",
                },
              ];
            }),
          );
          if (
            await act({
              action: "readiness_settings",
              appeals: requested,
              confirm,
            })
          )
            setConfirm(false);
        }}
      >
        <AppealChoicesLoader choices={choices} disabled={busy} />
        {tiers.map((tier) => {
          const appeal = appeals[tier.key] || {};
          const system = appeal.identifierType === "system";
          const saved = data.readiness.policy?.appeals?.[tier.key];
          const unchanged =
            saved &&
            appeal.description === saved.description &&
            (system
              ? appeal.id === saved.id
              : appeal.lookupId === saved.lookupId);
          return (
            <fieldset
              key={tier.key}
              disabled={busy || choices.loading}
              className="space-y-4 rounded-xl border border-gray-200 p-4"
            >
              <legend className="mb-2 font-semibold">{tier.name}</legend>
              <AppealPicker
                tier={tier}
                period={data.period}
                purpose="letter-sent"
                value={appeal}
                choices={choices}
                disabled={busy || choices.loading}
                onSelect={(selected) => {
                  setAppeals((current) => ({
                    ...current,
                    [tier.key]: { ...selected, identifierType: "lookup" },
                  }));
                  setConfirm(false);
                }}
              />
              <details>
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800">
                  Enter or edit appeal manually
                </summary>
                <div className="grid gap-4 md:grid-cols-[minmax(16rem,1fr)_2fr]">
                  <div className="min-w-0 space-y-3">
                    <label className="block text-sm font-semibold">
                      Find appeal by
                      <select
                        className={input}
                        aria-label={`${tier.name} find appeal by`}
                        value={system ? "system" : "lookup"}
                        onChange={(e) =>
                          edit(tier.key, "identifierType", e.target.value)
                        }
                      >
                        <option value="lookup">Appeal code (Lookup ID)</option>
                        <option value="system">
                          System record ID (advanced)
                        </option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold">
                      {system
                        ? "Appeal system record ID"
                        : "Appeal code (Lookup ID)"}
                      <input
                        className={input}
                        aria-label={`${tier.name} ${system ? "appeal system record ID" : "appeal code"}`}
                        value={(system ? appeal.id : appeal.lookupId) || ""}
                        required
                        pattern={system ? "[1-9][0-9]{0,17}" : undefined}
                        inputMode={system ? "numeric" : "text"}
                        title={
                          system
                            ? "Enter the numeric NXT system record ID, not the appeal code."
                            : undefined
                        }
                        maxLength={system ? 18 : 100}
                        onChange={(e) =>
                          edit(
                            tier.key,
                            system ? "id" : "lookupId",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    <p className="text-xs text-gray-600">
                      {system
                        ? "The numeric ID from the NXT appeal record URL, not its user-defined code."
                        : "Use the Appeal ID shown in NXT, such as CY26PRESSOC-MGO."}
                    </p>
                  </div>
                  <label className="text-sm font-semibold">
                    Exact appeal description
                    <input
                      className={input}
                      aria-label={`${tier.name} appeal description`}
                      value={appeal.description || ""}
                      required
                      maxLength={300}
                      onChange={(e) =>
                        edit(tier.key, "description", e.target.value)
                      }
                    />
                  </label>
                </div>
              </details>
              {unchanged && (
                <p className="text-sm text-emerald-800 md:col-span-2">
                  Saved appeal: {saved.lookupId || "appeal"} (system record ID{" "}
                  {saved.id}).
                </p>
              )}
            </fieldset>
          );
        })}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            disabled={busy || choices.loading}
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          I verified these appeals are used only for these society letters and
          this recognition period, and my connected NXT account can read all
          constituent communication restrictions. A readiness check is not
          approval to send.
        </label>
        <button
          className={button}
          disabled={
            busy || choices.loading || !confirm || !complete || !tiers.length
          }
        >
          Verify and save appeal settings
        </button>
      </form>
    </details>
  );
}

export default function LetterReadinessPanel({
  data,
  channel,
  rows,
  busy,
  blocked,
  act,
  onOpenSettings,
}) {
  const [running, setRunning] = useState(false);
  const [, refreshClock] = useState(0);
  const job = data.readiness?.job;
  useEffect(() => {
    const remaining = Date.parse(job?.retryAt) - Date.now();
    if (!(remaining > 0)) return;
    const timer = setTimeout(
      () => refreshClock((value) => value + 1),
      Math.min(remaining + 50, 60000),
    );
    return () => clearTimeout(timer);
  });
  useEffect(() => {
    if (!running || busy || blocked) return;
    if (job?.status !== "running") {
      setRunning(false);
      return;
    }
    const timer = setTimeout(async () => {
      if (!(await act({ action: "resume_readiness", jobId: job.id })))
        setRunning(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [running, busy, blocked, job, act]);
  if (!data.readiness) return null;
  const active = job && ["running", "paused"].includes(job.status);
  const waiting = job?.retryAt && Date.parse(job.retryAt) > Date.now();
  const ids = rows
    .filter(
      (row) =>
        !["ready_for_preview", "already_acknowledged"].includes(
          row.readiness?.[channel]?.status,
        ),
    )
    .map((row) => row.householdId);
  const counts = rows.reduce((result, row) => {
    const status = row.readiness?.[channel]?.status || "unchecked";
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  return (
    <section
      aria-labelledby="letter-readiness-title"
      className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="letter-readiness-title"
            tabIndex={-1}
            className="text-lg font-bold"
          >
            Check letter readiness
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Check current NXT records for{" "}
            {channel === "post" ? "postal letters" : "email letters"}, one
            household at a time. Nothing is sent, marked acknowledged, or
            written to NXT. Leaving this page pauses the check.
          </p>
        </div>
        {!active && (
          <button
            className={button}
            disabled={busy || blocked || !!data.readiness.issue || !ids.length}
            onClick={async () => {
              const result = await act({
                action: "check_readiness",
                channel,
                householdIds: ids,
              });
              setRunning(result?.readiness?.job?.status === "running");
            }}
          >
            Check readiness ({ids.length})
          </button>
        )}
      </div>
      <div
        className="mt-4 flex flex-wrap gap-3 text-sm"
        aria-label="Readiness totals"
      >
        {Object.entries(readinessLabels).map(([key, label]) => (
          <span
            key={key}
            className={`rounded-full px-3 py-1 ${key === "ready_for_preview" ? "bg-emerald-50 text-emerald-900" : "bg-gray-100 text-gray-700"}`}
          >
            {label}: {counts[key] || 0}
          </span>
        ))}
      </div>
      {data.readiness.issue && (
        <p className="mt-3 text-sm text-gray-700">{data.readiness.issue}</p>
      )}
      {job && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p role="status" className="text-sm">
            {job.checked} of {job.total} households checked (
            {job.channel === "post" ? "postal" : "email"}). {job.message}
          </p>
          {job.retryAt && (
            <p className="mt-1 text-sm text-gray-600">
              Resume after {new Date(job.retryAt).toLocaleString()}.
            </p>
          )}
          {active && (
            <div className="mt-3 flex flex-wrap gap-2">
              {running ? (
                <button className={button} onClick={() => setRunning(false)}>
                  Pause check
                </button>
              ) : (
                <button
                  className={button}
                  disabled={
                    busy || blocked || waiting || !!data.readiness.issue
                  }
                  onClick={async () => {
                    const result = await act({
                      action: "resume_readiness",
                      jobId: job.id,
                    });
                    setRunning(result?.readiness?.job?.status === "running");
                  }}
                >
                  Resume check
                </button>
              )}
              <button
                className={button}
                disabled={busy || blocked}
                onClick={async () => {
                  setRunning(false);
                  await act({ action: "cancel_readiness", jobId: job.id });
                }}
              >
                Stop check
              </button>
            </div>
          )}
        </div>
      )}
      {onOpenSettings ? (
        <button className={`${button} mt-4`} onClick={onOpenSettings}>
          Open appeal settings
        </button>
      ) : (
        <ReadinessSettings
          key={`${data.period.key}/${data.readiness.policy?.savedAt || "new"}`}
          data={data}
          busy={busy || blocked || !!active}
          act={act}
        />
      )}
      <p className="mt-3 text-xs text-gray-500">
        Checks expire after 24 hours or when source, recipient, template, or
        period details change. Active solicit codes and consent instructions
        require staff review. Checks alone do not send letters or update
        appeals. Final postal letters require a separate preview and
        confirmation for every household member. Exclusion appeals are
        configured separately.
      </p>
    </section>
  );
}

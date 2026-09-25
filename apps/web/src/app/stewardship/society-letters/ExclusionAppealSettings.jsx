import { useState } from "react";

const button =
  "min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50";
const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal";

export default function ExclusionAppealSettings({ data, busy, act }) {
  const [appeals, setAppeals] = useState(
    data.exclusionAppeals?.policy?.appeals || {},
  );
  const [confirm, setConfirm] = useState(false);
  const tiers = data.definitions.filter((d) =>
    data.settings?.societyKeys.includes(d.key),
  );
  if (
    !data.period ||
    !tiers.length ||
    data.settings?.sourceMode !== "society_queries"
  )
    return null;
  function edit(key, field, value) {
    setAppeals((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
    setConfirm(false);
  }
  return (
    <details className="rounded-2xl border border-gray-200 bg-white p-5">
      <summary className="cursor-pointer font-semibold">
        NXT exclusion appeal settings
      </summary>
      <p className="mt-2 text-sm text-gray-600">
        For {data.period.start} through {data.period.end}. Excluding a household
        will record its highest qualifying society&apos;s exclusion appeal on
        each member, with your date and reason. This is not a letter-sent
        appeal. Existing exclusions are not backfilled.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await act({ action: "exclusion_appeal_settings", appeals, confirm })
          )
            setConfirm(false);
        }}
      >
        {tiers.map((tier) => (
          <fieldset key={tier.key} className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 font-semibold">{tier.name}</legend>
            <label className="text-sm font-semibold">
              Exclusion appeal code (Lookup ID)
              <input
                className={input}
                aria-label={`${tier.name} exclusion appeal code`}
                required
                maxLength={100}
                value={appeals[tier.key]?.lookupId || ""}
                onChange={(e) => edit(tier.key, "lookupId", e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Exact exclusion appeal description
              <input
                className={input}
                aria-label={`${tier.name} exclusion appeal description`}
                required
                maxLength={300}
                value={appeals[tier.key]?.description || ""}
                onChange={(e) => edit(tier.key, "description", e.target.value)}
              />
            </label>
          </fieldset>
        ))}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          These appeals are dedicated to exclusions for this recognition period,
          not sent letters. I want future confirmed exclusions recorded in NXT
          for every household member.
        </label>
        <button className={button} disabled={busy || !confirm}>
          Verify and save exclusion appeals
        </button>
        {data.exclusionAppeals?.current && (
          <p role="status" className="text-sm text-emerald-800">
            Exclusion appeal settings verified for this period.
          </p>
        )}
      </form>
    </details>
  );
}

export function ExclusionSyncStatus({ item, busy, act }) {
  const [confirm, setConfirm] = useState(false);
  const nxt = item.nxt;
  if (!nxt)
    return (
      <p className="mt-2 text-sm text-gray-500">
        App-only exclusion. No NXT appeal was applied.
      </p>
    );
  const uncertain = nxt.members.some((m) => m.status === "uncertain");
  const complete = nxt.status === "complete";
  const count = nxt.members.filter((m) =>
    ["verified", "existing"].includes(m.status),
  ).length;
  return (
    <div className="mt-3 max-w-2xl space-y-2 text-sm">
      <p className="font-semibold">
        {nxt.societyName}: {nxt.appeal.lookupId}
      </p>
      <p>
        Appeal date: {nxt.date}. {count} of {nxt.members.length} member
        assignments confirmed.
      </p>
      <p
        role="status"
        className={complete ? "text-emerald-800" : "text-amber-900"}
      >
        {nxt.message}
      </p>
      {!complete && (
        <>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              act({ action: "verify_exclusion_appeal", exclusionId: item.id })
            }
          >
            Verify NXT status (read only)
          </button>
          {!uncertain && (
            <>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                Apply this appeal, date, and reason only to members not yet
                submitted. Existing assignments will not be changed.
              </label>
              <button
                className={button}
                disabled={busy || !confirm}
                onClick={async () => {
                  await act({
                    action: "sync_exclusion_appeal",
                    exclusionId: item.id,
                    confirmNxt: true,
                  });
                  setConfirm(false);
                }}
              >
                Continue remaining NXT updates
              </button>
            </>
          )}
        </>
      )}
      <p className="text-gray-500">
        To restore, remove this exclusion appeal from both records (or the
        single recipient) in NXT first. The app verifies removal and never
        deletes NXT history.
      </p>
    </div>
  );
}

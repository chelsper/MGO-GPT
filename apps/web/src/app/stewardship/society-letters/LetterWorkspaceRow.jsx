import { useState } from "react";
import { ATTENTION_FILTERS } from "./letterWorkspaceView";
import { readinessLabels } from "./LetterReadinessPanel";

const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
const issueActions = {
  changed: "Review changed choices",
  address: "Add mailing address",
  email: "Choose email",
  greeting: "Review greeting",
  contacts: "Choose letter contact",
};

export default function LetterWorkspaceRow({
  row,
  view,
  channel,
  definitions,
  checked,
  selectionDisabled,
  reviewDisabled,
  excludeDisabled,
  onSelect,
  onReview,
  onReadiness,
  onExclude,
  sourceIssue,
}) {
  const [expanded, setExpanded] = useState(false);
  const readiness = row.readiness?.[channel];
  const issueLabels = ATTENTION_FILTERS.filter(([key]) =>
    view.attention.includes(key),
  );
  const detailsId = `letter-recipient-details-${row.householdId}`;
  return (
    <>
      <tr className="border-t border-gray-100 align-top">
        <td className="p-3 pt-4">
          <input
            aria-label={`Select ${row.name}`}
            type="checkbox"
            checked={checked}
            disabled={selectionDisabled}
            onChange={(event) => onSelect(event.target.checked)}
          />
        </td>
        <td className="p-3">
          <p className="font-semibold text-gray-900">{row.name}</p>
          <p className="mt-1 text-xs text-gray-600">{row.societyName}</p>
          <button
            type="button"
            className="mt-1 min-h-11 text-xs font-semibold text-emerald-800 underline underline-offset-4"
            aria-label={`${expanded ? "Hide" : "Show"} details for ${row.name}`}
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
        </td>
        <td className="p-3">
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${view.reviewed ? "bg-emerald-50 text-emerald-900" : "bg-gray-100 text-gray-700"}`}
          >
            {view.reviewed
              ? "Reviewed"
              : view.needsReview
                ? "Needs review"
                : "Review not recorded"}
          </span>
          {view.reviewed && (
            <p className="mt-1 text-xs text-gray-600">
              Recipient choices saved
            </p>
          )}
          {issueLabels.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {issueLabels.map(([key, label]) => (
                <li key={key}>
                  {issueActions[key] &&
                  row.recipientCandidates &&
                  !reviewDisabled ? (
                    <button
                      type="button"
                      className="min-h-11 text-left font-semibold text-emerald-800 underline underline-offset-4"
                      onClick={() => onReview(key)}
                      aria-label={`${issueActions[key]} for ${row.name}`}
                    >
                      {issueActions[key]}
                    </button>
                  ) : key === "readiness" && onReadiness ? (
                    <button
                      type="button"
                      className="min-h-11 text-left font-semibold text-emerald-800 underline underline-offset-4"
                      onClick={onReadiness}
                    >
                      View delivery checks
                    </button>
                  ) : (
                    label
                  )}
                </li>
              ))}
            </ul>
          )}
        </td>
        <td className="p-3">
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${readiness?.status === "needs_review" ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-700"}`}
          >
            {readiness
              ? readinessLabels[readiness.status] || "Not checked"
              : row.issues?.[channel]
                ? "Not ready for delivery"
                : "Not checked"}
          </span>
          {readiness?.reasons?.map((reason) => (
            <p key={reason} className="mt-1 max-w-sm text-xs text-gray-600">
              {reason}
            </p>
          ))}
          {!readiness &&
            row.issues?.[channel] &&
            row.issues[channel] !== sourceIssue && (
              <p className="mt-1 max-w-sm text-xs text-gray-600">
                {row.issues[channel]}
              </p>
            )}
        </td>
        <td className="p-3">
          {row.recipientCandidates && (
            <button
              className={button}
              disabled={reviewDisabled}
              aria-label={`Review letter recipient for ${row.name}`}
              onClick={() => onReview()}
            >
              {view.reviewed ? "Edit recipient" : "Review recipient"}
            </button>
          )}
          <button
            className="mt-1 block min-h-11 text-xs font-semibold text-gray-600 underline underline-offset-4 disabled:opacity-50"
            disabled={excludeDisabled}
            onClick={onExclude}
            aria-label={`Exclude ${row.name} for this period`}
          >
            Exclude for this period
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-gray-100 bg-gray-50/60">
          <td colSpan={5} className="p-4">
            <section
              id={detailsId}
              aria-label={`Details for ${row.name}`}
              className="grid gap-5 md:grid-cols-2"
            >
              <div className="space-y-2 text-xs text-gray-600">
                <h3 className="text-sm font-semibold text-gray-900">
                  Household &amp; society
                </h3>
                {!!row.members?.length && (
                  <p>Member system IDs: {row.members.join(", ")}</p>
                )}
                {!!row.membersOutsideQuery?.length && (
                  <p>
                    Spouse outside query: {row.membersOutsideQuery.join(", ")}.
                    Membership and contact restrictions still need verification.
                  </p>
                )}
                <p>{row.reason}</p>
                {row.sourceQueries && (
                  <>
                    <p>
                      Highest match in the configured queries. Not yet cleared
                      for delivery.
                    </p>
                    <p>
                      Also matched:{" "}
                      {(row.qualifiedKeys || [])
                        .filter((key) => key !== row.societyKey)
                        .map(
                          (key) =>
                            definitions.find((d) => d.key === key)?.name || key,
                        )
                        .join(", ") || "No lower society query"}
                    </p>
                  </>
                )}
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <h3 className="font-semibold text-gray-900">
                  Letter recipient details
                </h3>
                {view.reviewed ? (
                  <>
                    <p>{row.addressee}</p>
                    <p className="whitespace-pre-line">
                      {row.address || "No mailing address selected"}
                    </p>
                    <p>Salutation: {row.salutation}</p>
                    {channel === "email" && (
                      <p>{row.email || "No email selected"}</p>
                    )}
                    <p className="text-xs">
                      Saved for this period. No letter has been sent.
                    </p>
                  </>
                ) : !row.recipientCandidates ? (
                  <p className="whitespace-pre-line">
                    {channel === "email" ? row.email : row.address}
                  </p>
                ) : (
                  <p>
                    Review the returned options and save your recipient choices.
                  </p>
                )}
                {row.recipientCandidates && (
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-emerald-800">
                      Review address and salutation options
                    </summary>
                    <p className="mt-2 text-xs">
                      Returned query details. A primary addressee may address
                      only one spouse; use recipient review to save joint
                      wording.
                    </p>
                    {row.recipientCandidates.map((candidate) => (
                      <div
                        key={candidate.constituentId}
                        className="mt-3 space-y-1 rounded-lg border border-gray-200 bg-white p-3"
                      >
                        <p className="font-semibold">
                          {candidate.addressee || "No addressee returned"}
                        </p>
                        <p>
                          Salutation: {candidate.salutation || "Not returned"}
                        </p>
                        <p className="whitespace-pre-line">
                          {candidate.address || "No address returned"}
                        </p>
                        {candidate.emailCandidates?.length > 1 ? (
                          <>
                            <p>
                              Multiple email values: choose during recipient
                              review
                            </p>
                            <ul className="list-inside list-disc">
                              {candidate.emailCandidates.map((email) => (
                                <li key={email}>{email}</li>
                              ))}
                            </ul>
                            <p className="text-xs">
                              No email was selected automatically. Mailing
                              details are retained separately.
                            </p>
                          </>
                        ) : (
                          <p>{candidate.email}</p>
                        )}
                        <p className="text-xs">
                          From constituent {candidate.constituentId}
                        </p>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            </section>
          </td>
        </tr>
      )}
    </>
  );
}

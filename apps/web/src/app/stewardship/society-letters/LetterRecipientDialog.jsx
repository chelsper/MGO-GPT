import { useEffect, useRef, useState } from "react";
import { letterNameMergeData } from "@/utils/societyLetters";
import SavedLetterPreview from "./SavedLetterPreview";

const input =
  "mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 font-normal";
const blank = {
  recipientConstituentId: "",
  addressConstituentId: "",
  addressee: "",
  salutation: "",
  address: "",
  email: "",
};

export default function LetterRecipientDialog({
  recipient,
  busy,
  error,
  onClose,
  onSave,
  template,
  navigation,
  unavailable = false,
}) {
  const dialog = useRef(null);
  const [initialValues] = useState(recipient.recipientReview?.values || blank);
  const [reviewToken] = useState(recipient.recipientReview?.token);
  const [values, setValues] = useState(
    recipient.recipientReview?.values || blank,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [draft, setDraft] = useState(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  const disabled = busy || unavailable;
  function leave(action) {
    if (busy) return;
    if (dirty) setPendingNavigation(() => action);
    else action();
  }
  const candidates = recipient.recipientCandidates || [];
  const candidate = candidates.find(
    (item) => item.constituentId === values.recipientConstituentId,
  );
  const emails = [
    ...new Set(
      [candidate?.email, ...(candidate?.emailCandidates || [])].filter(Boolean),
    ),
  ];
  const mergeNames = letterNameMergeData({ ...recipient, ...values });
  const labelFor = (item) => {
    const name = recipient.memberNames?.find(
      (member) => member.constituentId === item.constituentId,
    )?.name;
    return `${name || item.addressee || "Constituent"} (ID ${item.constituentId})`;
  };
  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setConfirmed(false);
  }
  function chooseRecipient(id) {
    const selected = candidates.find((item) => item.constituentId === id);
    setValues(
      selected
        ? {
            recipientConstituentId: id,
            addressConstituentId: id,
            addressee: selected.addressee || "",
            salutation: selected.salutation || "",
            address: selected.address || "",
            email: "",
          }
        : blank,
    );
    setConfirmed(false);
  }
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <>
      <dialog
        ref={dialog}
        aria-labelledby="recipient-letter-title"
        onCancel={(event) => {
          event.preventDefault();
          leave(onClose);
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl backdrop:bg-gray-900/40"
      >
        <h2 id="recipient-letter-title" className="text-xl font-bold">
          {navigation ? "Review recipients" : "Letter recipient"}
        </h2>
        {navigation && (
          <div className="my-4 rounded-xl bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900" role="status">
              Recipient {navigation.index + 1} of {navigation.items.length} ·{" "}
              {navigation.savedCount} saved this session
            </p>
            <label className="mt-2 block text-sm font-semibold">
              Go to recipient
              <select
                className={input}
                value={navigation.index}
                disabled={busy}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  leave(() => navigation.onNavigate(index));
                }}
              >
                {navigation.items.map((item, index) => (
                  <option key={item.householdId} value={index}>
                    {index + 1}. {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <p className="mt-1 font-semibold">{recipient.name}</p>
        <p className="text-sm text-emerald-800">{recipient.societyName}</p>
        <p className="mt-2 text-sm text-gray-600">
          Save the address and wording for this period. Nothing is created or
          sent, and no NXT records change. A couple receives one letter; an
          individual without a spouse receives their own.
        </p>
        {unavailable && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
          >
            This recipient is no longer available for editing. Skip this
            recipient or close the review and reload the holding list.
          </p>
        )}
        {recipient.recipientReview?.status === "needs_review" && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Membership, source settings, or recipient details changed since the
            last review. Choose again from the current saved query details.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed && candidate && !disabled)
              onSave({ ...values, reviewToken, confirm: true });
          }}
        >
          <fieldset disabled={disabled} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold">
              Recipient record
              <select
                autoFocus
                required
                className={input}
                value={values.recipientConstituentId}
                onChange={(event) => chooseRecipient(event.target.value)}
              >
                <option value="">Choose a returned constituent</option>
                {candidates.map((item) => (
                  <option key={item.constituentId} value={item.constituentId}>
                    {labelFor(item)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-gray-500">
              This selects whose first and last names are used by recipient
              merge fields. Choosing another record resets the wording and
              address below. A spouse without a returned record cannot be
              selected yet.
            </p>
            {candidate && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold">
                    Addressee
                    <input
                      required
                      maxLength={300}
                      className={input}
                      value={values.addressee}
                      onChange={(event) =>
                        change("addressee", event.target.value)
                      }
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Salutation
                    <input
                      required
                      maxLength={300}
                      className={input}
                      value={values.salutation}
                      onChange={(event) =>
                        change("salutation", event.target.value)
                      }
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  For a joint letter, review both names in the addressee and
                  greeting. Edit the wording here without changing NXT. Include
                  only what your template expects in its salutation field.
                </p>
                <label className="block text-sm font-semibold">
                  Use mailing address from
                  <select
                    required
                    className={input}
                    value={values.addressConstituentId}
                    onChange={(event) => {
                      const source = candidates.find(
                        (item) => item.constituentId === event.target.value,
                      );
                      setValues((current) => ({
                        ...current,
                        addressConstituentId: source.constituentId,
                        address: source.address || "",
                      }));
                      setConfirmed(false);
                    }}
                  >
                    {candidates.map((item) => (
                      <option
                        key={item.constituentId}
                        value={item.constituentId}
                      >
                        {labelFor(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Mailing address
                  <textarea
                    rows={4}
                    maxLength={2000}
                    className={input}
                    value={values.address}
                    onChange={(event) => change("address", event.target.value)}
                  />
                </label>
                <p className="text-xs text-gray-500">
                  Preferred street lines, city, state, and ZIP are combined
                  here. You can correct this letter's address or leave it blank
                  for later; a postal letter will still need a verified address.
                </p>
                <label className="block text-sm font-semibold">
                  Email (optional)
                  <select
                    className={input}
                    value={values.email}
                    onChange={(event) => change("email", event.target.value)}
                  >
                    <option value="">No email selected</option>
                    {emails.map((email) => (
                      <option key={email} value={email}>
                        {email}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-gray-500">
                  Only this recipient's returned addresses are available.
                  Selecting one does not confirm email permission.
                </p>
                <details className="rounded-lg border border-gray-200 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">
                    Name merge fields for this recipient
                  </summary>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    <dt>Recipient first name</dt>
                    <dd>{mergeNames.first_name || "Not available"}</dd>
                    <dt>Recipient last name</dt>
                    <dd>{mergeNames.last_name || "Not available"}</dd>
                    <dt>Spouse first name</dt>
                    <dd>{mergeNames.spouse_first_name || "Not available"}</dd>
                    <dt>Household first names</dt>
                    <dd>{mergeNames.first_names || "Not available"}</dd>
                  </dl>
                  <p className="mt-2 text-gray-500">
                    Each letter template keeps its own merge-field settings.
                  </p>
                </details>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <button
                    type="button"
                    disabled={
                      !template?.version ||
                      !values.addressee.trim() ||
                      !values.salutation.trim()
                    }
                    onClick={() =>
                      setDraft({
                        name: recipient.name,
                        request: {
                          action: "preview_recipient_document",
                          householdId: recipient.householdId,
                          reviewToken,
                          templateVersion: template.version,
                          ...values,
                        },
                      })
                    }
                    className="min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 font-semibold text-emerald-800 disabled:opacity-50"
                  >
                    Preview personalized letter
                  </button>
                  <p className="mt-2 text-xs text-gray-600">
                    {template?.version
                      ? "Uses these recipient edits and the saved Word template. Previewing does not save or send anything. Shared letter text and merge-field settings stay unchanged."
                      : "Save a Word template for this society in Letter templates to preview personalized letters."}
                  </p>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    required
                    type="checkbox"
                    className="mt-1"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  I reviewed the recipient and letter wording. Eligibility,
                  communication restrictions, and prior letters still need to be
                  checked before delivery.
                </label>
              </>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-800">
              {error}
            </p>
          )}
          {pendingNavigation && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <p className="font-semibold">You have unsaved recipient edits.</p>
              <p className="mt-1 text-sm">
                Keep editing to save them, or discard them before moving on.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  autoFocus
                  disabled={busy}
                  onClick={() => setPendingNavigation(null)}
                  className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const action = pendingNavigation;
                    setPendingNavigation(null);
                    action();
                  }}
                  className="min-h-11 rounded-lg border border-amber-400 px-4 py-2 font-semibold"
                >
                  Discard edits and continue
                </button>
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => leave(onClose)}
              className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold"
            >
              {navigation ? "Close review" : "Cancel"}
            </button>
            {navigation && (
              <>
                <button
                  type="button"
                  disabled={busy || navigation.index === 0}
                  onClick={() =>
                    leave(() => navigation.onNavigate(navigation.index - 1))
                  }
                  className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => leave(navigation.onSkip)}
                  className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold"
                >
                  {navigation.index === navigation.items.length - 1
                    ? "Finish without saving"
                    : "Skip for now"}
                </button>
              </>
            )}
            <button
              type="submit"
              disabled={
                disabled || !candidate || !confirmed || !!pendingNavigation
              }
              className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? "Saving choices..."
                : navigation
                  ? navigation.index === navigation.items.length - 1
                    ? "Save & finish"
                    : "Save & next"
                  : "Save recipient choices"}
            </button>
          </div>
        </form>
      </dialog>
      {draft && (
        <SavedLetterPreview
          template={template}
          draft={draft}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}

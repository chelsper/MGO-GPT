import { useEffect, useRef, useState } from "react";
import {
  letterNameMergeData,
  letterAddressMergeData,
  LETTER_ADDRESS_TAGS,
  LETTER_FIELD_LABELS,
  formatLetterAddress,
} from "@/utils/societyLetters";
import RecipientLetterPreview from "./RecipientLetterPreview";
import {
  organizationLetterContacts,
  isOrganizationLetterCandidate,
  contactChoiceKey,
  contactDisplayName,
} from "@/utils/societyLetterContacts";

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
  channel = "post",
  initialFocus = null,
}) {
  const dialog = useRef(null);
  const fields = useRef({});
  const [pendingFocus, setPendingFocus] = useState(initialFocus);
  const [initialValues] = useState(recipient.recipientReview?.values || blank);
  const [reviewToken] = useState(recipient.recipientReview?.token);
  const [values, setValues] = useState(
    recipient.recipientReview?.values || blank,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
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
  const contacts = organizationLetterContacts(candidate);
  const organization = isOrganizationLetterCandidate(candidate);
  const emails = [
    ...new Set(
      [candidate?.email, ...(candidate?.emailCandidates || [])].filter(Boolean),
    ),
  ];
  const mergeNames = letterNameMergeData({ ...recipient, ...values });
  const mergeAddress = letterAddressMergeData({ ...recipient, ...values });
  function focusField(target) {
    const field =
      !candidate || target === "changed"
        ? "recipient"
        : target === "greeting"
          ? !values.addressee?.trim()
            ? "addressee"
            : "salutation"
          : target === "contacts" && !organization
            ? "addressee"
            : target;
    const element = fields.current[field] || fields.current.recipient;
    element?.focus();
    element?.scrollIntoView?.({ block: "center" });
  }
  const missing = candidate
    ? [
        ...(!values.addressee?.trim() || !values.salutation?.trim()
          ? [["greeting", "Addressee or greeting missing", "Review greeting"]]
          : []),
        ...(channel === "post" && !values.address?.trim()
          ? [["address", "Mailing address missing", "Add mailing address"]]
          : []),
        ...(channel === "email" && !values.email?.trim()
          ? [["email", "No email selected for this letter", "Choose email"]]
          : []),
      ]
    : [];
  const labelFor = (item) => {
    const name = recipient.memberNames?.find(
      (member) => member.constituentId === item.constituentId,
    )?.name;
    return `${name || item.addressee || "Constituent"} (ID ${item.constituentId})`;
  };
  function change(field, value) {
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "address" ? { addressParts: null } : {}),
    }));
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
            ...(selected.addressParts
              ? { addressParts: selected.addressParts }
              : {}),
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
    if (!pendingFocus || disabled) return;
    focusField(pendingFocus);
    // Keep the destination until the user explicitly chooses a constituent.
    if (candidate || pendingFocus === "changed") setPendingFocus(null);
  }, [pendingFocus, candidate, disabled]);
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
        className="m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-7xl overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-gray-900/40 sm:w-[calc(100%-2rem)]"
      >
        <form
          className="flex max-h-[94dvh] flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed && candidate && !disabled && !pendingNavigation)
              onSave({ ...values, reviewToken, confirm: true });
          }}
        >
          <header className="shrink-0 border-b border-gray-200 px-4 py-3 sm:px-6">
            <h2 id="recipient-letter-title" className="text-xl font-bold">
              {navigation ? "Review recipients" : "Letter recipient"}
            </h2>
            <p className="mt-1 font-semibold">{recipient.name}</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-emerald-800">{recipient.societyName}</p>
              {navigation && (
                <p className="font-semibold text-emerald-900" role="status">
                  Recipient {navigation.index + 1} of {navigation.items.length}{" "}
                  · {navigation.savedCount} saved this session
                </p>
              )}
            </div>
          </header>
          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:overflow-hidden">
            <section
              aria-label="Recipient fields"
              className="min-w-0 p-4 sm:p-6 lg:overflow-y-auto"
            >
              {navigation && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold">
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
              <p className="text-sm text-gray-600">
                Save the address and wording for this period. Nothing is sent
                and no NXT records change. Each household or individual receives
                one letter.
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
                  Membership, source settings, or recipient details changed
                  since the last review. Choose again from the current saved
                  query details.
                </p>
              )}
              {!disabled && !candidate && (
                <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  Choose a recipient record first to edit this letter's details.
                  {pendingFocus &&
                    " Then we'll take you to the requested field."}
                </p>
              )}
              {!disabled && missing.length > 0 && (
                <section
                  aria-label="Recipient details to complete"
                  className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
                >
                  <ul className="space-y-1">
                    {missing.map(([target, message, action]) => (
                      <li
                        key={target}
                        className="flex flex-wrap items-center justify-between gap-x-3 text-amber-950"
                      >
                        <span>{message}</span>
                        <button
                          type="button"
                          onClick={() => focusField(target)}
                          className="min-h-11 font-semibold text-emerald-800 underline underline-offset-4"
                        >
                          {action}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-gray-600">
                    Saving choices does not clear delivery checks.
                  </p>
                </section>
              )}
              <fieldset disabled={disabled} className="mt-5 space-y-4">
                <label className="block text-sm font-semibold">
                  Recipient record
                  <select
                    ref={(element) => {
                      fields.current.recipient = element;
                    }}
                    autoFocus
                    required
                    className={input}
                    value={values.recipientConstituentId}
                    onChange={(event) => chooseRecipient(event.target.value)}
                  >
                    <option value="">Choose a returned constituent</option>
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
                <p className="text-xs text-gray-600">
                  Changing the recipient resets the wording, address, and email
                  selection below.
                </p>
                <details className="text-xs text-gray-500">
                  <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                    How recipient names are chosen
                  </summary>
                  This record supplies recipient first- and last-name merge
                  fields. A spouse without a returned record cannot be selected
                  yet.
                </details>
                {candidate && (
                  <>
                    {organization && (
                      <section
                        className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"
                        aria-label="Organization letter contact"
                      >
                        <label className="block text-sm font-semibold">
                          Name this letter to
                          <select
                            ref={(element) => {
                              fields.current.contacts = element;
                            }}
                            className={input}
                            value={values.organizationContactKey || ""}
                            onChange={(event) => {
                              const key = event.target.value;
                              const contact = contacts.find(
                                (item) => contactChoiceKey(item) === key,
                              );
                              setValues((current) => ({
                                ...current,
                                organizationContactKey: key,
                                addressee: contact
                                  ? contactDisplayName(contact)
                                  : candidate.addressee || "",
                                salutation: contact
                                  ? contact.firstName ||
                                    contactDisplayName(contact)
                                  : candidate.salutation || "",
                              }));
                              setConfirmed(false);
                            }}
                          >
                            <option value="">
                              Keep the organization's saved greeting
                            </option>
                            {contacts.map((contact) => (
                              <option
                                key={contactChoiceKey(contact)}
                                value={contactChoiceKey(contact)}
                              >
                                {contactDisplayName(contact)} ({contact.role})
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="mt-2 text-sm text-emerald-950">
                          {contacts.length
                            ? "Choose a letter contact, or keep the organization's greeting. Review the suggested wording below."
                            : "No eligible contact names were returned. Keep the organization's greeting, or map the contact columns in Source & period and refresh membership."}
                        </p>
                        <details className="mt-2 text-xs text-emerald-900">
                          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                            How organization contacts are used
                          </summary>
                          The contact supplies recipient first- and last-name
                          merge fields. The organization's mailing address,
                          qualification and appeal history stay with the
                          organization. A contact is not added as a household
                          member, and no contact email or address is fetched.
                        </details>
                      </section>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-semibold">
                        Addressee
                        <input
                          ref={(element) => {
                            fields.current.addressee = element;
                          }}
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
                          ref={(element) => {
                            fields.current.salutation = element;
                          }}
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
                      {organization
                        ? "Review the organization's addressee and chosen contact greeting."
                        : "For a joint letter, review both names in the addressee and greeting."}{" "}
                      Include only what your template expects in its salutation
                      field.
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
                            addressParts: source.addressParts || null,
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
                        ref={(element) => {
                          fields.current.address = element;
                        }}
                        rows={4}
                        maxLength={2000}
                        className={input}
                        value={values.address}
                        onChange={(event) =>
                          change("address", event.target.value)
                        }
                      />
                    </label>
                    <p className="text-xs text-gray-500">
                      Edits apply only to this letter, not NXT. You can leave
                      the address blank for later; postal delivery requires a
                      verified address.
                    </p>
                    <details className="rounded-lg border border-gray-200 p-3 text-sm">
                      <summary className="cursor-pointer font-semibold">
                        Separate address merge fields
                      </summary>
                      <p className="mt-2 text-gray-600">
                        Use these when your letter merges street, city, state
                        and ZIP separately. Older saved results may only contain
                        the full address; enter the parts here or use Full
                        mailing address in the template settings. Changes apply
                        only to this letter.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {LETTER_ADDRESS_TAGS.map((key) => (
                          <label key={key} className="font-semibold">
                            {LETTER_FIELD_LABELS[key]}
                            <input
                              className={input}
                              maxLength={300}
                              value={mergeAddress[key]}
                              onChange={(event) => {
                                const parts = {
                                  ...mergeAddress,
                                  [key]: event.target.value,
                                };
                                setValues((current) => ({
                                  ...current,
                                  addressParts: parts,
                                  address: formatLetterAddress(parts),
                                }));
                                setConfirmed(false);
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                    <label className="block text-sm font-semibold">
                      {channel === "email"
                        ? "Email for this letter"
                        : "Email (optional)"}
                      <select
                        ref={(element) => {
                          fields.current.email = element;
                        }}
                        className={input}
                        value={values.email}
                        onChange={(event) =>
                          change("email", event.target.value)
                        }
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
                      {channel === "email" && !emails.length
                        ? "No email was returned for this recipient. Update the source before using email delivery. "
                        : "Only this recipient's returned addresses are available. "}
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
                        {!organization && (
                          <>
                            <dt>Spouse first name</dt>
                            <dd>
                              {mergeNames.spouse_first_name || "Not available"}
                            </dd>
                            <dt>Household first names</dt>
                            <dd>{mergeNames.first_names || "Not available"}</dd>
                          </>
                        )}
                      </dl>
                      <p className="mt-2 text-gray-500">
                        Each letter template keeps its own merge-field settings.
                      </p>
                    </details>
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        required
                        type="checkbox"
                        className="mt-1"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      I reviewed the recipient and letter wording. Eligibility,
                      communication restrictions, and prior letters still need
                      to be checked before delivery.
                    </label>
                  </>
                )}
              </fieldset>
            </section>
            <aside className="min-w-0 border-t border-gray-200 bg-gray-50 p-4 sm:p-6 lg:overflow-y-auto lg:border-l lg:border-t-0">
              <RecipientLetterPreview
                recipient={recipient}
                values={values}
                reviewToken={reviewToken}
                template={template}
                disabled={disabled}
                onEscape={() => leave(onClose)}
              />
            </aside>
          </div>
          <footer
            aria-label="Recipient review actions"
            className="max-h-[45dvh] shrink-0 overflow-y-auto border-t border-gray-200 bg-white px-4 py-3 sm:px-6"
          >
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
                <p className="font-semibold">
                  You have unsaved recipient edits.
                </p>
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
            <div className="flex flex-wrap justify-end gap-2">
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
          </footer>
        </form>
      </dialog>
    </>
  );
}

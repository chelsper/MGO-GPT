import { useEffect, useRef, useState } from "react";
import { outreachContactRows } from "@/utils/outreachContacts";
import styles from "./projectOutreach.module.css";

function ContactRow({ contact }) {
  const [status, setStatus] = useState("");
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  async function copy() {
    setStatus("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(contact.value);
      if (active.current) setStatus("copied");
    } catch {
      if (active.current) setStatus("unavailable");
    }
  }
  return <li className={styles.contactRow}>
    <div className={styles.contactValue}>
      <span className={styles.eyebrow}>{contact.label}</span>
      <span>{contact.value}</span>
    </div>
    <div className={styles.contactActions}>
      {contact.href && <a href={contact.href} aria-label={`Call ${contact.value}`}>Call</a>}
      <button type="button" disabled={status === "copying"} onClick={copy}
        aria-label={`Copy ${contact.label.toLowerCase()} ${contact.value}`}>
        {status === "copied" ? "Copied" : "Copy"}
      </button>
    </div>
    {contact.type === "phone" && !contact.href && <small className={styles.contactNote}>Check this number in NXT before dialing; it could not be made into a safe call link.</small>}
    {status && <small className={styles.contactNote} role="status">
      {status === "copied" ? `${contact.label} copied.` : status === "copying" ? "Copying..." : "Copy is unavailable in this browser. Select the displayed text to copy it manually."}
    </small>}
  </li>;
}

export default function OutreachContactDetails({ person }) {
  const contacts = outreachContactRows(person);
  const hasPhone = contacts.some(contact => contact.type === "phone");
  return <section className={styles.contactDetails} aria-label="Saved contact details">
    {!hasPhone && <p>No phone number in the saved query. Check contact details before calling.</p>}
    {!!contacts.length && <ul className={styles.contactList}>
      {contacts.map(contact => <ContactRow key={`${contact.key}:${contact.value}`} contact={contact} />)}
    </ul>}
    {!!contacts.length && <small>Call opens your device's calling app. Copy does not contact anyone. Neither records an outcome or submits an NXT action.</small>}
  </section>;
}

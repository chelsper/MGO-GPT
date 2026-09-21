export default function NxtWriteRecoveryLink({ message }) {
  if (!String(message || "").includes("NXT submission")) return null;
  return <a className="mt-3 block font-semibold underline" href="/nxt-write-recovery" target="_blank" rel="noreferrer">Open Saved NXT submissions (new tab)</a>;
}

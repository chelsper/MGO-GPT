import { groupLettersBySociety } from "@/utils/societyLetterDownloads";
import { completedPostalLetter } from "@/utils/societyLetterDispatch";

const button =
  "min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export default function SocietyPdfDownloads({ items, disabled, onDownload }) {
  const groups = groupLettersBySociety(items).filter((group) =>
    group.items.every(
      (item) => item.postalApproval && item.postalDocument?.format === "pdf",
    ),
  );
  if (!groups.length) return null;
  const allPdf =
    groups.reduce((count, group) => count + group.items.length, 0) ===
    items.length;
  return (
    <section aria-label="Print-ready PDFs by society" className="mt-3 w-full">
      <div className="flex flex-wrap gap-3">
        {groups.map((group) => (
          <div key={group.key}>
            <button
              className={`${button} border-emerald-700 bg-emerald-700 text-white`}
              disabled={disabled || !group.items.every(completedPostalLetter)}
              onClick={() => onDownload(group.items.map((item) => item.id))}
            >
              Download {group.name} print-ready PDF
            </button>
            <p className="mt-1 text-sm text-gray-600">
              {group.items.length}{" "}
              {group.items.length === 1 ? "letter" : "letters"} in one PDF
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-gray-600">
        One PDF per society from these letters. Each letter starts on a new
        page; approved letterhead, wording, and dates stay unchanged. Print
        single-sided at actual size. Downloads do not update NXT or mark letters
        mailed.
      </p>
      {groups.length > 1 && allPdf && (
        <button
          className={`${button} mt-2 border-gray-300 bg-white text-gray-800`}
          disabled={disabled || !items.every(completedPostalLetter)}
          onClick={() => onDownload(items.map((item) => item.id))}
        >
          Download all these societies in one PDF
        </button>
      )}
    </section>
  );
}

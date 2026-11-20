import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { calendarDate, formatCalendarDate } from "@/utils/prospectActivity";
import { pledgeReminderDraftIssue } from "@/utils/pledgeReminders";
import { PLEDGE_GIVING_URL } from "@/utils/pledgeReminderHandoff";

const fail = message => Object.assign(new Error(message), { publicStatus: 400 });
const money = cents => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

// Generated privately in memory. No template bank details or donor files in public assets.
export async function renderPledgeReminderPdf(draft, { letterDate, today, view }) {
  const issue = pledgeReminderDraftIssue(draft);
  if (issue) throw fail(issue);
  if (calendarDate(letterDate) !== letterDate || calendarDate(today) !== today || !["pastDue", "upcoming"].includes(view))
    throw fail("Choose a valid reminder date and worklist.");
  const p = draft.pledge, f = draft.fields;
  const pdf = await PDFDocument.create();
  pdf.setTitle("Jacksonville University pledge reminder");
  pdf.setAuthor("Jacksonville University Advancement");
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const small = await pdf.embedFont(StandardFonts.Helvetica);
  const green = rgb(0.04, 0.31, 0.26), ink = rgb(0.13, 0.16, 0.18), gray = rgb(0.35, 0.39, 0.40);
  let page, y;
  function newPage() {
    if (pdf.getPageCount() >= 6) throw fail("This reminder is too long for the PDF layout. Use the CSV and Word template instead.");
    page = pdf.addPage([612, 792]); y = 690;
    page.drawText("JACKSONVILLE UNIVERSITY", { x: 54, y: 744, size: 16, font: bold, color: green });
    page.drawText("University Advancement  |  Pledge reminder", { x: 54, y: 725, size: 10, font: small, color: gray });
    page.drawLine({ start: { x: 54, y: 713 }, end: { x: 558, y: 713 }, thickness: 0.6, color: green });
    page.drawText(`Pledge reminder  |  Page ${pdf.getPageCount()}`, { x: 54, y: 33, size: 8, font: small, color: gray });
  }
  function lines(text, face, size, width) {
    const result = [];
    for (const paragraph of String(text).split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        if (line && face.widthOfTextAtSize(`${line} ${word}`, size) > width) { result.push(line); line = ""; }
        for (const character of word) {
          if (face.widthOfTextAtSize(line + character, size) > width) { result.push(line); line = ""; }
          line += character;
        }
        line += " ";
      }
      result.push(line.trimEnd());
    }
    return result;
  }
  function text(value, { face = font, size = 11, leading = 15, gap = 9, color = ink } = {}) {
    for (const line of lines(value, face, size, 504)) {
      if (y - leading < 55) newPage();
      if (line) page.drawText(line, { x: 54, y, size, font: face, color });
      y -= leading;
    }
    y -= gap;
  }
  function amount(label, value, emphasized = false) {
    if (y < 90) newPage();
    page.drawText(label, { x: 66, y, size: 11, font: emphasized ? bold : small, color: emphasized ? green : ink });
    const formatted = money(value), face = emphasized ? bold : small;
    page.drawText(formatted, { x: 546 - face.widthOfTextAtSize(formatted, 11), y, size: 11, font: face, color: emphasized ? green : ink });
    y -= 25;
  }
  try {
    const checked = new Date(p.refreshedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    if (Object.values(f).join("").length + p.fundDescriptions.join("").length > 10000)
      throw fail("This reminder is too long for the PDF layout. Use the CSV and Word template instead.");
    newPage();
    text(formatCalendarDate(letterDate), { face: small, size: 10, gap: 12 });
    text([f.Addressee, f.Address_Line_1, f.Address_Line_2, `${f.City}, ${f.State} ${f.Zip}`].filter(value => value?.trim()).join("\n"), { leading: 13, gap: 17 });
    text("We at Jacksonville University greatly appreciate your generous support. Your investment directly impacts our students and faculty, fuels education, and all that takes place on our campus community.");
    text(`Below is a statement concerning your support of ${p.fundDescriptions.join("; ")}.`);
    text(`Pledge reference: ${p.lookupId || p.id}`, { face: small, size: 10, gap: 12 });
    if (y < 260) newPage();
    amount("Amount pledged", p.totalCents);
    amount("Amount paid to date", p.paidToDateCents);
    amount("Remaining pledge balance", p.balanceCents);
    amount(view === "pastDue" ? "Amount currently due" : "Upcoming installment amount", p.amountDueCents, true);
    y -= 4;
    text(view === "pastDue"
      ? `Amount due includes unpaid installments through ${formatCalendarDate(today)}. Earliest unpaid installment: ${formatCalendarDate(p.dueDate)}.`
      : `Installment due: ${formatCalendarDate(p.dueDate)}. This reminder covers installments on that date only; earlier unpaid installments are not included.`, { size: 10, leading: 13 });
    text(`For your convenience, you may pay online through our secure giving website: ${PLEDGE_GIVING_URL}`);
    text("If you have already made this payment, thank you. Please contact the staff member who provided this reminder so we can confirm it has been applied.");
    text("Thank you for your continued investment in Jacksonville University.");
    text(`Saved pledge amounts last checked ${checked} Eastern. Subsequent payments or adjustments may not yet appear.`, { face: small, size: 8, leading: 11, color: gray });
    return Buffer.from(await pdf.save());
  } catch (error) {
    if (error.publicStatus) throw error;
    throw fail("The PDF could not represent these names or details safely. Use the existing CSV and Word template; no email was opened.");
  }
}

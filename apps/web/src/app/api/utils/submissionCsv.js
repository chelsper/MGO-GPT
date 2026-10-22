export function escapeCsvField(value) {
  let field = String(value ?? "");
  // Spreadsheet formula prefixes must remain literal donor-supplied text.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(field) || /^[\t\r\n]/.test(field)) {
    field = `'${field}`;
  }
  return /[,"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

import PizZip from "pizzip";
export function wordFixture(
  text = "Dear {salutation}, thank you for joining {society_name}.",
) {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
  );
  return zip;
}
export const templateFixture = () => ({
  filename: "letter.docx",
  content: wordFixture().generate({ type: "base64", compression: "DEFLATE" }),
  subject: "Your {society_name} letter",
  emailBody: "Dear {salutation}, please see your attached letter.",
});

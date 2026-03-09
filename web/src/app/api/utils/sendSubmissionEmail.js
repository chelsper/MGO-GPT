/**
 * Sends an email notification to advancement services when a submission is created.
 * Includes a CSV of the submission data and any image attachments as PNGs.
 *
 * Uses the Resend API (https://resend.com/docs/api-reference/emails/send-email)
 */

const RECIPIENT_EMAIL = "csantor@ju.edu";

/**
 * Convert a submission record into CSV content (header row + data row).
 */
function buildCsvContent(submission, submissionType) {
  const fieldMap = {
    donor_update: [
      { header: "Submission ID", key: "id" },
      { header: "Type", key: "submission_type" },
      { header: "Officer Name", key: "officer_name" },
      { header: "Donor Name", key: "donor_name" },
      { header: "Interaction Type", key: "interaction_type" },
      { header: "Notes", key: "notes" },
      { header: "Transcript", key: "transcript" },
      { header: "Next Step", key: "next_step" },
      { header: "Estimated Ask Amount", key: "estimated_ask_amount" },
      { header: "Status", key: "status" },
      { header: "Date Submitted", key: "date_submitted" },
    ],
    opportunity_update: [
      { header: "Submission ID", key: "id" },
      { header: "Type", key: "submission_type" },
      { header: "Officer Name", key: "officer_name" },
      { header: "Donor Name", key: "donor_name" },
      { header: "Opportunity Stage", key: "opportunity_stage" },
      { header: "Estimated Amount", key: "estimated_amount" },
      { header: "Notes", key: "notes" },
      { header: "Status", key: "status" },
      { header: "Date Submitted", key: "date_submitted" },
    ],
    constituent_suggestion: [
      { header: "Submission ID", key: "id" },
      { header: "Type", key: "submission_type" },
      { header: "Officer Name", key: "officer_name" },
      { header: "Constituent Name", key: "constituent_name" },
      { header: "Organization", key: "organization" },
      { header: "Email", key: "email" },
      { header: "Phone", key: "phone" },
      { header: "Notes", key: "notes" },
      { header: "Assign to Me", key: "assign_to_me" },
      { header: "Business Card URL", key: "business_card_url" },
      { header: "Status", key: "status" },
      { header: "Date Submitted", key: "date_submitted" },
    ],
  };

  const fields = fieldMap[submissionType] || fieldMap.donor_update;

  const escapeCsvValue = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const headerRow = fields.map((f) => f.header).join(",");
  const dataRow = fields
    .map((f) => escapeCsvValue(submission[f.key]))
    .join(",");

  return headerRow + "\n" + dataRow + "\n";
}

/**
 * Fetch an image from a URL and return it as a base64 string.
 */
async function fetchImageAsBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(
        `Failed to fetch image from ${imageUrl}: ${response.status}`,
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
  } catch (error) {
    console.error(`Error fetching image from ${imageUrl}:`, error);
    return null;
  }
}

/**
 * Build a friendly subject line based on submission type.
 */
function getSubjectLine(submission, submissionType) {
  const typeLabels = {
    donor_update: "Donor Update",
    opportunity_update: "Opportunity Update",
    constituent_suggestion: "New Constituent Suggestion",
  };
  const label = typeLabels[submissionType] || "Submission";
  const name =
    submission.donor_name || submission.constituent_name || "Unknown";
  return `MGO VoiceLog: ${label} – ${name}`;
}

/**
 * Build a plain-text email body summarizing the submission.
 */
function getEmailBody(submission, submissionType) {
  const typeLabels = {
    donor_update: "Donor Update",
    opportunity_update: "Opportunity Update",
    constituent_suggestion: "New Constituent Suggestion",
  };
  const label = typeLabels[submissionType] || "Submission";

  let body = `A new ${label} has been submitted in MGO VoiceLog.\n\n`;
  body += `Officer: ${submission.officer_name || "N/A"}\n`;

  if (submissionType === "donor_update") {
    body += `Donor: ${submission.donor_name || "N/A"}\n`;
    body += `Interaction Type: ${submission.interaction_type || "N/A"}\n`;
    body += `Estimated Ask Amount: ${submission.estimated_ask_amount ? "$" + submission.estimated_ask_amount : "N/A"}\n`;
    body += `Next Step: ${submission.next_step || "N/A"}\n`;
  } else if (submissionType === "opportunity_update") {
    body += `Donor: ${submission.donor_name || "N/A"}\n`;
    body += `Opportunity Stage: ${submission.opportunity_stage || "N/A"}\n`;
    body += `Estimated Amount: ${submission.estimated_amount ? "$" + submission.estimated_amount : "N/A"}\n`;
  } else if (submissionType === "constituent_suggestion") {
    body += `Constituent: ${submission.constituent_name || "N/A"}\n`;
    body += `Organization: ${submission.organization || "N/A"}\n`;
    body += `Email: ${submission.email || "N/A"}\n`;
    body += `Phone: ${submission.phone || "N/A"}\n`;
    body += `Assign to Me: ${submission.assign_to_me || "N/A"}\n`;
  }

  body += `\nNotes:\n${submission.notes || "None"}\n`;

  if (submission.transcript) {
    body += `\nTranscript:\n${submission.transcript}\n`;
  }

  body += `\nStatus: ${submission.status}\n`;
  body += `Submitted: ${submission.date_submitted || submission.created_at || "N/A"}\n`;
  body += `\nA CSV file with the full data is attached.\n`;

  return body;
}

/**
 * Send the submission notification email.
 *
 * @param {Object} submission - The full submission row from the database (from RETURNING *)
 * @param {string} submissionType - One of: 'donor_update', 'opportunity_update', 'constituent_suggestion'
 */
export async function sendSubmissionEmail(submission, submissionType) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set — skipping email notification");
    return;
  }

  try {
    // Build CSV attachment
    const csvContent = buildCsvContent(submission, submissionType);
    const csvBase64 = Buffer.from(csvContent, "utf-8").toString("base64");

    const attachments = [
      {
        filename: `submission_${submission.id}_${submissionType}.csv`,
        content: csvBase64,
        type: "text/csv",
      },
    ];

    // Parse the attachments from the submission to find images
    let submissionAttachments = [];
    if (submission.attachments) {
      try {
        submissionAttachments =
          typeof submission.attachments === "string"
            ? JSON.parse(submission.attachments)
            : submission.attachments;
      } catch (e) {
        console.error("Failed to parse submission attachments:", e);
      }
    }

    // Also check for business card URL (constituent suggestions)
    if (submission.business_card_url) {
      submissionAttachments.push({
        url: submission.business_card_url,
        name: "business_card",
        type: "image",
      });
    }

    // Download each image attachment and add as PNG
    let imageIndex = 0;
    for (const att of submissionAttachments) {
      if (!att.url) continue;

      // Check if it's an image type or has an image-like URL
      const isImage =
        att.type === "image" ||
        /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(att.url) ||
        att.url.includes("ucarecdn.com");

      if (isImage) {
        imageIndex++;
        const base64Data = await fetchImageAsBase64(att.url);
        if (base64Data) {
          const imageName = att.name || `attachment_${imageIndex}`;
          attachments.push({
            filename: `${imageName}.png`,
            content: base64Data,
            type: "image/png",
          });
        }
      }
    }

    // Send via Resend API
    const emailPayload = {
      from: "MGO VoiceLog <onboarding@resend.dev>",
      to: [RECIPIENT_EMAIL],
      subject: getSubjectLine(submission, submissionType),
      text: getEmailBody(submission, submissionType),
      attachments: attachments,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Resend API error:", response.status, errorText);
    } else {
      const result = await response.json();
      console.log("Submission email sent successfully, id:", result.id);
    }
  } catch (error) {
    console.error("Failed to send submission email:", error);
    // Don't throw — email failure should not block the submission
  }
}

/**
 * Sends email notifications for work that requires Advancement Services review.
 * Direct writes that finish in Blackbaud NXT intentionally do not use this helper.
 */
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getOrganizationSettings } from "@/app/api/utils/organizationSettings";

const DEFAULT_RECIPIENT_EMAIL = "devdata@ju.edu";
const DEFAULT_SENDER_NAME = "JUMGOGPT";
const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";

function cleanDisplayName(value) {
  return (
    String(value || "")
      .replace(/[<>\r\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || DEFAULT_SENDER_NAME
  );
}

function getConfiguredFromAddress(value) {
  const configured = String(value || "").trim();
  const bracketedAddress = configured.match(/<([^>]+)>/);
  return (bracketedAddress?.[1] || configured || DEFAULT_FROM_ADDRESS).trim();
}

export function buildResendFromAddress(
  senderName,
  configuredFrom = process.env.RESEND_FROM_EMAIL,
) {
  return `${cleanDisplayName(senderName)} <${getConfiguredFromAddress(configuredFrom)}>`;
}

async function getNotificationRouting() {
  const settings = await getOrganizationSettings();
  const recipient =
    String(settings?.advancementServicesNotificationEmail || "").trim() ||
    DEFAULT_RECIPIENT_EMAIL;
  const applicationName =
    String(settings?.applicationName || "").trim() || DEFAULT_SENDER_NAME;

  return {
    applicationName,
    recipient,
    from: buildResendFromAddress(
      settings?.notificationSenderName || DEFAULT_SENDER_NAME,
    ),
  };
}

async function sendWithResend({ apiKey, from, recipient, subject, text, attachments }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject,
      text,
      ...(attachments?.length ? { attachments } : {}),
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      error: (await response.text()) || `Resend returned ${response.status}`,
    };
  }

  return {
    ok: true,
    result: await response.json().catch(() => ({})),
  };
}

export async function sendAdvancementServicesNotification({ title, text }) {
  await ensureAppSchema();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set - skipping Advancement Services notification");
    return { status: "skipped", error: "RESEND_API_KEY is not set" };
  }

  const routing = await getNotificationRouting();
  const result = await sendWithResend({
    apiKey,
    from: routing.from,
    recipient: routing.recipient,
    subject: `${routing.applicationName}: ${String(title || "Advancement Services request")}`,
    text: String(text || "A user sent an update for Advancement Services review."),
  });

  if (!result.ok) {
    console.error("Resend API error:", result.error);
    return { status: "failed", error: result.error };
  }

  return {
    status: "sent",
    messageId: result.result?.id || null,
    recipient: routing.recipient,
  };
}

async function updateEmailStatus(submissionId, status, extra = {}) {
  await ensureAppSchema();

  const {
    recipient = null,
    messageId = null,
    error = null,
    sentAt = null,
  } = extra;

  await sql`
    UPDATE submissions
    SET
      notification_email_status = ${status},
      notification_email_recipient = ${recipient},
      notification_email_id = ${messageId},
      notification_email_error = ${error},
      notification_email_sent_at = ${sentAt},
      updated_at = NOW()
    WHERE id = ${submissionId}
  `;
}

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
      { header: "Review Status", key: "status" },
      { header: "Date Submitted", key: "date_submitted" },
    ],
    opportunity_update: [
      { header: "Submission ID", key: "id" },
      { header: "Type", key: "submission_type" },
      { header: "Officer Name", key: "officer_name" },
      { header: "Donor Name", key: "donor_name" },
      { header: "Opportunity Name", key: "opportunity_title" },
      { header: "Status", key: "opportunity_stage" },
      { header: "Ask Date", key: "ask_date" },
      { header: "Date Expected", key: "expected_date" },
      { header: "Ask Amount", key: "estimated_amount" },
      { header: "Notes", key: "notes" },
      { header: "Review Status", key: "status" },
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
  const escapeCsvValue = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return text.includes(",") || text.includes('"') || text.includes("\n")
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  return `${fields.map((field) => field.header).join(",")}\n${fields
    .map((field) => escapeCsvValue(submission[field.key]))
    .join(",")}\n`;
}

async function fetchImageAsBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Failed to fetch image from ${imageUrl}: ${response.status}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer()).toString("base64");
  } catch (error) {
    console.error(`Error fetching image from ${imageUrl}:`, error);
    return null;
  }
}

function getSubmissionLabel(submissionType) {
  return {
    donor_update: "Donor Update",
    opportunity_update: "Opportunity Update",
    constituent_suggestion: "New Constituent Suggestion",
  }[submissionType] || "Submission";
}

function getSubjectLine(submission, submissionType, applicationName) {
  const name = submission.donor_name || submission.constituent_name || "Unknown";
  return `${applicationName}: ${getSubmissionLabel(submissionType)} - ${name}`;
}

function getEmailBody(submission, submissionType, applicationName) {
  let body = `A new ${getSubmissionLabel(submissionType)} has been submitted in ${applicationName}.\n\n`;
  body += `Officer: ${submission.officer_name || "N/A"}\n`;

  if (submissionType === "donor_update") {
    body += `Donor: ${submission.donor_name || "N/A"}\n`;
    body += `Interaction Type: ${submission.interaction_type || "N/A"}\n`;
    body += `Estimated Ask Amount: ${submission.estimated_ask_amount ? `$${submission.estimated_ask_amount}` : "N/A"}\n`;
    body += `Next Step: ${submission.next_step || "N/A"}\n`;
  } else if (submissionType === "opportunity_update") {
    body += `Donor: ${submission.donor_name || "N/A"}\n`;
    body += `Opportunity Name: ${submission.opportunity_title || "N/A"}\n`;
    body += `Status: ${submission.opportunity_stage || "N/A"}\n`;
    body += `Ask Date: ${submission.ask_date || "N/A"}\n`;
    body += `Date Expected: ${submission.expected_date || "N/A"}\n`;
    body += `Ask Amount: ${submission.estimated_amount ? `$${submission.estimated_amount}` : "N/A"}\n`;
  } else if (submissionType === "constituent_suggestion") {
    body += `Constituent: ${submission.constituent_name || "N/A"}\n`;
    body += `Organization: ${submission.organization || "N/A"}\n`;
    body += `Email: ${submission.email || "N/A"}\n`;
    body += `Phone: ${submission.phone || "N/A"}\n`;
    body += `Assign to Me: ${submission.assign_to_me || "N/A"}\n`;
  }

  body += `\nNotes:\n${submission.notes || "None"}\n`;
  if (submission.transcript) body += `\nTranscript:\n${submission.transcript}\n`;
  body += `\nStatus: ${submission.status}\n`;
  body += `Submitted: ${submission.date_submitted || submission.created_at || "N/A"}\n`;
  return `${body}\nA CSV file with the full data is attached.\n`;
}

export async function sendSubmissionEmail(submission, submissionType) {
  await ensureAppSchema();
  const routing = await getNotificationRouting();
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("RESEND_API_KEY is not set - skipping email notification");
    await updateEmailStatus(submission.id, "skipped", {
      recipient: routing.recipient,
      error: "RESEND_API_KEY is not set",
    });
    return;
  }

  try {
    await updateEmailStatus(submission.id, "processing", {
      recipient: routing.recipient,
    });

    const attachments = [
      {
        filename: `submission_${submission.id}_${submissionType}.csv`,
        content: Buffer.from(buildCsvContent(submission, submissionType), "utf-8").toString("base64"),
        type: "text/csv",
      },
    ];

    let submissionAttachments = [];
    if (submission.attachments) {
      try {
        submissionAttachments =
          typeof submission.attachments === "string"
            ? JSON.parse(submission.attachments)
            : submission.attachments;
      } catch (error) {
        console.error("Failed to parse submission attachments:", error);
      }
    }

    if (submission.business_card_url) {
      submissionAttachments.push({
        url: submission.business_card_url,
        name: "business_card",
        type: "image",
      });
    }

    let imageIndex = 0;
    for (const attachment of submissionAttachments) {
      if (!attachment?.url) continue;
      const isImage =
        attachment.type === "image" ||
        /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(attachment.url) ||
        attachment.url.includes("ucarecdn.com");
      if (!isImage) continue;

      imageIndex += 1;
      const content = await fetchImageAsBase64(attachment.url);
      if (content) {
        attachments.push({
          filename: `${attachment.name || `attachment_${imageIndex}`}.png`,
          content,
          type: "image/png",
        });
      }
    }

    const result = await sendWithResend({
      apiKey,
      from: routing.from,
      recipient: routing.recipient,
      subject: getSubjectLine(submission, submissionType, routing.applicationName),
      text: getEmailBody(submission, submissionType, routing.applicationName),
      attachments,
    });

    if (!result.ok) {
      console.error("Resend API error:", result.error);
      await updateEmailStatus(submission.id, "failed", {
        recipient: routing.recipient,
        error: result.error,
      });
      return;
    }

    console.log("Submission email sent successfully, id:", result.result?.id);
    await updateEmailStatus(submission.id, "sent", {
      recipient: routing.recipient,
      messageId: result.result?.id || null,
      sentAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to send submission email:", error);
    await updateEmailStatus(submission.id, "failed", {
      recipient: routing.recipient,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

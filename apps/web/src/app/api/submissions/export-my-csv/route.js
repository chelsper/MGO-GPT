import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    // For demo purposes, using a hardcoded user_id = 1 (MGO user)
    // In production, this would come from the authenticated session
    const userId = 1;

    // Fetch user's submissions
    const submissions = await sql`
      SELECT 
        s.id,
        s.submission_type,
        s.donor_name,
        s.interaction_type,
        s.next_step,
        s.estimated_ask_amount,
        s.opportunity_stage,
        s.estimated_amount,
        s.constituent_name,
        s.organization,
        s.email,
        s.phone,
        s.notes,
        s.transcript,
        s.assign_to_me,
        s.business_card_url,
        s.attachments,
        s.status,
        s.date_submitted,
        s.reviewed_at,
        reviewer.name as reviewed_by_name
      FROM submissions s
      LEFT JOIN users reviewer ON s.reviewed_by = reviewer.id
      WHERE s.user_id = ${userId}
      ORDER BY s.date_submitted DESC
    `;

    // Define CSV headers
    const headers = [
      "ID",
      "Type",
      "Status",
      "Date Submitted",
      "Reviewed At",
      "Reviewed By",
      "Donor Name",
      "Interaction Type",
      "Next Step",
      "Estimated Ask Amount",
      "Opportunity Stage",
      "Estimated Amount",
      "Constituent Name",
      "Organization",
      "Email",
      "Phone",
      "Transcript",
      "Assign To Me",
      "Business Card URL",
      "Attachment Count",
      "Notes",
    ];

    // Convert submissions to CSV rows
    const rows = submissions.map((sub) => {
      const attachmentCount = sub.attachments
        ? Array.isArray(sub.attachments)
          ? sub.attachments.length
          : JSON.parse(sub.attachments).length
        : 0;

      return [
        sub.id,
        formatSubmissionType(sub.submission_type),
        sub.status || "",
        sub.date_submitted ? new Date(sub.date_submitted).toLocaleString() : "",
        sub.reviewed_at ? new Date(sub.reviewed_at).toLocaleString() : "",
        sub.reviewed_by_name || "",
        sub.donor_name || "",
        sub.interaction_type || "",
        sub.next_step || "",
        sub.estimated_ask_amount
          ? `$${sub.estimated_ask_amount.toLocaleString()}`
          : "",
        sub.opportunity_stage || "",
        sub.estimated_amount ? `$${sub.estimated_amount.toLocaleString()}` : "",
        sub.constituent_name || "",
        sub.organization || "",
        sub.email || "",
        sub.phone || "",
        escapeCsvField(sub.transcript || ""),
        sub.assign_to_me || "",
        sub.business_card_url || "",
        attachmentCount,
        escapeCsvField(sub.notes || ""),
      ];
    });

    // Build CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((field) => escapeCsvField(field.toString())).join(","),
      ),
    ].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="my-submissions-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error generating CSV:", error);
    return Response.json(
      { error: "Failed to generate CSV export" },
      { status: 500 },
    );
  }
}

function formatSubmissionType(type) {
  const types = {
    donor_update: "Donor Update",
    opportunity_update: "Opportunity Update",
    constituent_suggestion: "Constituent Suggestion",
  };
  return types[type] || type;
}

function escapeCsvField(field) {
  if (typeof field !== "string") {
    field = String(field);
  }

  // If field contains comma, newline, or quote, wrap in quotes and escape quotes
  if (field.includes(",") || field.includes("\n") || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

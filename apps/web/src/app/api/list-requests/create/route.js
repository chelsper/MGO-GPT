import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);
    const body = await request.json();

    const {
      requesterName,
      dateNeeded,
      purpose,
      purposeOther,
      outputType,
      excelFields,
      excelFieldsOther,
      whoIncluded,
      whoIncludedOther,
      givingLevel,
      givingLevelCustom,
      giftTimeframe,
      giftTimeframeCustomStart,
      giftTimeframeCustomEnd,
      locationFilter,
      locationState,
      locationCity,
      locationZip,
      locationRadiusAddress,
      locationRadiusMiles,
      assignedMgo,
      specialInstructions,
      exclusions,
      exclusionsOther,
      priorityLevel,
    } = body;

    // Insert list request
    const result = await sql`
      INSERT INTO list_requests (
        user_id,
        requester_name,
        date_needed,
        purpose,
        purpose_other,
        output_type,
        excel_fields,
        excel_fields_other,
        who_included,
        who_included_other,
        giving_level,
        giving_level_custom,
        gift_timeframe,
        gift_timeframe_custom_start,
        gift_timeframe_custom_end,
        location_filter,
        location_state,
        location_city,
        location_zip,
        location_radius_address,
        location_radius_miles,
        assigned_mgo,
        special_instructions,
        exclusions,
        exclusions_other,
        priority_level,
        status,
        created_at
      ) VALUES (
        ${user.id},
        ${requesterName || user.name},
        ${dateNeeded},
        ${purpose},
        ${purposeOther || null},
        ${outputType},
        ${excelFields ? JSON.stringify(excelFields) : null},
        ${excelFieldsOther || null},
        ${whoIncluded ? JSON.stringify(whoIncluded) : null},
        ${whoIncludedOther || null},
        ${givingLevel || null},
        ${givingLevelCustom || null},
        ${giftTimeframe || null},
        ${giftTimeframeCustomStart || null},
        ${giftTimeframeCustomEnd || null},
        ${locationFilter || null},
        ${locationState || null},
        ${locationCity || null},
        ${locationZip || null},
        ${locationRadiusAddress || null},
        ${locationRadiusMiles || null},
        ${assignedMgo || null},
        ${specialInstructions || null},
        ${exclusions ? JSON.stringify(exclusions) : null},
        ${exclusionsOther || null},
        ${priorityLevel},
        'Pending',
        NOW()
      )
      RETURNING id
    `;

    return Response.json({
      success: true,
      requestId: result[0].id,
    });
  } catch (error) {
    console.error("List request error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to submit list request",
      },
      { status: 500 },
    );
  }
}

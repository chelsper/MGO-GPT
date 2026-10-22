import { requireActiveAccount, privateJson, endpointFailure } from "@/app/api/utils/legacyEndpointAccess";
import { getAuthorizedAudio } from "@/app/api/utils/legacyMediaInput";

export async function POST(request) {
  try {
    const user = await requireActiveAccount(request, { mutation: true });
    const audioFile = await getAuthorizedAudio(request, user);
    const formData = new FormData();
    formData.append("file", audioFile);

    const whisperResponse = await fetch(
      "/integrations/transcribe-audio/whisperv3",
      {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        body: formData,
      },
    );

    if (!whisperResponse.ok) {
      await whisperResponse.body?.cancel();
      return privateJson(
        { error: "Failed to transcribe audio" },
        { status: 502 },
      );
    }

    const whisperData = await whisperResponse.json();
    const transcript = whisperData.text || "";

    if (!transcript.trim()) {
      return privateJson({
        transcript: "",
        extractedFields: null,
        success: true,
      });
    }

    // Extract structured fields for opportunity updates
    const extractionResponse = await fetch(
      "/integrations/chat-gpt/conversationgpt4",
      {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `You are an AI assistant helping Major Gift Officers log opportunity updates. Extract key information from voice transcripts.

Extract the following fields:
- donorName: The name of the donor or prospect
- opportunityStage: One of: "Identification", "Qualification", "Cultivation", "Solicitation", "Solicitation - Verbal", "Stewardship", "Funded", or "Declined"
- estimatedAmount: Any dollar amount mentioned (as a number, no currency symbols)
- notes: A brief summary of the opportunity update (2-3 sentences)

If a field cannot be determined from the transcript, return null for that field.`,
            },
            {
              role: "user",
              content: `Extract structured information from this transcript:\n\n${transcript}`,
            },
          ],
          json_schema: {
            name: "opportunity_extraction",
            schema: {
              type: "object",
              properties: {
                donorName: {
                  type: ["string", "null"],
                  description: "The full name of the donor or prospect",
                },
                opportunityStage: {
                  type: ["string", "null"],
                  description:
                    "Stage: Identification, Qualification, Cultivation, Solicitation, Solicitation - Verbal, Stewardship, Funded, or Declined",
                },
                estimatedAmount: {
                  type: ["number", "null"],
                  description: "Dollar amount for the opportunity",
                },
                notes: {
                  type: ["string", "null"],
                  description: "Brief summary of the opportunity update",
                },
              },
              required: [
                "donorName",
                "opportunityStage",
                "estimatedAmount",
                "notes",
              ],
              additionalProperties: false,
            },
          },
        }),
      },
    );

    if (!extractionResponse.ok) {
      await extractionResponse.body?.cancel();
      return privateJson({
        transcript,
        extractedFields: null,
        success: true,
      });
    }

    const extractionData = await extractionResponse.json();
    const extractedFields = extractionData.choices?.[0]?.message?.content
      ? JSON.parse(extractionData.choices[0].message.content)
      : null;

    return privateJson({
      transcript,
      extractedFields,
      success: true,
    });
  } catch (error) {
    return endpointFailure(error, "Audio processing is unavailable. Please try again shortly.");
  }
}

import { requireActiveAccount, privateJson, endpointFailure } from "@/app/api/utils/legacyEndpointAccess";
import { getAuthorizedAudio } from "@/app/api/utils/legacyMediaInput";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const user = await requireActiveAccount(request, { mutation: true });
    const audioFile = await getAuthorizedAudio(request, user);

    const formData = new FormData();
    formData.append(
      "file",
      audioFile,
      audioFile.name,
    );

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
        {
          error: "Failed to transcribe audio",
          stage: "transcription",
        },
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

    // Now use ChatGPT to extract structured fields from the transcript
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
              content: `You are an AI assistant helping Major Gift Officers log donor interactions. Extract key information from voice transcripts and return structured data.

Extract the following fields:
- donorName: The name of the donor or prospect mentioned
- interactionType: One of: "visit", "call", "email", or "event"
- estimatedAmount: Any dollar amount mentioned (as a number, no currency symbols)
- nextStep: What the officer should do next
- keyPoints: A brief summary of important points (2-3 sentences)

If a field cannot be determined from the transcript, return null for that field.`,
            },
            {
              role: "user",
              content: `Extract structured information from this transcript:\n\n${transcript}`,
            },
          ],
          json_schema: {
            name: "donor_interaction_extraction",
            schema: {
              type: "object",
              properties: {
                donorName: {
                  type: ["string", "null"],
                  description: "The full name of the donor or prospect",
                },
                interactionType: {
                  type: ["string", "null"],
                  description:
                    "Type of interaction: visit, call, email, or event",
                },
                estimatedAmount: {
                  type: ["number", "null"],
                  description: "Any dollar amount mentioned for ask or gift",
                },
                nextStep: {
                  type: ["string", "null"],
                  description: "The next action to take",
                },
                keyPoints: {
                  type: ["string", "null"],
                  description:
                    "Brief summary of key points from the interaction",
                },
              },
              required: [
                "donorName",
                "interactionType",
                "estimatedAmount",
                "nextStep",
                "keyPoints",
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

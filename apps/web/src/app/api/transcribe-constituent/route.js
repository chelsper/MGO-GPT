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

    // Extract structured fields for constituent suggestions
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
              content: `You are an AI assistant helping Major Gift Officers add new constituent contacts. Extract key information from voice transcripts.

Extract the following fields:
- name: The person's full name
- organization: Their company or organization
- email: Email address if mentioned
- phone: Phone number if mentioned
- notes: Brief notes about the contact or how they were met (2-3 sentences)

If a field cannot be determined from the transcript, return null for that field.`,
            },
            {
              role: "user",
              content: `Extract structured information from this transcript:\n\n${transcript}`,
            },
          ],
          json_schema: {
            name: "constituent_extraction",
            schema: {
              type: "object",
              properties: {
                name: {
                  type: ["string", "null"],
                  description: "The person's full name",
                },
                organization: {
                  type: ["string", "null"],
                  description: "Their company or organization",
                },
                email: {
                  type: ["string", "null"],
                  description: "Email address",
                },
                phone: {
                  type: ["string", "null"],
                  description: "Phone number",
                },
                notes: {
                  type: ["string", "null"],
                  description: "Brief notes about the contact",
                },
              },
              required: ["name", "organization", "email", "phone", "notes"],
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

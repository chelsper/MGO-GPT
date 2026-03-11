export async function POST(request) {
  try {
    const body = await request.json();
    const { audioUrl } = body;

    if (!audioUrl) {
      return Response.json(
        { error: "No audio URL provided", stage: "request" },
        { status: 400 }
      );
    }

    // Download the audio file from the uploaded URL
    let audioResponse;
    try {
      audioResponse = await fetch(audioUrl);
    } catch (fetchErr) {
      console.error("Failed to fetch audio URL:", fetchErr);
      return Response.json(
        {
          error: "Failed to download audio file",
          stage: "download",
          details: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        },
        { status: 400 },
      );
    }

    if (!audioResponse.ok) {
      console.error("Failed to download audio:", audioResponse.status);
      return Response.json(
        {
          error: "Failed to download audio file",
          stage: "download",
          details: `Audio URL returned ${audioResponse.status}`,
        },
        { status: 400 },
      );
    }

    const audioArrayBuffer = await audioResponse.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

    // Determine a reasonable file extension from the content type or URL
    const contentType =
      audioResponse.headers.get("content-type") || "audio/m4a";
    let fileName = "audio.m4a";
    if (contentType.includes("wav")) {
      fileName = "audio.wav";
    } else if (contentType.includes("mp3") || contentType.includes("mpeg")) {
      fileName = "audio.mp3";
    } else if (contentType.includes("ogg")) {
      fileName = "audio.ogg";
    } else if (contentType.includes("webm")) {
      fileName = "audio.webm";
    }

    // Build FormData with a proper File object from the buffer
    const audioFile = new File([audioBuffer], fileName, { type: contentType });
    const formData = new FormData();
    formData.append("file", audioFile);

    const whisperResponse = await fetch(
      "/integrations/transcribe-audio/whisperv3",
      {
        method: "POST",
        body: formData,
      },
    );

    if (!whisperResponse.ok) {
      const errorData = await whisperResponse.text();
      console.error(
        "Transcription integration error:",
        whisperResponse.status,
        errorData,
      );
      return Response.json(
        {
          error: "Failed to transcribe audio",
          stage: "transcription",
          details: errorData || `Whisper returned ${whisperResponse.status}`,
        },
        { status: whisperResponse.status },
      );
    }

    const whisperData = await whisperResponse.json();
    const transcript = whisperData.text || "";

    if (!transcript.trim()) {
      return Response.json({
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
      console.error("Field extraction failed, returning transcript only");
      return Response.json({
        transcript,
        extractedFields: null,
        success: true,
      });
    }

    const extractionData = await extractionResponse.json();
    const extractedFields = extractionData.choices?.[0]?.message?.content
      ? JSON.parse(extractionData.choices[0].message.content)
      : null;

    return Response.json({
      transcript,
      extractedFields,
      success: true,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return Response.json(
      {
        error: "Failed to transcribe audio",
        stage: "unknown",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

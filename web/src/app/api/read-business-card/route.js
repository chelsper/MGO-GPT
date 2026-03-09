export async function POST(request) {
  try {
    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return Response.json({ error: "No image URL provided" }, { status: 400 });
    }

    // Download the image and convert to base64
    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BusinessCardReader/1.0)",
      },
    });
    if (!imageResponse.ok) {
      return Response.json(
        { error: "Failed to download image" },
        { status: 400 },
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    // Determine content type from response headers or default to jpeg
    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";
    const base64DataUrl = `data:${contentType};base64,${base64Image}`;

    // Use ChatGPT vision-capable extraction with a strict JSON schema
    const extractionResponse = await fetch(
      "/integrations/chat-gpt/conversationgpt4",
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "Extract contact fields from business card images. Return null for unknown fields.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the contact details from this business card image.",
              },
              {
                type: "image_url",
                image_url: {
                  url: base64DataUrl,
                },
              },
            ],
          },
        ],
        json_schema: {
          name: "business_card_extraction",
          schema: {
            type: "object",
            properties: {
              name: {
                type: ["string", "null"],
                description: "Person's full name",
              },
              organization: {
                type: ["string", "null"],
                description: "Company or organization",
              },
              email: {
                type: ["string", "null"],
                description: "Email address",
              },
              phone: {
                type: ["string", "null"],
                description: "Phone number",
              },
            },
            required: ["name", "organization", "email", "phone"],
            additionalProperties: false,
          },
        },
      }),
    },
    );

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error("Business card extraction API error:", errorText);
      return Response.json(
        { error: "Failed to read business card" },
        { status: extractionResponse.status },
      );
    }

    const extractionData = await extractionResponse.json();
    const message = extractionData.choices?.[0]?.message;
    const content = message?.content;
    let extractedFields = null;

    if (typeof content === "string" && content.trim()) {
      try {
        extractedFields = JSON.parse(content);
      } catch (parseError) {
        console.error("Failed to parse extraction content as JSON:", parseError);
      }
    }

    if (!extractedFields && Array.isArray(content)) {
      const textPart = content.find(
        (part) => typeof part?.text === "string" && part.text.trim(),
      );
      if (textPart?.text) {
        try {
          extractedFields = JSON.parse(textPart.text);
        } catch (parseError) {
          console.error("Failed to parse extraction content array:", parseError);
        }
      }
    }

    return Response.json({
      extractedFields,
      success: true,
    });
  } catch (error) {
    console.error("Business card reading error:", error);
    return Response.json(
      { error: "Internal server error reading business card" },
      { status: 500 },
    );
  }
}

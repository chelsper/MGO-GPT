import { auth } from "@/auth";

export const runtime = "nodejs";

const MAX_IMAGE_DATA_URL_BYTES = 2_750_000;

function getValidatedImageDataUrl(imageDataUrl) {
  if (typeof imageDataUrl !== "string" || !imageDataUrl.trim()) {
    return null;
  }

  if (imageDataUrl.length > MAX_IMAGE_DATA_URL_BYTES) {
    throw new Error("Business card image is too large for AI extraction");
  }

  const match = imageDataUrl.match(
    /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) {
    throw new Error("Business card image must be a JPEG, PNG, or WebP image");
  }

  return imageDataUrl;
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { imageDataUrl } = body;

    if (!imageDataUrl) {
      return Response.json(
        { error: "No business card image was provided" },
        { status: 400 },
      );
    }

    let base64DataUrl;
    try {
      base64DataUrl = getValidatedImageDataUrl(imageDataUrl);
    } catch (validationError) {
      return Response.json(
        {
          error:
            validationError instanceof Error
              ? validationError.message
              : "Business card image is invalid",
        },
        { status: 400 },
      );
    }

    const origin = new URL(request.url).origin;

    // Use ChatGPT vision-capable extraction with a strict JSON schema
    const extractionResponse = await fetch(
      `${origin}/integrations/chat-gpt/conversationgpt4`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "Extract contact fields from business card images. Return null for unknown fields. Include concise notes if a title, role, or context is present on the card.",
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
                notes: {
                  type: ["string", "null"],
                  description: "Short notes from the card such as title or role",
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
      const errorText = await extractionResponse.text();
      console.error("Business card extraction API error:", errorText);
      return Response.json(
        {
          error: "Failed to read business card",
          details: errorText || "The AI extraction service rejected the card image",
        },
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error reading business card",
      },
      { status: 500 },
    );
  }
}

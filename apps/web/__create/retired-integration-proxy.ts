export function retiredIntegrationProxy() {
  // Provider calls now originate only in protected, purpose-specific API routes.
  // Never forward browser cookies, authorization headers, or arbitrary AI prompts.
  return Response.json(
    { error: "Use the app's upload, transcription, or business card feature." },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET() {
  return Response.json({
    commitSha:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VITE_GIT_COMMIT_SHA ||
      null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    vercelUrl: process.env.VERCEL_URL || null,
    timestamp: new Date().toISOString(),
  });
}

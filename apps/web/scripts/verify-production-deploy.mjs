const target = process.env.VERIFY_DEPLOY_URL || "https://www.jumgogpt.app";
const expectedCommit =
  process.argv[2] ||
  process.env.EXPECTED_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  null;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.text();
}

function extractAsset(html, pattern) {
  const match = html.match(pattern);
  return match?.[1] || null;
}

async function main() {
  const version = await fetchJson(`${target}/api/version`);
  const html = await fetchHtml(target);

  const assets = {
    entryClient: extractAsset(html, /\/assets\/(entry\.client-[^"]+\.js)/),
    index: extractAsset(html, /\/assets\/(index-[^"]+\.js)/),
    root: extractAsset(html, /\/assets\/(root-[^"]+\.js)/),
  };

  console.log(JSON.stringify({
    target,
    expectedCommit,
    deployedCommit: version.commitSha,
    deploymentId: version.deploymentId,
    environment: version.environment,
    vercelUrl: version.vercelUrl,
    assets,
  }, null, 2));

  if (expectedCommit && version.commitSha !== expectedCommit) {
    console.error(
      `Production commit mismatch: expected ${expectedCommit} but got ${version.commitSha}.`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

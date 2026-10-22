const workspace = "/stewardship/society-letters";

function validVersion(version) {
  return (
    version?.environment === "production" &&
    /^[a-f0-9]{40}$/.test(version.commitSha || "") &&
    /^dpl_[A-Za-z0-9]+$/.test(version.deploymentId || "")
  );
}

export async function recoverLetterRelease(
  returnTo,
  { fetcher = fetch, signal } = {},
) {
  signal?.throwIfAborted();
  const destination = new URL(returnTo, "https://workspace.invalid");
  if (
    destination.origin !== "https://workspace.invalid" ||
    destination.pathname !== workspace
  )
    throw new Error("Invalid letter workspace destination.");
  destination.searchParams.delete("dpl");
  const path = destination.pathname + destination.search + destination.hash;
  const options = { cache: "no-store", redirect: "error", signal };
  async function version(credentials) {
    signal?.throwIfAborted();
    const response = await fetcher("/api/version", { ...options, credentials });
    if (!response.ok) throw new Error("Release lookup failed.");
    const value = await response.json();
    if (!validVersion(value)) throw new Error("Invalid release metadata.");
    return value;
  }

  // Refresh discovery at click time; an earlier notice may name an old release.
  const latest = await version("omit");
  signal?.throwIfAborted();
  const query = new URLSearchParams({
    expectedDeployment: latest.deploymentId,
    returnTo: path,
  });
  const response = await fetcher(
    `/api/stewardship/society-letters/reload?${query}`,
    {
      ...options,
      credentials: "same-origin",
      // A top-level navigation's cookie can override ?dpl=. An explicit fetch
      // header reaches the chosen release while still accepting its pin reset.
      headers: {
        accept: "application/json",
        "x-deployment-id": latest.deploymentId,
      },
    },
  );
  if (!response.ok) throw new Error("Release reset failed.");
  const receipt = await response.json();
  if (receipt.deploymentId !== latest.deploymentId || receipt.returnTo !== path)
    throw new Error("Release reset was not confirmed.");

  // Check normal authenticated routing, not another forced-release request.
  const restored = await version("same-origin");
  if (
    restored.deploymentId !== latest.deploymentId ||
    restored.commitSha !== latest.commitSha
  )
    throw new Error("The browser is not on the requested release.");
  if (signal?.aborted) throw new Error("Release update cancelled.");
  return path;
}

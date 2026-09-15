import { useQuery } from "@tanstack/react-query";

export default function useProspectPledgeStatus(viewerId, workspaceUserId) {
  return useQuery({
    queryKey: ["prospect-pledge-status", viewerId, workspaceUserId],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/prospect-pledge-status", {
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      if (
        !response.ok ||
        String(data.workspaceUserId) !== String(workspaceUserId)
      ) {
        throw new Error(
          "Saved pledge indicators are unavailable for this workspace.",
        );
      }
      return data;
    },
    enabled: Boolean(viewerId && workspaceUserId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

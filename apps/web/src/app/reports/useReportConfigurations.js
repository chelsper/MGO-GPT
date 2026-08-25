"use client";

import { useQuery } from "@tanstack/react-query";

export const REPORT_CONFIGURATIONS_QUERY_KEY = Object.freeze(["report-configurations"]);

export function normalizeReportConfigurationPayload(payload) {
  const configurations = Array.isArray(payload?.configurations) ? payload.configurations : [];

  return {
    configurations,
    canManage: Boolean(payload?.canManage),
  };
}

export function getVisibleReportConfigurations(configurations) {
  return (Array.isArray(configurations) ? configurations : []).filter(
    (configuration) => configuration?.canView === true,
  );
}

export async function fetchReportConfigurations({ signal } = {}) {
  const response = await fetch("/api/reports/configurations", {
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Could not load report configuration.");
  }
  return normalizeReportConfigurationPayload(payload);
}

export function useReportConfigurations({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: REPORT_CONFIGURATIONS_QUERY_KEY,
    queryFn: ({ signal }) => fetchReportConfigurations({ signal }),
    enabled,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  const configurations = query.data?.configurations || [];

  return {
    ...query,
    configurations,
    visibleReports: getVisibleReportConfigurations(configurations),
    canManage: Boolean(query.data?.canManage),
  };
}

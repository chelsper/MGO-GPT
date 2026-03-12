import { consumeBlackbaudState, exchangeBlackbaudCode, saveBlackbaudConnection } from "@/app/api/utils/blackbaud";

function redirectWithStatus(origin, redirectPath, params) {
  const url = new URL(redirectPath || "/settings", origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return Response.redirect(url, 302);
}

export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return redirectWithStatus(origin, "/settings", {
      blackbaud: "error",
      message: errorDescription || error,
    });
  }

  if (!code || !state) {
    return redirectWithStatus(origin, "/settings", {
      blackbaud: "error",
      message: "Missing Blackbaud authorization code or state.",
    });
  }

  const stateRow = await consumeBlackbaudState(state);
  if (!stateRow) {
    return redirectWithStatus(origin, "/settings", {
      blackbaud: "error",
      message: "Blackbaud authorization state expired. Please try again.",
    });
  }

  try {
    const connection = await exchangeBlackbaudCode({ code, origin });
    await saveBlackbaudConnection(stateRow.user_id, connection);

    return redirectWithStatus(origin, stateRow.redirect_path || "/settings", {
      blackbaud: "connected",
    });
  } catch (exchangeError) {
    return redirectWithStatus(origin, stateRow.redirect_path || "/settings", {
      blackbaud: "error",
      message:
        exchangeError instanceof Error
          ? exchangeError.message
          : "Failed to connect to Blackbaud.",
    });
  }
}

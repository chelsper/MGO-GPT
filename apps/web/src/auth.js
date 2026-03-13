import { getToken } from "@auth/core/jwt";
import { getContext } from "hono/context-storage";
import { isAllowedWorkspaceEmail } from "@/utils/authDomain";

function isSecureRequest(request) {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.includes("https");

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function resolveRequest(args) {
  if (args.length > 0 && args[0]) {
    return args[0]?.raw || args[0];
  }

  const context = getContext();
  return context?.req?.raw || null;
}

export async function auth(...args) {
  const request = resolveRequest(args);
  if (!request || !process.env.AUTH_SECRET) {
    return null;
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: isSecureRequest(request),
  });

  if (!token?.email || !isAllowedWorkspaceEmail(token.email)) {
    return null;
  }

  return {
    user: {
      id: token.sub,
      email: token.email,
      name: token.name,
      image: token.picture,
    },
    expires:
      typeof token.exp === "number"
        ? new Date(token.exp * 1000).toISOString()
        : "",
  };
}

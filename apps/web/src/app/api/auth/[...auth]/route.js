import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { loadArgon2 } from "../../utils/loadArgon2";

let authAppPromise;

// Vercel builds this route as its own Node function, so it does not inherit
// the websocket setup from the main Hono server entrypoint.
neonConfig.webSocketConstructor = ws;

async function getAuthApp() {
  if (authAppPromise) return authAppPromise;

  authAppPromise = (async () => {
    const authEnabled = Boolean(process.env.AUTH_SECRET && process.env.DATABASE_URL);
    if (!authEnabled) {
      return null;
    }

    const [{ Hono }, { initAuthConfig, authHandler }, { skipCSRFCheck }, { default: Credentials }, { Pool }, { default: NeonAdapter }] =
      await Promise.all([
        import("hono"),
        import("@hono/auth-js"),
        import("@auth/core"),
        import("@auth/core/providers/credentials"),
        import("@neondatabase/serverless"),
        import("../../../../../__create/adapter"),
      ]);

    const authApp = new Hono();
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = NeonAdapter(pool);

    authApp.use(
      "*",
      initAuthConfig(() => ({
        secret: process.env.AUTH_SECRET,
        trustHost: true,
        skipCSRFCheck,
        pages: {
          signIn: "/account/signin",
          signOut: "/account/logout",
          error: "/account/signin",
        },
        session: {
          strategy: "jwt",
        },
        callbacks: {
          session({ session, token }) {
            if (token.sub) {
              session.user.id = token.sub;
            }
            return session;
          },
        },
        providers: [
          Credentials({
            id: "credentials-signin",
            name: "Credentials Sign in",
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
              const { email, password } = credentials ?? {};
              if (!email || !password) return null;
              if (typeof email !== "string" || typeof password !== "string") return null;

              const user = await adapter.getUserByEmail(email);
              if (!user) return null;

              const matchingAccount = user.accounts.find(
                (account) => account.provider === "credentials"
              );
              const accountPassword = matchingAccount?.password;
              if (!accountPassword) return null;

              const { verify } = loadArgon2();
              const isValid = await verify(accountPassword, password);
              if (!isValid) return null;

              return user;
            },
          }),
          Credentials({
            id: "credentials-signup",
            name: "Credentials Sign up",
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" },
              name: { label: "Name", type: "text" },
              image: { label: "Image", type: "text", required: false },
            },
            authorize: async (credentials) => {
              const { email, password, name, image } = credentials ?? {};
              if (!email || !password) return null;
              if (typeof email !== "string" || typeof password !== "string") return null;

              const user = await adapter.getUserByEmail(email);
              if (user) return null;

              const newUser = await adapter.createUser({
                emailVerified: null,
                email,
                name: typeof name === "string" && name.length > 0 ? name : undefined,
                image: typeof image === "string" && image.length > 0 ? image : undefined,
              });

              const { hash } = loadArgon2();
              await adapter.linkAccount({
                extraData: {
                  password: await hash(password),
                },
                type: "credentials",
                userId: newUser.id,
                providerAccountId: newUser.id,
                provider: "credentials",
              });

              return newUser;
            },
          }),
        ],
      }))
    );

    authApp.use("*", authHandler());
    return authApp;
  })();

  return authAppPromise;
}

function misconfigured() {
  return new Response(
    JSON.stringify({
      error: "Auth misconfigured on server",
      details: "AUTH_SECRET and DATABASE_URL must be set",
    }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}

async function handleSession(request) {
  const [{ getToken }] = await Promise.all([import("@auth/core/jwt")]);
  const authUrl = process.env.AUTH_URL || "";
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: authUrl.startsWith("https"),
  });

  const session = token
    ? {
        user: {
          id: token.sub,
          email: token.email,
          name: token.name,
          image: token.picture,
        },
        expires: token.exp ? new Date(token.exp * 1000).toISOString() : null,
      }
    : null;

  return new Response(JSON.stringify(session), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function handle(request) {
  try {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname.endsWith("/session")) {
      return await handleSession(request);
    }

    const authApp = await getAuthApp();
    if (!authApp) return misconfigured();
    return await authApp.fetch(request);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Auth route crashed",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

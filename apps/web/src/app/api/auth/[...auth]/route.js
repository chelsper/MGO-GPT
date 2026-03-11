let authConfigPromise;

function rebuildAuthRequest(request, authPath) {
  const url = new URL(request.url);
  const normalizedPath = Array.isArray(authPath) ? authPath.join("/") : authPath || "";
  url.pathname = `/api/auth/${normalizedPath}`.replace(/\/+$/, "");

  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: request.redirect,
    ...(request.body ? { duplex: "half" } : {}),
  });
}

async function getAuthConfig() {
  if (authConfigPromise) return authConfigPromise;

  authConfigPromise = (async () => {
    const authEnabled = Boolean(process.env.AUTH_SECRET && process.env.DATABASE_URL);
    if (!authEnabled) {
      return null;
    }

    const [{ Auth, skipCSRFCheck }, { default: Credentials }, { Pool }, { default: NeonAdapter }] =
      await Promise.all([
        import("@auth/core"),
        import("@auth/core/providers/credentials"),
        import("@neondatabase/serverless"),
        import("../../../../../__create/adapter"),
      ]);

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = NeonAdapter(pool);

    return {
      Auth,
      config: {
        secret: process.env.AUTH_SECRET,
        trustHost: true,
        basePath: "/api/auth",
        skipCSRFCheck,
        adapter,
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

              const { verify } = await import("argon2");
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

              const { hash } = await import("argon2");
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
      },
    };
  })();

  return authConfigPromise;
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

async function handle(request, params) {
  try {
    const authSetup = await getAuthConfig();
    if (!authSetup) return misconfigured();

    const authRequest = rebuildAuthRequest(request, params?.auth);
    return await authSetup.Auth(authRequest, authSetup.config);
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

export async function GET(request, { params }) {
  return handle(request, params);
}

export async function POST(request, { params }) {
  return handle(request, params);
}

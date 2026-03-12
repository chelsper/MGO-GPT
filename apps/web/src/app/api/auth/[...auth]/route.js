import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

let authConfigPromise;

function isAllowedWorkspaceEmail(email) {
  if (typeof email !== "string") return false;
  const allowedDomain =
    process.env.WORKSPACE_EMAIL_DOMAIN?.toLowerCase() || "ju.edu";
  return email.trim().toLowerCase().endsWith(`@${allowedDomain}`);
}

async function getProvisioningDecision(email) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) return { kind: "none" };

  const bootstrapAdminEmail =
    process.env.WORKSPACE_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || "";

  const { rows: existingRows } = await globalThis.__mgoAuthPool.query(
    "SELECT id, role FROM users WHERE email = $1 LIMIT 1",
    [normalizedEmail],
  );
  if (existingRows.length > 0) {
    return { kind: "existing", role: existingRows[0].role };
  }

  if (bootstrapAdminEmail && normalizedEmail === bootstrapAdminEmail) {
    return { kind: "bootstrap-admin", role: "admin" };
  }

  const { rows: inviteRows } = await globalThis.__mgoAuthPool.query(
    `SELECT id, role
     FROM user_invitations
     WHERE email = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL
     LIMIT 1`,
    [normalizedEmail],
  );

  if (inviteRows.length > 0) {
    return { kind: "invited", role: inviteRows[0].role };
  }

  return { kind: "none" };
}

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

    const [{ Auth, skipCSRFCheck }, { default: Credentials }, oktaProviderModule, { Pool }, { default: NeonAdapter }] =
      await Promise.all([
        import("@auth/core"),
        import("@auth/core/providers/credentials"),
        import("@auth/core/providers/okta"),
        import("@neondatabase/serverless"),
        import("../../../../../__create/adapter"),
      ]);

    const Okta = oktaProviderModule.default;

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    globalThis.__mgoAuthPool = pool;
    await ensureAppSchema();
    const adapter = NeonAdapter(pool);
    const oktaEnabled = Boolean(
      process.env.OKTA_CLIENT_ID &&
        process.env.OKTA_CLIENT_SECRET &&
        process.env.OKTA_ISSUER,
    );
    const credentialsEnabled =
      process.env.AUTH_ALLOW_CREDENTIALS !== "false";

    const providers = [
      ...(oktaEnabled
        ? [
            Okta({
              clientId: process.env.OKTA_CLIENT_ID,
              clientSecret: process.env.OKTA_CLIENT_SECRET,
              issuer: process.env.OKTA_ISSUER,
            }),
          ]
        : []),
    ];

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
          async signIn({ user, profile }) {
            const email = user?.email || profile?.email;
            if (!isAllowedWorkspaceEmail(email)) return false;

            const decision = await getProvisioningDecision(email);
            return decision.kind !== "none";
          },
          session({ session, token }) {
            if (token.sub) {
              session.user.id = token.sub;
            }
            return session;
          },
        },
        providers: [
          ...providers,
          ...(credentialsEnabled
            ? [
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
                    if (typeof email !== "string" || typeof password !== "string")
                      return null;
                    if (!isAllowedWorkspaceEmail(email)) return null;

                    const user = await adapter.getUserByEmail(email);
                    if (!user) return null;

                    const matchingAccount = user.accounts.find(
                      (account) => account.provider === "credentials",
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
                    if (typeof email !== "string" || typeof password !== "string")
                      return null;
                    if (!isAllowedWorkspaceEmail(email)) return null;

                    const decision = await getProvisioningDecision(email);
                    if (decision.kind === "none") return null;

                    const user = await adapter.getUserByEmail(email);
                    if (user) return null;

                    const newUser = await adapter.createUser({
                      emailVerified: null,
                      email,
                      name:
                        typeof name === "string" && name.length > 0
                          ? name
                          : undefined,
                      image:
                        typeof image === "string" && image.length > 0
                          ? image
                          : undefined,
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
              ]
            : []),
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

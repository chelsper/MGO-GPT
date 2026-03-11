import { skipCSRFCheck } from "@auth/core";
import Credentials from "@auth/core/providers/credentials";
import { authHandler, initAuthConfig } from "@hono/auth-js";
import { Pool } from "@neondatabase/serverless";
import { hash, verify } from "argon2";
import { Hono } from "hono";
import NeonAdapter from "../../../../__create/adapter";

const authApp = new Hono();
const authEnabled = Boolean(process.env.AUTH_SECRET && process.env.DATABASE_URL);

if (authEnabled) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = NeonAdapter(pool);

  authApp.use(
    "*",
    initAuthConfig((c) => ({
      secret: c.env.AUTH_SECRET,
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
}

const misconfigured = () =>
  new Response(
    JSON.stringify({
      error: "Auth misconfigured on server",
      details: "AUTH_SECRET and DATABASE_URL must be set",
    }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );

export async function GET(request) {
  if (!authEnabled) return misconfigured();
  return authApp.fetch(request);
}

export async function POST(request) {
  if (!authEnabled) return misconfigured();
  return authApp.fetch(request);
}

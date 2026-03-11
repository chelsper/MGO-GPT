import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password, name, role } = body;

    if (!email || !password || !name) {
      return Response.json(
        { error: "Email, password, and name are required" },
        { status: 400 },
      );
    }

    // Validate password
    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }
    if (!/[a-zA-Z]/.test(password)) {
      return Response.json(
        { error: "Password must contain at least one letter" },
        { status: 400 },
      );
    }
    if (!/[0-9]/.test(password)) {
      return Response.json(
        { error: "Password must contain at least one number" },
        { status: 400 },
      );
    }

    // Validate role
    const validRoles = ["mgo", "reviewer"];
    const userRole = role && validRoles.includes(role) ? role : "mgo";

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      return Response.json(
        { error: "An account with this email already exists" },
        { status: 400 },
      );
    }

    // Lazy-load argon2 so route registration does not crash if native bindings fail at startup.
    const { hash } = await import("argon2");
    const hashedPassword = await hash(password);

    // Create user in users table
    const result = await sql`
      INSERT INTO users (name, email, role, created_at)
      VALUES (${name}, ${email}, ${userRole}, NOW())
      RETURNING id, name, email, role
    `;

    // Create auth user (this is handled by the platform's auth system)
    // The platform will automatically create the auth entry when we return success

    return Response.json(
      {
        success: true,
        user: result[0],
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Signup error:", error);
    return Response.json(
      { error: "Failed to create account" },
      { status: 500 },
    );
  }
}

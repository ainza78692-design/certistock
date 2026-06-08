import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, loadUserByEmail, requireUser, signToken, verifyPassword } from "../auth.js";
import { withTransaction } from "../db.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().trim().min(1).optional(),
  companyName: z.string().trim().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/signup", async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const email = input.email.toLowerCase();
    const existing = await loadUserByEmail(email);
    if (existing) {
      return reply.code(400).send({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(input.password);

    const created = await withTransaction(async (client) => {
      const userResult = await client.query<{
        id: string;
        email: string;
      }>(
        `
          insert into app_users(email, password_hash)
          values ($1, $2)
          returning id, email
        `,
        [email, passwordHash],
      );

      const companyResult = await client.query<{ id: string }>(
        `
          insert into companies(name)
          values ($1)
          returning id
        `,
        [input.companyName || "CertiStock Company"],
      );

      const user = userResult.rows[0];
      const company = companyResult.rows[0];

      await client.query(
        `
          insert into profiles(id, company_id, full_name, email)
          values ($1, $2, $3, $4)
        `,
        [user.id, company.id, input.fullName ?? null, user.email],
      );

      await client.query(
        `
          insert into user_roles(user_id, company_id, role)
          values ($1, $2, 'owner')
        `,
        [user.id, company.id],
      );

      return {
        id: user.id,
        email: user.email,
        companyId: company.id,
        role: "owner",
        fullName: input.fullName ?? null,
      };
    });

    return reply.send({ user: created, token: signToken(created) });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await loadUserByEmail(input.email);

    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    await withTransaction(async (client) => {
      await client.query(`update app_users set last_login_at = now() where id = $1`, [user.id]);
      return null;
    });

    const authUser = {
      id: user.id,
      email: user.email,
      companyId: user.company_id,
      role: user.role,
      fullName: user.full_name,
    };

    return reply.send({ user: authUser, token: signToken(authUser) });
  });

  app.get("/api/auth/me", { preHandler: requireUser }, async (request) => {
    return { user: request.user };
  });
}

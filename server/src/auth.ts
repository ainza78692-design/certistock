import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { query } from "./db.js";

export type AuthUser = {
  id: string;
  email: string;
  companyId: string;
  role: string;
  fullName: string | null;
};

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    issuer: "certistock-local",
  } as jwt.SignOptions);
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const queryToken = typeof (request.query as any)?.token === "string" ? (request.query as any).token : null;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;

  if (!token) {
    return reply.code(401).send({ error: "Missing authorization token" });
  }

  try {
    const user = jwt.verify(token, config.jwtSecret, {
      issuer: "certistock-local",
    }) as AuthUser;

    const result = await query(
      `select 1
       from app_users u
       join profiles p on p.id = u.id
       join companies c on c.id = p.company_id
       where u.id = $1
         and p.company_id = $2
         and u.is_active = true
       limit 1`,
      [user.id, user.companyId],
    );

    if (!result.rows[0]) {
      return reply.code(401).send({ error: "Session is no longer valid. Please sign in again." });
    }

    request.user = user;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}

export async function loadUserByEmail(email: string) {
  const result = await query<{
    id: string;
    email: string;
    password_hash: string;
    full_name: string | null;
    company_id: string;
    role: string;
  }>(
    `
      select
        u.id,
        u.email,
        u.password_hash,
        p.full_name,
        p.company_id,
        coalesce(ur.role::text, 'operator') as role
      from app_users u
      join profiles p on p.id = u.id
      left join lateral (
        select role
        from user_roles
        where user_id = u.id and company_id = p.company_id
        order by created_at asc
        limit 1
      ) ur on true
      where lower(u.email) = lower($1)
        and u.is_active = true
      limit 1
    `,
    [email],
  );

  return result.rows[0] ?? null;
}

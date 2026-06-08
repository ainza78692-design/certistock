import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { query } from "../db.js";

const entityTables = {
  suppliers: {
    table: "suppliers",
    nameField: "supplier_name",
    allowed: [
      "supplier_name", "legal_name", "address", "city", "state", "country", "postal_code",
      "sc_number", "te_id", "license_no", "client_no", "contact_person", "contact_email",
      "contact_phone", "notes",
    ],
  },
  customers: {
    table: "customers",
    nameField: "customer_name",
    allowed: [
      "customer_name", "legal_name", "address", "city", "state", "country", "postal_code",
      "te_id", "license_no", "contact_person", "contact_email", "contact_phone", "notes",
    ],
  },
} as const;

const bodySchema = z.record(z.any());
const cleanEntityName = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

export async function registerEntityRoutes(app: FastifyInstance) {
  app.get("/api/:entity(suppliers|customers)", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const { entity } = request.params as { entity: keyof typeof entityTables };
    const meta = entityTables[entity];
    const result = await query(
      `select * from ${meta.table} where company_id = $1 order by created_at desc`,
      [companyId],
    );
    return result.rows;
  });

  app.post("/api/:entity(suppliers|customers)", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { entity } = request.params as { entity: keyof typeof entityTables };
    const meta = entityTables[entity];
    const input = bodySchema.parse(request.body);
    const data = Object.fromEntries(
      Object.entries(input).filter(([key]) => meta.allowed.includes(key as any)),
    );

    const name = cleanEntityName(data[meta.nameField]);
    if (!name) return reply.code(400).send({ error: `${meta.nameField} is required` });
    data[meta.nameField] = name;

    const existing = await query(
      `select * from ${meta.table}
       where company_id = $1 and lower(btrim(${meta.nameField})) = lower(btrim($2))
       order by created_at asc
       limit 1`,
      [companyId, name],
    );
    if (existing.rows[0]) return existing.rows[0];

    const columns = ["company_id", ...Object.keys(data)];
    const values = [companyId, ...Object.values(data)];
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

    const result = await query(
      `insert into ${meta.table}(${columns.join(", ")}) values (${placeholders}) returning *`,
      values,
    );
    return result.rows[0];
  });
}

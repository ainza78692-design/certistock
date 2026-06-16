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

async function listEntities(entity: keyof typeof entityTables, companyId: string) {
  const meta = entityTables[entity];
  const result = await query(
    `select * from ${meta.table} where company_id = $1 order by created_at desc`,
    [companyId],
  );
  return result.rows;
}

async function createEntity(entity: keyof typeof entityTables, companyId: string, body: unknown, reply: any) {
  const meta = entityTables[entity];
  const input = bodySchema.parse(body);
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
}

async function updateEntity(entity: keyof typeof entityTables, companyId: string, id: string, body: unknown, reply: any) {
  const meta = entityTables[entity];
  const input = bodySchema.parse(body);
  const data = Object.fromEntries(
    Object.entries(input).filter(([key]) => meta.allowed.includes(key as any)),
  );

  const name = cleanEntityName(data[meta.nameField]);
  if (!name) return reply.code(400).send({ error: `${meta.nameField} is required` });
  data[meta.nameField] = name;

  const duplicate = await query(
    `select id from ${meta.table}
     where company_id = $1
       and lower(btrim(${meta.nameField})) = lower(btrim($2))
       and id <> $3
     order by created_at asc
     limit 1`,
    [companyId, name, id],
  );
  if (duplicate.rows[0]) {
    return reply.code(400).send({ error: `${entity.slice(0, -1)} with this name already exists` });
  }

  const entries = Object.entries(data);
  if (!entries.length) return reply.code(400).send({ error: "No fields to update" });

  const values = [...entries.map(([, value]) => value), companyId, id];
  const assignments = entries.map(([key], index) => `${key} = $${index + 1}`);
  assignments.push(`updated_at = now()`);

  const result = await query(
    `update ${meta.table}
     set ${assignments.join(", ")}
     where company_id = $${entries.length + 1} and id = $${entries.length + 2}
     returning *`,
    values,
  );
  if (!result.rows[0]) return reply.code(404).send({ error: `${entity.slice(0, -1)} not found` });
  return result.rows[0];
}

async function deleteEntity(entity: keyof typeof entityTables, companyId: string, id: string, reply: any) {
  const meta = entityTables[entity];

  const usage = entity === "suppliers"
    ? await query(
      `select count(*)::int as count
       from transaction_certificates
       where company_id = $1 and supplier_id = $2`,
      [companyId, id],
    )
    : await query(
      `select count(*)::int as count
       from outward_sales
       where company_id = $1 and customer_id = $2`,
      [companyId, id],
    );

  if ((usage.rows[0] as any)?.count > 0) {
    const label = entity === "suppliers" ? "certificates" : "outward sales";
    return reply.code(400).send({ error: `Cannot delete this ${entity.slice(0, -1)} because it is still used by ${label}.` });
  }

  const result = await query(
    `delete from ${meta.table} where company_id = $1 and id = $2 returning id`,
    [companyId, id],
  );
  if (!result.rows[0]) return reply.code(404).send({ error: `${entity.slice(0, -1)} not found` });
  return { ok: true };
}

export async function registerEntityRoutes(app: FastifyInstance) {
  app.get("/api/customers", { preHandler: requireUser }, async (request) =>
    listEntities("customers", request.user!.companyId));
  app.post("/api/customers", { preHandler: requireUser }, async (request, reply) =>
    createEntity("customers", request.user!.companyId, request.body, reply));
  app.put("/api/customers/:id", { preHandler: requireUser }, async (request, reply) =>
    updateEntity("customers", request.user!.companyId, (request.params as { id: string }).id, request.body, reply));
  app.delete("/api/customers/:id", { preHandler: requireUser }, async (request, reply) =>
    deleteEntity("customers", request.user!.companyId, (request.params as { id: string }).id, reply));

  app.get("/api/suppliers", { preHandler: requireUser }, async (request) =>
    listEntities("suppliers", request.user!.companyId));
  app.post("/api/suppliers", { preHandler: requireUser }, async (request, reply) =>
    createEntity("suppliers", request.user!.companyId, request.body, reply));
  app.put("/api/suppliers/:id", { preHandler: requireUser }, async (request, reply) =>
    updateEntity("suppliers", request.user!.companyId, (request.params as { id: string }).id, request.body, reply));
  app.delete("/api/suppliers/:id", { preHandler: requireUser }, async (request, reply) =>
    deleteEntity("suppliers", request.user!.companyId, (request.params as { id: string }).id, reply));
}

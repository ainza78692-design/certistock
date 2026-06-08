import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { query } from "../db.js";

const productSchema = z.object({
  normalized_key: z.string().trim().min(1),
  display_name: z.string().trim().min(1),
  product_family: z.string().trim().optional().nullable(),
  material: z.string().trim().optional().nullable(),
  default_unit: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
});

const aliasSchema = z.object({
  product_master_id: z.string().uuid(),
  alias_text: z.string().trim().min(1),
  alias_type: z.string().trim().optional(),
});

export async function registerProductRoutes(app: FastifyInstance) {
  app.get("/api/product-master", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const result = await query(
      `select
         pm.*,
         coalesce(json_agg(pa order by pa.created_at) filter (where pa.id is not null), '[]') as product_aliases
       from product_master pm
       left join product_aliases pa on pa.product_master_id = pm.id
       where pm.company_id = $1
       group by pm.id
       order by pm.normalized_key`,
      [companyId],
    );
    return result.rows;
  });

  app.post("/api/product-master", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const input = productSchema.parse(request.body);
    const result = await query(
      `insert into product_master(
         company_id, normalized_key, display_name, product_family, material, default_unit, description
       ) values ($1, $2, $3, $4, coalesce($5, 'Recycled Polyester'), coalesce($6, 'kg'), $7)
       on conflict(company_id, normalized_key)
       do update set
         display_name = excluded.display_name,
         product_family = excluded.product_family,
         material = excluded.material,
         default_unit = excluded.default_unit,
         description = excluded.description,
         updated_at = now()
       returning *`,
      [
        companyId,
        input.normalized_key,
        input.display_name,
        input.product_family ?? null,
        input.material ?? null,
        input.default_unit ?? null,
        input.description ?? null,
      ],
    );
    return result.rows[0];
  });

  app.post("/api/product-aliases", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const input = aliasSchema.parse(request.body);
    const product = await query(
      `select id from product_master where id = $1 and company_id = $2`,
      [input.product_master_id, companyId],
    );
    if (!product.rows[0]) return reply.code(404).send({ error: "Product not found" });

    const result = await query(
      `insert into product_aliases(company_id, product_master_id, alias_text, alias_type)
       values ($1, $2, $3, $4)
       returning *`,
      [companyId, input.product_master_id, input.alias_text, input.alias_type ?? "manual_alias"],
    );
    return result.rows[0];
  });

  app.delete("/api/product-aliases/:id", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `delete from product_aliases where id = $1 and company_id = $2 returning id`,
      [id, companyId],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Alias not found" });
    return { ok: true };
  });

  app.get("/api/product-stock-summary", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const result = await query(
      `select normalized_yarn_key, sum(remaining_stock_kg)::numeric(14,3) as remaining_stock_kg
       from product_lots
       where company_id = $1
       group by normalized_yarn_key`,
      [companyId],
    );
    return result.rows;
  });
}

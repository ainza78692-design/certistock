import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdminDeletePin } from "../adminActions.js";
import { requireUser } from "../auth.js";
import { query, withTransaction } from "../db.js";
import {
  normalizedIncomingYarnKey,
  reconcileIncomingStockForInvoices,
  splitInvoiceReferences,
} from "../incomingStock.js";

const incomingStockSchema = z.object({
  invoice_no: z.string().trim().min(1),
  yarn_count: z.string().trim().min(1),
  net_weight_kg: z.coerce.number().positive(),
  shipment_date: z.string().trim().min(1),
});

const reconcileSchema = z.object({
  tc_id: z.string().uuid().optional(),
  invoice_references: z.array(z.string()).optional().default([]),
});

const bulkDeleteSchema = z.object({
  pin: z.string().trim().min(1),
  ids: z.array(z.string().uuid()).optional().default([]),
});

const bulkImportSchema = z.object({
  rows: z.array(z.object({
    invoice_no: z.string().trim().min(1),
    yarn_count: z.string().trim().min(1),
    net_weight_kg: z.coerce.number().positive(),
    shipment_date: z.string().trim().min(1),
  })).min(1),
});

export async function registerIncomingStockRoutes(app: FastifyInstance) {
  app.get("/api/incoming-stock", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const result = await query(
      `select *
       from incoming_stock
       where company_id = $1 and matched_tc_id is null
       order by shipment_date desc, created_at desc`,
      [companyId],
    );
    return result.rows;
  });

  app.post("/api/incoming-stock", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const input = incomingStockSchema.parse(request.body);
    const normalizedKey = normalizedIncomingYarnKey(input.yarn_count);

    const duplicate = await query(
      `select id from incoming_stock
       where company_id = $1
         and matched_tc_id is null
         and lower(btrim(invoice_no)) = lower(btrim($2))
       limit 1`,
      [user.companyId, input.invoice_no],
    );
    if (duplicate.rows[0]) {
      return reply.code(400).send({ error: "Incoming stock already exists for this invoice" });
    }

    const result = await query(
      `insert into incoming_stock(
         company_id, invoice_no, yarn_count, normalized_yarn_key,
         net_weight_kg, shipment_date, created_by
       ) values ($1,$2,$3,$4,$5,$6,$7)
       returning *`,
      [
        user.companyId,
        input.invoice_no,
        input.yarn_count,
        normalizedKey,
        input.net_weight_kg,
        input.shipment_date,
        user.id,
      ],
    );
    return reply.code(201).send(result.rows[0]);
  });

  app.put("/api/incoming-stock/:id", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const input = incomingStockSchema.parse(request.body);
    const normalizedKey = normalizedIncomingYarnKey(input.yarn_count);

    const duplicate = await query(
      `select id from incoming_stock
       where company_id = $1
         and id <> $2
         and matched_tc_id is null
         and lower(btrim(invoice_no)) = lower(btrim($3))
       limit 1`,
      [user.companyId, id, input.invoice_no],
    );
    if (duplicate.rows[0]) {
      return reply.code(400).send({ error: "Incoming stock already exists for this invoice" });
    }

    const result = await query(
      `update incoming_stock
       set invoice_no = $1,
           yarn_count = $2,
           normalized_yarn_key = $3,
           net_weight_kg = $4,
           shipment_date = $5,
           updated_at = now()
       where id = $6 and company_id = $7 and matched_tc_id is null
       returning *`,
      [
        input.invoice_no,
        input.yarn_count,
        normalizedKey,
        input.net_weight_kg,
        input.shipment_date,
        id,
        user.companyId,
      ],
    );

    if (!result.rows[0]) return reply.code(404).send({ error: "Incoming stock not found" });
    return result.rows[0];
  });

  app.delete("/api/incoming-stock/:id", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `delete from incoming_stock
       where id = $1 and company_id = $2 and matched_tc_id is null
       returning id`,
      [id, companyId],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Incoming stock not found" });
    return { ok: true };
  });

  app.post("/api/incoming-stock/delete-all", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const input = bulkDeleteSchema.parse(request.body || {});
    assertAdminDeletePin(input.pin);

    const result = await query(
      `delete from incoming_stock
       where company_id = $1
         and matched_tc_id is null
         and (
           cardinality($2::uuid[]) = 0
           or id = any($2::uuid[])
         )
       returning id`,
      [user.companyId, input.ids],
    );

    return reply.send({ ok: true, deletedCount: result.rowCount || 0 });
  });

  app.post("/api/incoming-stock/reconcile", { preHandler: requireUser }, async (request) => {
    const user = request.user!;
    const input = reconcileSchema.parse(request.body || {});

    const result = await withTransaction(async (client) => {
      let invoiceReferences = input.invoice_references;
      let tcId = input.tc_id || null;

      if (tcId) {
        const shipments = await client.query(
          `select invoice_reference
           from shipments
           where company_id = $1 and transaction_certificate_id = $2`,
          [user.companyId, tcId],
        );
        invoiceReferences = shipments.rows.map((row: any) => row.invoice_reference).filter(Boolean);
      }

      if (!tcId) {
        const references = invoiceReferences.flatMap(splitInvoiceReferences);
        tcId = null;
        const matched = await client.query(
          `delete from incoming_stock
           where company_id = $1
             and upper(btrim(invoice_no)) = any($2::text[])
           returning *`,
          [user.companyId, references],
        );
        return { matched: matched.rows, matchedCount: matched.rowCount || 0 };
      }

      return reconcileIncomingStockForInvoices({
        client,
        companyId: user.companyId,
        tcId,
        invoiceReferences,
      });
    });

    return { ok: true, ...result };
  });

  app.post("/api/incoming-stock/bulk", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const { rows } = bulkImportSchema.parse(request.body);

    const result = await withTransaction(async (client) => {
      let inserted = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const normalizedKey = normalizedIncomingYarnKey(row.yarn_count);
        try {
          const duplicate = await client.query(
            `select id from incoming_stock
             where company_id = $1
               and matched_tc_id is null
               and lower(btrim(invoice_no)) = lower(btrim($2))
             limit 1`,
            [user.companyId, row.invoice_no],
          );
          if (duplicate.rows[0]) {
            skipped++;
            continue;
          }
          await client.query(
            `insert into incoming_stock(
               company_id, invoice_no, yarn_count, normalized_yarn_key,
               net_weight_kg, shipment_date, created_by
             ) values ($1,$2,$3,$4,$5,$6,$7)`,
            [user.companyId, row.invoice_no, row.yarn_count, normalizedKey,
             row.net_weight_kg, row.shipment_date, user.id],
          );
          inserted++;
        } catch (err: any) {
          errors.push(`${row.invoice_no}: ${err.message}`);
        }
      }
      return { inserted, skipped, errors };
    });

    return reply.code(201).send({ ok: true, ...result });
  });
}

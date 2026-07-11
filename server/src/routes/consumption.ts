import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdminDeletePin } from "../adminActions.js";
import { requireUser } from "../auth.js";
import { query, withTransaction } from "../db.js";
import { renderAndStoreMassBalance } from "../massBalance.js";
import { cleanupUnusedCustomers } from "../entityCleanup.js";
import { buildCombinedProductName } from "../productName.js";
import { cleanCompositionName } from "../compositionName.js";

const consumptionSchema = z.object({
  productLotId: z.string().uuid(),
  consumedWeightKg: z.coerce.number().positive(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().optional().nullable(),
  newCustomer: z.string().optional().nullable(),
  consumptionDate: z.string().optional().nullable(),
  lossPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  importBatchId: z.string().uuid().optional().nullable(),
  importedRowIndex: z.coerce.number().int().positive().optional().nullable(),
  importedAt: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  outwardSale: z.object({
    outward_invoice_no: z.string().optional().nullable(),
    outward_invoice_date: z.string().optional().nullable(),
    outward_tc_no: z.string().optional().nullable(),
    product_name: z.string().optional().nullable(),
    normalized_yarn_key: z.string().optional().nullable(),
    outward_net_weight_kg: z.coerce.number().optional().nullable(),
    outward_gross_weight_kg: z.coerce.number().optional().nullable(),
    outward_certified_weight_kg: z.coerce.number().optional().nullable(),
    transport_doc_no: z.string().optional().nullable(),
    vehicle_no: z.string().optional().nullable(),
    destination: z.string().optional().nullable(),
  }).optional().default({}),
  outwardCertifiedWeightKg: z.coerce.number().optional().nullable(),
  invoiceNo: z.string().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  outwardNetWeightKg: z.coerce.number().optional().nullable(),
  outwardGrossWeightKg: z.coerce.number().optional().nullable(),
  transportDoc: z.string().optional().nullable(),
  allowDuplicatePair: z.boolean().optional().default(false),
});

const bulkDeleteConsumptionSchema = z.object({
  pin: z.string().trim().min(1),
  ids: z.array(z.string().uuid()).optional().default([]),
});

const cleanEntityName = (value: string | null | undefined) =>
  String(value || "").replace(/\s+/g, " ").trim();
const normalizeDuplicateField = (value: string | null | undefined) =>
  String(value || "").replace(/\s+/g, " ").trim().toUpperCase();

export async function registerConsumptionRoutes(app: FastifyInstance) {
  app.post("/api/consumption", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const input = consumptionSchema.parse(request.body);
    const outwardInvoiceNo = input.outwardSale.outward_invoice_no || input.invoiceNo || null;
    const transportDocNo = input.outwardSale.transport_doc_no || input.transportDoc || null;
    const duplicateInvoiceNo = normalizeDuplicateField(outwardInvoiceNo);
    const duplicateTransportDocNo = normalizeDuplicateField(transportDocNo);

    if (duplicateInvoiceNo && duplicateTransportDocNo && !input.allowDuplicatePair) {
      const existingDuplicate = await query<any>(
        `select id, outward_invoice_no, transport_doc_no, created_at
         from outward_sales
         where company_id = $1
           and upper(btrim(coalesce(outward_invoice_no, ''))) = $2
           and upper(btrim(coalesce(transport_doc_no, ''))) = $3
         order by created_at desc
         limit 1`,
        [user.companyId, duplicateInvoiceNo, duplicateTransportDocNo],
      );
      if (existingDuplicate.rows[0]) {
        return reply.code(409).send({
          ok: false,
          error: "Consumption has already been processed for this Invoice Number and E-Way Bill Number combination. Do you want to process it again?",
          duplicate: {
            outward_invoice_no: existingDuplicate.rows[0].outward_invoice_no,
            transport_doc_no: existingDuplicate.rows[0].transport_doc_no,
            existing_outward_sale_id: existingDuplicate.rows[0].id,
            existing_created_at: existingDuplicate.rows[0].created_at,
          },
        });
      }
    }

    const result = await withTransaction(async (client) => {
      const lotResult = await client.query<any>(
        `select id, company_id, additional_info_raw, normalized_yarn_key, product_category, product_detail, material_composition
         from product_lots
         where id = $1 and company_id = $2
         for update`,
        [input.productLotId, user.companyId],
      );
      const lot = lotResult.rows[0];
      if (!lot) throw new Error("Product lot not found");

      let customerId = input.customerId ?? null;
      let customerName = cleanEntityName(input.customerName) || null;
      const newCustomer = cleanEntityName(input.newCustomer);

      if (!customerId && newCustomer) {
        let customer = await client.query<any>(
          `select id, customer_name
           from customers
           where company_id = $1 and lower(btrim(customer_name)) = lower(btrim($2))
           order by created_at asc
           limit 1`,
          [user.companyId, newCustomer],
        );
        if (!customer.rows[0]) {
          customer = await client.query<any>(
            `insert into customers(company_id, customer_name)
             values ($1, $2)
             returning id, customer_name`,
            [user.companyId, newCustomer],
          );
        }
        customerId = customer.rows[0].id;
        customerName = customer.rows[0].customer_name;
      }

      if (customerId && !customerName) {
        const customer = await client.query<any>(
          `select customer_name from customers where id = $1 and company_id = $2`,
          [customerId, user.companyId],
        );
        customerName = customer.rows[0]?.customer_name ?? null;
      }

      if (!customerId && !customerName) throw new Error("Customer required");

      const requestedLossPercent = input.lossPercent == null ? null : Number(input.lossPercent);
      const explicitOutwardCertified = input.outwardCertifiedWeightKg ?? input.outwardSale.outward_certified_weight_kg ?? null;
      const calculatedOutwardCertified = requestedLossPercent == null
        ? input.consumedWeightKg
        : input.consumedWeightKg * (1 - requestedLossPercent / 100);
      const outwardCertified = Number(explicitOutwardCertified ?? calculatedOutwardCertified);
      const combinedProductName = buildCombinedProductName([
        lot.product_category,
        lot.product_detail,
        lot.material_composition,
      ]);
      const requestedProductName = cleanCompositionName(input.outwardSale.product_name);
      const fallbackProductName = cleanCompositionName(combinedProductName || lot.additional_info_raw);

      const sale = await client.query<any>(
        `insert into outward_sales(
           company_id, customer_id, outward_invoice_no, outward_invoice_date, outward_tc_no,
           customer_name_snapshot, product_name, normalized_yarn_key, outward_net_weight_kg,
           outward_gross_weight_kg, outward_certified_weight_kg, transport_doc_no, vehicle_no,
           destination, created_by
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         returning *`,
        [
          user.companyId,
          customerId,
          input.outwardSale.outward_invoice_no || input.invoiceNo || null,
          input.outwardSale.outward_invoice_date || input.invoiceDate || input.consumptionDate || null,
          input.outwardSale.outward_tc_no || null,
          customerName,
          requestedProductName || fallbackProductName || null,
          input.outwardSale.normalized_yarn_key || lot.normalized_yarn_key || null,
          input.outwardSale.outward_net_weight_kg ?? input.outwardNetWeightKg ?? null,
          input.outwardSale.outward_gross_weight_kg ?? input.outwardGrossWeightKg ?? null,
          Number.isFinite(outwardCertified) ? outwardCertified : input.consumedWeightKg,
          transportDocNo,
          input.outwardSale.vehicle_no || null,
          input.outwardSale.destination || null,
          user.id,
        ],
      );

      const consumption = await client.query<any>(
        `select * from consume_stock_local($1, $2, $3, $4, $5, $6, $7)`,
        [
          user.companyId,
          user.id,
          input.productLotId,
          sale.rows[0].id,
          input.consumedWeightKg,
          Number.isFinite(outwardCertified) ? outwardCertified : input.consumedWeightKg,
          input.remarks ?? null,
        ],
      );

      const consumptionMeta = await client.query<any>(
        `update consumption_entries
         set consumption_date = coalesce($1, consumption_date),
             import_batch_id = $2,
             imported_row_index = $3,
             imported_at = $4
         where id = $5 and company_id = $6
         returning *`,
        [
          input.consumptionDate || null,
          input.importBatchId || null,
          input.importedRowIndex ?? null,
          input.importedAt || null,
          consumption.rows[0].id,
          user.companyId,
        ],
      );

      return { consumption: consumptionMeta.rows[0] ?? consumption.rows[0], outwardSale: sale.rows[0] };
    });

    let xlsx = { status: "ready", error: null as string | null, workbook: null as any };
    try {
      const workbook = await renderAndStoreMassBalance(user.companyId, input.productLotId);
      xlsx = { status: "ready", error: null, workbook };
    } catch (error) {
      xlsx = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        workbook: null,
      };
    }

    return reply.send({ ok: true, ...result, xlsx });
  });

  const bulkDeleteConsumption = async (request: any, reply: any) => {
    const user = request.user!;
    const input = bulkDeleteConsumptionSchema.parse(request.body || {});
    assertAdminDeletePin(input.pin);

    const targetEntries = await query<any>(
      `select id
       from consumption_entries
       where company_id = $1
         and (
           cardinality($2::uuid[]) = 0
           or id = any($2::uuid[])
         )
       order by consumption_date desc nulls last, created_at desc`,
      [user.companyId, input.ids],
    );

    const targetIds = targetEntries.rows.map((row: any) => row.id);
    if (!targetIds.length) {
      return reply.send({ ok: true, deletedCount: 0, xlsx: { status: "ready", failedLotIds: [] } });
    }

    const reversed = await withTransaction(async (client) => {
      const results: any[] = [];
      for (const entryId of targetIds) {
        const result = await client.query<any>(
          `select reverse_consumption_local($1, $2, $3, $4) as result`,
          [user.companyId, user.id, entryId, "Bulk delete from Consumption page"],
        );
        results.push(result.rows[0].result);
      }
      return results;
    });

    await cleanupUnusedCustomers({ query }, user.companyId);

    const productLotIds = Array.from(
      new Set(reversed.map((item: any) => item.product_lot_id).filter(Boolean)),
    );

    const failedLotIds: string[] = [];
    for (const productLotId of productLotIds) {
      try {
        await renderAndStoreMassBalance(user.companyId, productLotId);
      } catch {
        failedLotIds.push(productLotId);
      }
    }

    return reply.send({
      ok: true,
      deletedCount: reversed.length,
      xlsx: {
        status: failedLotIds.length ? "partial" : "ready",
        failedLotIds,
      },
    });
  };

  app.post("/api/consumption/delete-all", { preHandler: requireUser }, bulkDeleteConsumption);
  app.post("/api/consumption/bulk-delete", { preHandler: requireUser }, bulkDeleteConsumption);

  app.delete("/api/consumption/:id", { preHandler: requireUser }, async (request) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const reason = (request.query as any)?.reason || "Deleted from local API";
    const result = await query<any>(
      `select reverse_consumption_local($1, $2, $3, $4) as result`,
      [user.companyId, user.id, id, reason],
    );
    await cleanupUnusedCustomers({ query }, user.companyId);
    const payload = result.rows[0].result;

    let xlsx = { status: "ready", error: null as string | null, workbook: null as any };
    try {
      const workbook = await renderAndStoreMassBalance(user.companyId, payload.product_lot_id);
      xlsx = { status: "ready", error: null, workbook };
    } catch (error) {
      xlsx = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        workbook: null,
      };
    }

    return {
      ok: true,
      productLotId: payload.product_lot_id,
      ...payload,
      xlsx,
    };
  });
}

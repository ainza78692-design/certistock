import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { query, withTransaction } from "../db.js";
import { renderAndStoreMassBalance } from "../massBalance.js";

const consumptionSchema = z.object({
  productLotId: z.string().uuid(),
  consumedWeightKg: z.coerce.number().positive(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().optional().nullable(),
  newCustomer: z.string().optional().nullable(),
  consumptionDate: z.string().optional().nullable(),
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
});

const cleanEntityName = (value: string | null | undefined) =>
  String(value || "").replace(/\s+/g, " ").trim();

export async function registerConsumptionRoutes(app: FastifyInstance) {
  app.post("/api/consumption", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const input = consumptionSchema.parse(request.body);

    const result = await withTransaction(async (client) => {
      const lotResult = await client.query<any>(
        `select id, company_id, additional_info_raw, normalized_yarn_key
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

      const outwardCertified = Number(
        input.outwardCertifiedWeightKg
        ?? input.outwardSale.outward_certified_weight_kg
        ?? input.consumedWeightKg,
      );

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
          input.outwardSale.product_name || lot.additional_info_raw || null,
          input.outwardSale.normalized_yarn_key || lot.normalized_yarn_key || null,
          input.outwardSale.outward_net_weight_kg ?? input.outwardNetWeightKg ?? null,
          input.outwardSale.outward_gross_weight_kg ?? input.outwardGrossWeightKg ?? null,
          Number.isFinite(outwardCertified) ? outwardCertified : input.consumedWeightKg,
          input.outwardSale.transport_doc_no || input.transportDoc || null,
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

      if (input.consumptionDate) {
        await client.query(
          `update consumption_entries
           set consumption_date = $1
           where id = $2 and company_id = $3`,
          [input.consumptionDate, consumption.rows[0].id, user.companyId],
        );
        consumption.rows[0].consumption_date = input.consumptionDate;
      }

      return { consumption: consumption.rows[0], outwardSale: sale.rows[0] };
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

  app.delete("/api/consumption/:id", { preHandler: requireUser }, async (request) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const reason = (request.query as any)?.reason || "Deleted from local API";
    const result = await query<any>(
      `select reverse_consumption_local($1, $2, $3, $4) as result`,
      [user.companyId, user.id, id, reason],
    );
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

import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import { query, withTransaction } from "../db.js";

const toNumber = (value: unknown) => (value == null ? null : Number(value));

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get("/api/dashboard", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const [lots, incomingStock, pending, consumption] = await Promise.all([
      query(
        `select certified_weight_kg, remaining_stock_kg, consumed_stock_kg, status, normalized_yarn_key, created_at
         from product_lots where company_id = $1`,
        [companyId],
      ),
      query(
        `select invoice_no, yarn_count, normalized_yarn_key, net_weight_kg, shipment_date, created_at
         from incoming_stock
         where company_id = $1 and matched_tc_id is null
         order by shipment_date desc, created_at desc`,
        [companyId],
      ),
      query(
        `select count(*)::int as count from uploaded_files
         where company_id = $1 and parsing_status in ('needs_review', 'pending', 'processing')`,
        [companyId],
      ),
      query(
        `select consumed_weight_kg, consumption_date
         from consumption_entries
         where company_id = $1
         order by consumption_date asc`,
        [companyId],
      ),
    ]);

    return {
      lots: lots.rows,
      incomingStock: incomingStock.rows,
      pending: pending.rows[0]?.count ?? 0,
      consumption: consumption.rows,
    };
  });

  app.get("/api/certificates", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const result = await query(
      `select
         tc.*,
         s.supplier_name
       from transaction_certificates tc
       left join suppliers s on s.id = tc.supplier_id
       where tc.company_id = $1
       order by tc.created_at desc`,
      [companyId],
    );

    return result.rows.map((row: any) => ({
      ...row,
      suppliers: row.supplier_name ? { supplier_name: row.supplier_name } : null,
    }));
  });

  app.delete("/api/certificates/:id", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };

    await withTransaction(async (client) => {
      const certificate = await client.query(
        `select id from transaction_certificates where company_id = $1 and id = $2 for update`,
        [companyId, id],
      );
      if (!certificate.rows[0]) {
        const error = new Error("Certificate not found");
        (error as any).statusCode = 404;
        throw error;
      }

      const consumption = await client.query<{ count: number }>(
        `select count(*)::int as count
         from consumption_entries ce
         join product_lots l on l.id = ce.product_lot_id
         where l.company_id = $1 and l.transaction_certificate_id = $2`,
        [companyId, id],
      );
      if ((consumption.rows[0]?.count || 0) > 0) {
        const error = new Error("Cannot delete this certificate because stock has already been consumed");
        (error as any).statusCode = 400;
        throw error;
      }

      await client.query(
        `delete from stock_ledger
         where company_id = $1
           and product_lot_id in (
             select id from product_lots where company_id = $1 and transaction_certificate_id = $2
           )`,
        [companyId, id],
      );

      await client.query(
        `delete from transaction_certificates where company_id = $1 and id = $2`,
        [companyId, id],
      );
    }).catch((error) => {
      throw error;
    });

    return reply.send({ ok: true });
  });

  app.get("/api/stock-lots", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const result = await query(
      `select
         l.*,
         tc.tc_number,
         s.supplier_name,
         sh.shipment_no,
         sh.shipment_date
       from product_lots l
       left join transaction_certificates tc on tc.id = l.transaction_certificate_id
       left join suppliers s on s.id = tc.supplier_id
       left join shipments sh on sh.id = l.shipment_id
       where l.company_id = $1
       order by l.created_at desc`,
      [companyId],
    );

    return result.rows.map((row: any) => ({
      ...row,
      transaction_certificates: {
        tc_number: row.tc_number,
        suppliers: row.supplier_name ? { supplier_name: row.supplier_name } : null,
      },
      shipments: {
        shipment_no: row.shipment_no,
        shipment_date: row.shipment_date,
      },
    }));
  });

  app.get("/api/stock-lots/:id", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `select
         l.*,
         tc.tc_number,
         tc.standard,
         tc.gross_shipping_weight_kg as tc_gross_shipping_weight_kg,
         tc.net_shipping_weight_kg as tc_net_shipping_weight_kg,
         tc.certified_weight_kg as tc_certified_weight_kg,
         s.supplier_name,
         sh.shipment_no,
         sh.shipment_date,
         sh.shipment_doc_no,
         sh.gross_shipping_weight_kg as shipment_gross_shipping_weight_kg
       from product_lots l
       left join transaction_certificates tc on tc.id = l.transaction_certificate_id
       left join suppliers s on s.id = tc.supplier_id
       left join shipments sh on sh.id = l.shipment_id
       where l.company_id = $1 and l.id = $2
       limit 1`,
      [companyId, id],
    );

    const row: any = result.rows[0];
    if (!row) return reply.code(404).send({ error: "Stock lot not found" });

    return {
      ...row,
      transaction_certificates: {
        id: row.transaction_certificate_id,
        tc_number: row.tc_number,
        standard: row.standard,
        gross_shipping_weight_kg: toNumber(row.tc_gross_shipping_weight_kg),
        net_shipping_weight_kg: toNumber(row.tc_net_shipping_weight_kg),
        certified_weight_kg: toNumber(row.tc_certified_weight_kg),
        suppliers: row.supplier_name ? { supplier_name: row.supplier_name } : null,
      },
      shipments: {
        shipment_no: row.shipment_no,
        shipment_date: row.shipment_date,
        shipment_doc_no: row.shipment_doc_no,
        gross_shipping_weight_kg: toNumber(row.shipment_gross_shipping_weight_kg),
      },
    };
  });

  app.get("/api/stock-lots/:id/entries", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `select
         ce.*,
         os.outward_invoice_no,
         os.outward_invoice_date,
         os.outward_tc_no,
         os.customer_name_snapshot,
         os.product_name,
         os.outward_net_weight_kg,
         os.outward_certified_weight_kg,
         os.outward_gross_weight_kg,
         os.transport_doc_no,
         os.vehicle_no,
         os.destination
       from consumption_entries ce
       left join outward_sales os on os.id = ce.outward_sale_id
       where ce.company_id = $1 and ce.product_lot_id = $2
       order by ce.consumption_date asc nulls last, ce.created_at asc`,
      [companyId, id],
    );

    return result.rows.map((row: any) => ({
      ...row,
      outward_sales: row.outward_invoice_no || row.customer_name_snapshot ? {
        outward_invoice_no: row.outward_invoice_no,
        outward_invoice_date: row.outward_invoice_date,
        outward_tc_no: row.outward_tc_no,
        customer_name_snapshot: row.customer_name_snapshot,
        product_name: row.product_name,
        outward_net_weight_kg: row.outward_net_weight_kg,
        outward_gross_weight_kg: row.outward_gross_weight_kg,
        outward_certified_weight_kg: row.outward_certified_weight_kg,
        transport_doc_no: row.transport_doc_no,
        vehicle_no: row.vehicle_no,
        destination: row.destination,
      } : null,
    }));
  });

  app.get("/api/stock-lots/:id/ledger", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `select * from stock_ledger
       where company_id = $1 and product_lot_id = $2
       order by created_at desc`,
      [companyId, id],
    );
    return result.rows;
  });

  app.delete("/api/stock-lots/:id", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const count = await query(
      `select count(*)::int as count
       from consumption_entries
       where company_id = $1 and product_lot_id = $2`,
      [companyId, id],
    );
    if ((count.rows[0] as any)?.count > 0) {
      return reply.code(400).send({ error: "Cannot delete a stock lot after consumption is recorded" });
    }

    await query(
      `delete from stock_ledger where company_id = $1 and product_lot_id = $2`,
      [companyId, id],
    );
    const result = await query(
      `delete from product_lots where company_id = $1 and id = $2 returning id`,
      [companyId, id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Stock lot not found" });
    return { ok: true };
  });

  app.get("/api/consumption", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const result = await query(
      `select
         ce.*,
         l.normalized_yarn_key,
         l.article_no,
         sh.shipment_no,
         sh.shipment_date,
         tc.tc_number,
         os.outward_invoice_no,
         os.customer_name_snapshot
       from consumption_entries ce
       left join product_lots l on l.id = ce.product_lot_id
       left join shipments sh on sh.id = l.shipment_id
       left join transaction_certificates tc on tc.id = l.transaction_certificate_id
       left join outward_sales os on os.id = ce.outward_sale_id
       where ce.company_id = $1
       order by ce.created_at desc
       limit 500`,
      [companyId],
    );

    return result.rows.map((row: any) => ({
      ...row,
      product_lots: {
        normalized_yarn_key: row.normalized_yarn_key,
        article_no: row.article_no,
        shipments: {
          shipment_no: row.shipment_no,
          shipment_date: row.shipment_date,
        },
        transaction_certificates: {
          tc_number: row.tc_number,
        },
      },
      outward_sales: {
        outward_invoice_no: row.outward_invoice_no,
        customer_name_snapshot: row.customer_name_snapshot,
      },
    }));
  });

  app.get("/api/outward-sales", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const result = await query(
      `select * from outward_sales where company_id = $1 order by created_at desc limit 1000`,
      [companyId],
    );
    return result.rows;
  });
}

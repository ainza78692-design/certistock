import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import { query } from "../db.js";

const normalizeSearch = (value: unknown) => String(value || "").replace(/\s+/g, "").toUpperCase();
const isProductKeyLike = (value: string) => /^(?:\d{1,3}|\d{1,3}D|\d{1,3}\/\d{1,3})$/.test(value);

export async function registerSearchRoutes(app: FastifyInstance) {
  app.get("/api/search", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const rawQ = String((request.query as any)?.q || "").trim();
    const normalizedQ = normalizeSearch(rawQ);
    const like = `%${rawQ}%`;
    const productPrefix = `${normalizedQ}%`;
    const productSearch = Boolean(normalizedQ && isProductKeyLike(normalizedQ));
    const limit = 10;

    const [incomingStock, stockLots, certificates, consumptions, suppliers, customers, products] = await Promise.all([
      query(
        `select
           id,
           invoice_no,
           yarn_count,
           normalized_yarn_key,
           net_weight_kg,
           shipment_date,
           created_at
         from incoming_stock
         where company_id = $1
           and matched_tc_id is null
           and (
             $2::text = ''
             or invoice_no ilike $5
             or (
               $3::boolean
               and regexp_replace(upper(coalesce(normalized_yarn_key, '')), '\\s+', '', 'g') like $4
             )
             or (
               $3::boolean = false
               and (
                 yarn_count ilike $5
                 or normalized_yarn_key ilike $5
                 or shipment_date::text ilike $5
               )
             )
           )
         order by
           case when upper(coalesce(invoice_no, '')) = upper($6) then 0 else 1 end,
           case when regexp_replace(upper(coalesce(normalized_yarn_key, '')), '\\s+', '', 'g') = $2 then 0 else 1 end,
           case when regexp_replace(upper(coalesce(normalized_yarn_key, '')), '\\s+', '', 'g') like $4 then 0 else 1 end,
           shipment_date desc nulls last,
           created_at desc
         limit $7`,
        [companyId, normalizedQ, productSearch, productPrefix, like, rawQ, limit],
      ),
      query(
        `select
           l.id,
           l.normalized_yarn_key,
           l.article_no,
           l.remaining_stock_kg,
           tc.tc_number,
           s.supplier_name,
           sh.shipment_no,
           sh.shipment_date
         from product_lots l
         left join transaction_certificates tc on tc.id = l.transaction_certificate_id
         left join suppliers s on s.id = tc.supplier_id
         left join shipments sh on sh.id = l.shipment_id
         where l.company_id = $1
           and (
             $2::text = ''
             or (
               $3::boolean
               and regexp_replace(upper(coalesce(l.normalized_yarn_key, '')), '\\s+', '', 'g') like $4
             )
             or (
               $3::boolean = false
               and (
                 l.normalized_yarn_key ilike $5
                 or l.article_no ilike $5
                 or tc.tc_number ilike $5
                 or s.supplier_name ilike $5
                 or sh.shipment_no ilike $5
                 or sh.shipment_date::text ilike $5
               )
             )
           )
         order by
           case when regexp_replace(upper(coalesce(l.normalized_yarn_key, '')), '\\s+', '', 'g') = $2 then 0 else 1 end,
           case when regexp_replace(upper(coalesce(l.normalized_yarn_key, '')), '\\s+', '', 'g') like $4 then 0 else 1 end,
           l.created_at desc
         limit $6`,
        [companyId, normalizedQ, productSearch, productPrefix, like, limit],
      ),
      query(
        `select
           tc.id,
           tc.tc_number,
           tc.issue_date,
           s.supplier_name
         from transaction_certificates tc
         left join suppliers s on s.id = tc.supplier_id
         where tc.company_id = $1
           and (
             $2 = ''
             or tc.tc_number ilike $3
             or s.supplier_name ilike $3
             or tc.buyer_name ilike $3
             or tc.input_tcs ilike $3
           )
         order by tc.created_at desc
         limit $4`,
        [companyId, rawQ, like, limit],
      ),
      query(
        `select
           ce.id,
           ce.consumed_weight_kg,
           ce.consumption_date,
           l.normalized_yarn_key,
           l.article_no,
           tc.tc_number,
           sh.shipment_no,
           sh.shipment_date,
           os.outward_invoice_no,
           os.customer_name_snapshot
         from consumption_entries ce
         left join product_lots l on l.id = ce.product_lot_id
         left join transaction_certificates tc on tc.id = l.transaction_certificate_id
         left join shipments sh on sh.id = l.shipment_id
         left join outward_sales os on os.id = ce.outward_sale_id
         where ce.company_id = $1
           and (
             $2::text = ''
             or (
               $3::boolean
               and regexp_replace(upper(coalesce(l.normalized_yarn_key, '')), '\\s+', '', 'g') like $4
             )
             or (
               $3::boolean = false
               and (
                 l.normalized_yarn_key ilike $5
                 or l.article_no ilike $5
                 or tc.tc_number ilike $5
                 or sh.shipment_no ilike $5
                 or sh.shipment_date::text ilike $5
                 or ce.consumption_date::text ilike $5
                 or os.customer_name_snapshot ilike $5
                 or os.outward_invoice_no ilike $5
               )
             )
           )
         order by ce.created_at desc
         limit $6`,
        [companyId, normalizedQ, productSearch, productPrefix, like, limit],
      ),
      query(
        `select id, supplier_name, te_id, city, country
         from suppliers
         where company_id = $1
           and ($2 = '' or supplier_name ilike $3 or te_id ilike $3 or city ilike $3 or country ilike $3)
         order by created_at desc
         limit $4`,
        [companyId, rawQ, like, limit],
      ),
      query(
        `select id, customer_name, te_id, city, country
         from customers
         where company_id = $1
           and ($2 = '' or customer_name ilike $3 or te_id ilike $3 or city ilike $3 or country ilike $3)
         order by created_at desc
         limit $4`,
        [companyId, rawQ, like, limit],
      ),
      query(
        `select id, normalized_key, display_name
         from product_master
         where company_id = $1
           and (
             $2::text = ''
             or regexp_replace(upper(coalesce(normalized_key, '')), '\\s+', '', 'g') like $3
             or display_name ilike $4
           )
         order by
           case when regexp_replace(upper(coalesce(normalized_key, '')), '\\s+', '', 'g') = $2 then 0 else 1 end,
           normalized_key asc
         limit $5`,
        [companyId, normalizedQ, productPrefix, like, limit],
      ),
    ]);

    return {
      incomingStock: incomingStock.rows,
      stockLots: stockLots.rows.map((row: any) => ({
        ...row,
        transaction_certificates: {
          tc_number: row.tc_number,
          suppliers: row.supplier_name ? { supplier_name: row.supplier_name } : null,
        },
        shipments: {
          shipment_no: row.shipment_no,
          shipment_date: row.shipment_date,
        },
      })),
      certificates: certificates.rows.map((row: any) => ({
        ...row,
        suppliers: row.supplier_name ? { supplier_name: row.supplier_name } : null,
      })),
      consumptions: consumptions.rows.map((row: any) => ({
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
      })),
      suppliers: suppliers.rows,
      customers: customers.rows,
      products: products.rows,
    };
  });
}

import { config } from "./config.js";
import { query } from "./db.js";
import { buckets, buildMassBalanceStoragePath, massBalanceFileName, writeStoredFile } from "./storage.js";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validateMassBalancePayload(payload: any) {
  const errors: string[] = [];
  const openingStock = toNumber(payload.lot?.opening_stock_kg);
  const material = payload.lot?.normalized_yarn_key || payload.lot?.additional_info_raw || payload.lot?.id || "unknown material";

  if (!payload.product_lot_id) errors.push("Mass Balance validation failed: product lot id is missing.");
  if (!payload.transaction_certificate_id || !payload.tc?.tc_number) {
    errors.push(`Mass Balance validation failed: stock lot ${payload.product_lot_id || material} is not linked to a valid TC/IDF.`);
  }
  if (!payload.supplier?.supplier_name) {
    errors.push(`Mass Balance validation failed: supplier is missing for TC/IDF ${payload.tc?.tc_number || "unknown"}.`);
  }
  if (openingStock === null || openingStock < 0) {
    errors.push(`Mass Balance validation failed: received/opening quantity is invalid for ${material}.`);
  }

  const validConsumptions = Array.isArray(payload.consumptions) ? payload.consumptions.filter((entry: any) => {
    const consumed = toNumber(entry?.consumed_weight_kg);
    return consumed !== null && consumed > 0;
  }) : [];

  for (const entry of validConsumptions) {
    const consumed = toNumber(entry.consumed_weight_kg);
    const closing = toNumber(entry.closing_balance_after_kg);
    const invoice = entry.outward_sale?.outward_invoice_no || entry.id || "unknown invoice";
    if (consumed === null || consumed <= 0) {
      errors.push(`Mass Balance validation failed: invalid consumed quantity for ${invoice}.`);
    }
    if (!entry.id) {
      errors.push(`Mass Balance validation failed: consumption entry is missing an id for ${invoice}.`);
    }
    if (closing !== null && closing < -0.001) {
      errors.push(`Mass Balance validation failed: negative balance after consumption ${invoice}.`);
    }
  }

  const totalConsumed = validConsumptions.reduce((sum: number, entry: any) => sum + (toNumber(entry.consumed_weight_kg) || 0), 0);
  if (openingStock !== null && totalConsumed - openingStock > 0.001) {
    errors.push(
      `Mass Balance validation failed: consumed quantity ${totalConsumed.toFixed(3)} exceeds received quantity ${openingStock.toFixed(3)} for ${material}.`,
    );
  }

  if (errors.length) {
    console.error("Mass Balance validation errors", {
      companyId: payload.company_id,
      productLotId: payload.product_lot_id,
      tcNumber: payload.tc?.tc_number,
      errors,
    });
    throw new Error(errors.join(" "));
  }

  return {
    ...payload,
    consumptions: validConsumptions,
    mass_balance_validation: {
      total_received_kg: openingStock,
      total_consumed_kg: Number(totalConsumed.toFixed(3)),
      remaining_kg: openingStock === null ? null : Number((openingStock - totalConsumed).toFixed(3)),
      row_count: validConsumptions.length,
    },
  };
}

export async function buildMassBalancePayload(companyId: string, productLotId: string) {
  const lotResult = await query(
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
       sh.gross_shipping_weight_kg as shipment_gross_shipping_weight_kg,
       sh.consignee_name,
       sh.consignee_address,
       sh.consignee_te_id
     from product_lots l
     left join transaction_certificates tc on tc.id = l.transaction_certificate_id
     left join suppliers s on s.id = tc.supplier_id
     left join shipments sh on sh.id = l.shipment_id
     where l.company_id = $1 and l.id = $2
     limit 1`,
    [companyId, productLotId],
  );

  const lot: any = lotResult.rows[0];
  if (!lot) throw new Error("Product lot not found");

  const entries = await query(
    `select
       ce.id,
       ce.consumed_weight_kg,
       ce.consumption_date,
       ce.outward_certified_weight_kg,
       ce.loss_percent,
       ce.closing_balance_after_kg,
       os.outward_invoice_no,
       os.outward_invoice_date,
       os.outward_tc_no,
       os.customer_name_snapshot,
       os.product_name,
       os.outward_net_weight_kg,
       os.outward_gross_weight_kg,
       os.transport_doc_no,
       os.vehicle_no,
       os.destination
     from consumption_entries ce
     left join outward_sales os on os.id = ce.outward_sale_id
     where ce.company_id = $1 and ce.product_lot_id = $2
     order by ce.consumption_date asc nulls last, ce.created_at asc`,
    [companyId, productLotId],
  );

  const payload = {
    company_id: companyId,
    transaction_certificate_id: lot.transaction_certificate_id,
    product_lot_id: lot.id,
    tc: {
      tc_number: lot.tc_number ?? null,
      standard: lot.standard ?? null,
      gross_shipping_weight_kg: lot.tc_gross_shipping_weight_kg ?? null,
      net_shipping_weight_kg: lot.tc_net_shipping_weight_kg ?? null,
      certified_weight_kg: lot.tc_certified_weight_kg ?? null,
    },
    supplier: {
      supplier_name: lot.supplier_name ?? null,
    },
    shipment: {
      shipment_no: lot.shipment_no ?? null,
      shipment_date: lot.shipment_date ?? null,
      shipment_doc_no: lot.shipment_doc_no ?? null,
      gross_shipping_weight_kg: lot.shipment_gross_shipping_weight_kg ?? null,
      consignee_name: lot.consignee_name ?? null,
      consignee_address: lot.consignee_address ?? null,
      consignee_te_id: lot.consignee_te_id ?? null,
    },
    lot: {
      id: lot.id,
      normalized_yarn_key: lot.normalized_yarn_key ?? null,
      article_no: lot.article_no ?? null,
      product_no: lot.product_no ?? null,
      number_of_units: lot.number_of_units ?? null,
      unit_type: lot.unit_type ?? null,
      net_shipping_weight_kg: lot.net_shipping_weight_kg ?? null,
      certified_weight_kg: lot.certified_weight_kg ?? null,
      opening_stock_kg: lot.opening_stock_kg ?? null,
      additional_info_raw: lot.additional_info_raw ?? null,
      yarn_count_raw: lot.yarn_count_raw ?? null,
      product_category: lot.product_category ?? null,
      product_detail: lot.product_detail ?? null,
      material_composition: lot.material_composition ?? null,
      standard_label_grade: lot.standard_label_grade ?? null,
    },
    consumptions: entries.rows.map((entry: any) => ({
      id: entry.id,
      consumed_weight_kg: entry.consumed_weight_kg,
      consumption_date: entry.consumption_date,
      outward_certified_weight_kg: entry.outward_certified_weight_kg,
      loss_percent: entry.loss_percent,
      closing_balance_after_kg: entry.closing_balance_after_kg,
      outward_sale: {
        outward_invoice_no: entry.outward_invoice_no,
        outward_invoice_date: entry.outward_invoice_date,
        outward_tc_no: entry.outward_tc_no,
        customer_name_snapshot: entry.customer_name_snapshot,
        product_name: entry.product_name,
        outward_net_weight_kg: entry.outward_net_weight_kg,
        outward_gross_weight_kg: entry.outward_gross_weight_kg,
        outward_certified_weight_kg: entry.outward_certified_weight_kg,
        transport_doc_no: entry.transport_doc_no,
        vehicle_no: entry.vehicle_no,
        destination: entry.destination,
      },
    })),
  };

  return validateMassBalancePayload(payload);
}

export async function renderAndStoreMassBalance(companyId: string, productLotId: string) {
  const payload = await buildMassBalancePayload(companyId, productLotId);
  const fileName = massBalanceFileName({
    tcNumber: payload.tc.tc_number,
    shipmentNo: payload.shipment.shipment_no || payload.lot.product_no,
    productKey: payload.lot.normalized_yarn_key,
  });
  const storagePath = buildMassBalanceStoragePath(companyId, productLotId, fileName);

  await query(
    `insert into mass_balance_workbooks(
       company_id, transaction_certificate_id, product_lot_id, storage_path, file_name, status, error_message
     ) values ($1, $2, $3, $4, $5, 'generating', null)
     on conflict(product_lot_id)
     do update set storage_path = excluded.storage_path, file_name = excluded.file_name, status = 'generating',
                   error_message = null, updated_at = now()`,
    [companyId, payload.transaction_certificate_id, productLotId, storagePath, fileName],
  );

  try {
    const endpoint = new URL("/mass-balance/render", config.ocrWorkerUrl.endsWith("/") ? config.ocrWorkerUrl : `${config.ocrWorkerUrl}/`);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.ocrWorkerApiKey ? { Authorization: `Bearer ${config.ocrWorkerApiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Mass Balance worker failed: ${(await response.text()).slice(0, 300)}`);
    }

    const rendered: any = await response.json();
    const bytes = Buffer.from(rendered.contentBase64, "base64");
    const finalFileName = rendered.fileName || fileName;
    const finalStoragePath = buildMassBalanceStoragePath(companyId, productLotId, finalFileName);
    await writeStoredFile(buckets.massBalance, finalStoragePath, bytes);

    const workbook = await query(
      `insert into mass_balance_workbooks(
         company_id, transaction_certificate_id, product_lot_id, storage_path, file_name,
         status, row_count, error_message, last_generated_at
       ) values ($1, $2, $3, $4, $5, 'ready', $6, null, now())
       on conflict(product_lot_id)
       do update set storage_path = excluded.storage_path, file_name = excluded.file_name,
                     status = 'ready', row_count = excluded.row_count, error_message = null,
                     last_generated_at = now(), updated_at = now()
       returning *`,
      [
        companyId,
        payload.transaction_certificate_id,
        productLotId,
        finalStoragePath,
        finalFileName,
        rendered.rowCount ?? payload.consumptions.length,
      ],
    );

    return workbook.rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(
      `insert into mass_balance_workbooks(
         company_id, transaction_certificate_id, product_lot_id, storage_path, file_name, status, error_message
       ) values ($1, $2, $3, $4, $5, 'failed', $6)
       on conflict(product_lot_id)
       do update set status = 'failed', error_message = excluded.error_message, updated_at = now()`,
      [companyId, payload.transaction_certificate_id, productLotId, storagePath, fileName, message],
    );
    throw error;
  }
}

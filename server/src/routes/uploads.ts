import type { FastifyInstance } from "fastify";
import { extractText, getDocumentProxy } from "unpdf";
import { requireUser } from "../auth.js";
import { config } from "../config.js";
import { query, withTransaction } from "../db.js";
import { isGoodNativeText, parseSimpleTcExtraction } from "../extraction/simpleParser.js";
import { reconcileIncomingStockForInvoices } from "../incomingStock.js";
import { buckets, buildStoragePath, deleteStoredFile, readStoredFile, writeStoredFile } from "../storage.js";

const bytesToBase64 = (bytes: Buffer) => bytes.toString("base64");
const cleanEntityName = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
const cleanInputTcs = (value: unknown) => {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+(?:Farm SCs?|Farm TCs?|Trader TCs?|9\.\s*Shipments|Shipment No\.?|10\.\s*Certified Products|Certified Products|Transaction Certificate Number)\b.*$/i, "")
    .replace(/[.;,\s]+$/, "")
    .trim();

  if (!cleaned) return null;
  if (/^(?:not\s+applicable|n\/?a|none|null|-)+$/i.test(cleaned)) return null;
  return cleaned;
};

async function extractNativeText(bytes: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text || "";
}

async function runOcrWorker(bytes: Buffer, fileName: string) {
  try {
    const endpoint = new URL("/ocr", config.ocrWorkerUrl.endsWith("/") ? config.ocrWorkerUrl : `${config.ocrWorkerUrl}/`);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.ocrWorkerApiKey ? { Authorization: `Bearer ${config.ocrWorkerApiKey}` } : {}),
      },
      body: JSON.stringify({
        content: bytesToBase64(bytes),
        fileName,
        mimeType: "application/pdf",
      }),
    });

    if (!response.ok) throw new Error(`OCR worker failed: ${(await response.text()).slice(0, 300)}`);
    return response.json() as Promise<{ text?: string; confidence?: number | null; provider?: string; pages?: number | null }>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`OCR worker unavailable at ${config.ocrWorkerUrl}. ${message}`);
  }
}

export async function registerUploadRoutes(app: FastifyInstance) {
  app.get("/api/uploads", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const result = await query(
      `select * from uploaded_files where company_id = $1 order by created_at desc limit 200`,
      [companyId],
    );
    return result.rows;
  });

  app.get("/api/uploads/:id", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `select * from uploaded_files where id = $1 and company_id = $2 limit 1`,
      [id, companyId],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: "Upload not found" });
    return row;
  });

  app.get("/api/uploads/:id/file", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `select file_name, file_type, storage_path from uploaded_files where id = $1 and company_id = $2 limit 1`,
      [id, companyId],
    );
    const row: any = result.rows[0];
    if (!row) return reply.code(404).send({ error: "Upload not found" });
    const bytes = await readStoredFile(buckets.tcPdfs, row.storage_path);
    reply.header("Content-Type", row.file_type || "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${row.file_name}"`);
    return reply.send(bytes);
  });

  app.post("/api/uploads/tc-pdfs", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "PDF file is required" });
    const bytes = await file.toBuffer();
    const storagePath = buildStoragePath(user.companyId, buckets.tcPdfs, file.filename);
    await writeStoredFile(buckets.tcPdfs, storagePath, bytes);

    const result = await query(
      `insert into uploaded_files(
         company_id, uploaded_by, file_name, file_type, file_size, storage_path, parsing_status
       ) values ($1, $2, $3, $4, $5, $6, 'pending')
       returning *`,
      [user.companyId, user.id, file.filename, file.mimetype, bytes.length, storagePath],
    );
    return result.rows[0];
  });

  app.delete("/api/uploads/:id", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `delete from uploaded_files where id = $1 and company_id = $2 returning storage_path`,
      [id, companyId],
    );
    const row = result.rows[0] as any;
    if (!row) return reply.code(404).send({ error: "Upload not found" });
    await deleteStoredFile(buckets.tcPdfs, row.storage_path);
    return { ok: true };
  });

  app.post("/api/uploads/:id/extract", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const fileResult = await query(
      `select * from uploaded_files where id = $1 and company_id = $2 limit 1`,
      [id, user.companyId],
    );
    const file: any = fileResult.rows[0];
    if (!file) return reply.code(404).send({ error: "Upload not found" });

    await query(
      `update uploaded_files
       set parsing_status = 'processing', extraction_started_at = now(), parser_error = null
       where id = $1 and company_id = $2`,
      [id, user.companyId],
    );

    try {
      const bytes = await readStoredFile(buckets.tcPdfs, file.storage_path);
      let embeddedText = "";
      try {
        embeddedText = await extractNativeText(bytes);
      } catch {
        embeddedText = "";
      }

      let finalText = embeddedText;
      let source = "native_pdf_text";
      let ocrText: string | null = null;
      let ocrConfidence: number | null = null;

      if (!isGoodNativeText(embeddedText)) {
        try {
          const ocr = await runOcrWorker(bytes, file.file_name);
          ocrText = ocr.text || "";
          ocrConfidence = ocr.confidence ?? null;
          finalText = ocrText || embeddedText;
          source = ocr.provider || "paddleocr";
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!embeddedText.trim() || config.ocrWorkerRequired) {
            throw new Error(
              `${message}. OCR worker is a required production dependency for scanned PDFs. Start the OCR/XLSX worker on port 8001 and retry extraction.`,
            );
          }
          finalText = embeddedText;
          source = "native_pdf_text_weak_ocr_unavailable";
          ocrText = null;
          ocrConfidence = null;
        }
      }

      if (!finalText.trim()) throw new Error("No usable text could be extracted from the PDF");

      const extracted = parseSimpleTcExtraction(finalText);
      if (source === "native_pdf_text_weak_ocr_unavailable") {
        (extracted as any)._confidence = Math.min(Number((extracted as any)._confidence || 0), 60);
        (extracted as any)._review_flags = [
          ...(((extracted as any)._review_flags || []) as string[]),
          "OCR worker unavailable; parsed weak embedded PDF text only",
        ];
      }
      const confidence = Number((extracted as any)._confidence || 0);
      const status = confidence >= 85 ? "extracted" : "needs_review";

      const updated = await query(
        `update uploaded_files
         set parsing_status = $1,
             embedded_text = $2,
             ocr_text = $3,
             final_extracted_text = $4,
             ocr_engine_used = $5,
             ocr_average_confidence = $6,
             ai_model_used = 'not_used',
             ai_structuring_confidence = $7,
             extracted_json = $8,
             extraction_completed_at = now(),
             updated_at = now()
         where id = $9 and company_id = $10
         returning *`,
        [
          status,
          embeddedText,
          ocrText,
          finalText,
          source,
          ocrConfidence,
          confidence,
          JSON.stringify(extracted),
          id,
          user.companyId,
        ],
      );

      return { ok: true, file: updated.rows[0], extractedJson: extracted };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await query(
        `update uploaded_files
         set parsing_status = 'failed', parser_error = $1, extraction_completed_at = now(), updated_at = now()
         where id = $2 and company_id = $3`,
        [message, id, user.companyId],
      );
      return reply.code(400).send({ ok: false, error: message });
    }
  });

  app.post("/api/uploads/:id/approve", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body: any = request.body || {};
    const tc = body.tc || {};
    const shipments = Array.isArray(body.shipments) ? body.shipments : [];
    const products = Array.isArray(body.products) ? body.products : [];

    if (!tc.tc_number) return reply.code(400).send({ error: "TC number required" });
    if (!products.length) return reply.code(400).send({ error: "At least one product line is required" });
    if (products.some((p: any) => !p.normalized_yarn_key)) {
      return reply.code(400).send({ error: "Select a product key for every product line" });
    }

    const duplicate = await query(
      `select id from transaction_certificates where company_id = $1 and tc_number = $2 limit 1`,
      [user.companyId, tc.tc_number],
    );
    if (duplicate.rows[0]) return reply.code(400).send({ error: "This TC number already exists" });

    const supplierName = cleanEntityName(tc.supplier_name);
    if (!supplierName) return reply.code(400).send({ error: "Supplier required" });
    const inputTcs = cleanInputTcs(tc.input_tcs);

    const approved = await withTransaction(async (client) => {
      let supplier = await client.query<any>(
        `select id, te_id from suppliers where company_id = $1 and lower(btrim(supplier_name)) = lower(btrim($2)) limit 1`,
        [user.companyId, supplierName],
      );
      let supplierId = supplier.rows[0]?.id;
      if (!supplierId) {
        supplier = await client.query<any>(
          `insert into suppliers(company_id, supplier_name, te_id)
           values ($1, $2, $3)
           returning id`,
          [user.companyId, supplierName, tc.supplier_te_id || null],
        );
        supplierId = supplier.rows[0].id;
      } else if (tc.supplier_te_id && !supplier.rows[0]?.te_id) {
        await client.query(
          `update suppliers set te_id = $1, updated_at = now() where id = $2 and company_id = $3`,
          [tc.supplier_te_id, supplierId, user.companyId],
        );
      }

      const tcRow = await client.query<any>(
        `insert into transaction_certificates(
           company_id, uploaded_file_id, supplier_id, tc_number, standard, status, issue_date,
           buyer_name, seller_te_id, gross_shipping_weight_kg, net_shipping_weight_kg,
           certified_weight_kg, input_tcs, review_status, created_by
         ) values ($1,$2,$3,$4,$5,'valid',$6,$7,$8,$9,$10,$11,$12,'approved',$13)
         returning *`,
        [
          user.companyId,
          id,
          supplierId,
          tc.tc_number,
          tc.standard || "GRS",
          tc.issue_date || null,
          tc.buyer_name || null,
          tc.supplier_te_id || null,
          tc.gross_shipping_weight_kg ? Number(tc.gross_shipping_weight_kg) : null,
          tc.net_shipping_weight_kg ? Number(tc.net_shipping_weight_kg) : null,
          tc.certified_weight_kg ? Number(tc.certified_weight_kg) : null,
          inputTcs,
          user.id,
        ],
      );

      const shipmentMap: Record<string, string> = {};
      const invoiceReferences: string[] = [];
      for (const sh of shipments) {
        if (!sh.shipment_no) continue;
        if (sh.invoice_reference) invoiceReferences.push(sh.invoice_reference);
        const ship = await client.query<any>(
          `insert into shipments(
             company_id, transaction_certificate_id, shipment_no, shipment_date, shipment_doc_no,
             invoice_reference, gross_shipping_weight_kg, consignee_name, consignee_address, consignee_te_id
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           returning id`,
          [
            user.companyId,
            tcRow.rows[0].id,
            sh.shipment_no,
            sh.shipment_date || null,
            sh.shipment_doc_no || null,
            sh.invoice_reference || null,
            sh.gross_shipping_weight_kg ? Number(sh.gross_shipping_weight_kg) : null,
            sh.consignee_name || null,
            sh.consignee_address || null,
            sh.consignee_te_id || null,
          ],
        );
        shipmentMap[sh.shipment_no] = ship.rows[0].id;
      }

      const incomingReconciliation = await reconcileIncomingStockForInvoices({
        client,
        companyId: user.companyId,
        tcId: tcRow.rows[0].id,
        invoiceReferences,
      });

      const lots = [];
      for (const p of products) {
        const cert = Number(p.certified_weight_kg || 0);
        if (!cert) throw new Error("All product certified weights required");
        const pm = await client.query<any>(
          `select id from product_master where company_id = $1 and normalized_key = $2 limit 1`,
          [user.companyId, p.normalized_yarn_key],
        );
        const lot = await client.query<any>(
          `insert into product_lots(
             company_id, transaction_certificate_id, shipment_id, product_master_id, product_no,
             shipment_product_no, order_no, article_no, number_of_units, unit_type,
             net_shipping_weight_kg, certified_weight_kg, production_date, product_category,
             product_detail, material_composition, standard_label_grade, additional_info_raw,
             yarn_count_raw, normalized_yarn_key, last_processor, origin_country,
             opening_stock_kg, remaining_stock_kg, status, needs_manual_review
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'active',false)
           returning *`,
          [
            user.companyId,
            tcRow.rows[0].id,
            shipmentMap[p.shipment_no || p.product_no] || null,
            pm.rows[0]?.id || null,
            p.product_no || null,
            p.shipment_no ? `${p.shipment_no}${p.product_no ? ` / ${p.product_no}` : ""}` : p.product_no || null,
            p.order_no || null,
            p.article_no || null,
            p.number_of_units ? Number(p.number_of_units) : null,
            p.unit_type || null,
            Number(p.net_shipping_weight_kg || cert),
            cert,
            p.production_date || null,
            p.product_category || null,
            p.product_detail || null,
            p.material_composition || null,
            p.standard_label_grade || null,
            p.additional_info_raw || null,
            p.yarn_count_raw || null,
            p.normalized_yarn_key,
            p.last_processor || null,
            p.origin_country || null,
            cert,
            cert,
          ],
        );
        lots.push(lot.rows[0]);

        await client.query(
          `insert into stock_ledger(
             company_id, product_lot_id, transaction_type, reference_type, reference_id,
             qty_in_kg, balance_before_kg, balance_after_kg, remarks, created_by
           ) values ($1,$2,'inward','transaction_certificate',$3,$4,0,$4,$5,$6)`,
          [user.companyId, lot.rows[0].id, tcRow.rows[0].id, cert, `Initial inward from TC ${tc.tc_number}`, user.id],
        );
      }

      await client.query(
        `update uploaded_files set parsing_status = 'approved', updated_at = now() where id = $1 and company_id = $2`,
        [id, user.companyId],
      );

      return { tc: tcRow.rows[0], lots, incomingReconciliation };
    });

    return { ok: true, ...approved };
  });
}

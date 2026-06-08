import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import { query } from "../db.js";
import { renderAndStoreMassBalance } from "../massBalance.js";
import { buckets, readStoredFile } from "../storage.js";

export async function registerMassBalanceRoutes(app: FastifyInstance) {
  app.get("/api/stock-lots/:id/mass-balance", { preHandler: requireUser }, async (request) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `select * from mass_balance_workbooks where company_id = $1 and product_lot_id = $2 limit 1`,
      [companyId, id],
    );
    return result.rows[0] ?? null;
  });

  app.post("/api/stock-lots/:id/mass-balance", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    try {
      const workbook = await renderAndStoreMassBalance(companyId, id);
      return { ok: true, workbook };
    } catch (error) {
      return reply.code(200).send({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/stock-lots/:id/mass-balance/download", { preHandler: requireUser }, async (request, reply) => {
    const companyId = request.user!.companyId;
    const { id } = request.params as { id: string };
    const result = await query(
      `select * from mass_balance_workbooks
       where company_id = $1 and product_lot_id = $2 and status = 'ready'
       limit 1`,
      [companyId, id],
    );
    const workbook: any = result.rows[0];
    if (!workbook?.storage_path) return reply.code(404).send({ error: "Workbook not ready" });

    const bytes = await readStoredFile(buckets.massBalance, workbook.storage_path);
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", `attachment; filename="${workbook.file_name || "mass-balance.xlsx"}"`);
    return reply.send(bytes);
  });
}

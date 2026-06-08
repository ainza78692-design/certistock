import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { query } from "../db.js";
import { LOCAL_TC_PARSER_VERSION } from "../extraction/simpleParser.js";

async function checkOcrWorker() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const endpoint = new URL("/health", config.ocrWorkerUrl.endsWith("/") ? config.ocrWorkerUrl : `${config.ocrWorkerUrl}/`);
    const response = await fetch(endpoint, { signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    const body: Record<string, unknown> = contentType.includes("application/json")
      ? ((await response.json()) as Record<string, unknown>)
      : { raw: await response.text() };
    return {
      ok: response.ok && body.ok !== false,
      statusCode: response.status,
      ...body,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    let databaseOk = false;
    let databaseError: string | null = null;

    try {
      const db = await query<{ ok: number }>("select 1 as ok");
      databaseOk = db.rows[0]?.ok === 1;
    } catch (error) {
      databaseError = error instanceof Error ? error.message : String(error);
    }

    const ocrWorker = await checkOcrWorker();
    const ocrWorkerOk = ocrWorker.ok !== false;
    const ok = databaseOk && (!config.ocrWorkerRequired || ocrWorkerOk);

    return reply.code(ok ? 200 : 503).send({
      ok,
      service: "certistock-local-api",
      database: databaseOk ? "ok" : "down",
      databaseError,
      parserVersion: LOCAL_TC_PARSER_VERSION,
      ocrWorkerUrl: config.ocrWorkerUrl,
      ocrWorkerRequired: config.ocrWorkerRequired,
      ocrWorker,
    });
  });
}

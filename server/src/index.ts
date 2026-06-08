import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastify from "fastify";
import { ZodError } from "zod";
import { config } from "./config.js";
import { registerConsumptionRoutes } from "./routes/consumption.js";
import { registerEntityRoutes } from "./routes/entities.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIncomingStockRoutes } from "./routes/incomingStock.js";
import { registerInventoryRoutes } from "./routes/inventory.js";
import { registerMassBalanceRoutes } from "./routes/massBalance.js";
import { registerProductRoutes } from "./routes/products.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerUploadRoutes } from "./routes/uploads.js";

const app = fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

await registerHealthRoutes(app);
await registerAuthRoutes(app);
await registerIncomingStockRoutes(app);
await registerInventoryRoutes(app);
await registerEntityRoutes(app);
await registerProductRoutes(app);
await registerConsumptionRoutes(app);
await registerMassBalanceRoutes(app);
await registerSearchRoutes(app);
await registerUploadRoutes(app);

app.setErrorHandler((error: Error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ error: "Validation failed", details: error.issues });
  }

  const statusCode = (error as any).statusCode;
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send({ error: error.message || "Request failed" });
  }

  app.log.error(error);
  return reply.code(500).send({ error: error.message || "Internal server error" });
});

await app.listen({ host: config.host, port: config.port });

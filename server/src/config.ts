import path from "node:path";
import dotenv from "dotenv";

dotenv.config();
const envCandidates = [
  process.env.CERTISTOCK_ENV_FILE,
  path.resolve(process.cwd(), "shared", "env"),
  path.resolve(process.cwd(), "server/.env"),
  path.resolve(process.cwd(), ".env"),
].filter((candidate): candidate is string => Boolean(candidate));

for (const envPath of envCandidates) {
  dotenv.config({ path: envPath, override: false });
}

const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const isProduction = (process.env.NODE_ENV ?? "development") === "production";

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.LOCAL_API_HOST ?? "0.0.0.0",
  port: Number(process.env.LOCAL_API_PORT ?? 8787),
  databaseUrl: required("DATABASE_URL", isProduction ? undefined : "postgres://certistock:certistock@127.0.0.1:5432/certistock_utf8"),
  jwtSecret: required("JWT_SECRET", isProduction ? undefined : "change-this-local-development-secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  fileStorageRoot: path.resolve(process.env.FILE_STORAGE_ROOT ?? (isProduction ? "/srv/certistock/data/files" : "data/files")),
  ocrWorkerUrl: process.env.OCR_WORKER_URL ?? "http://127.0.0.1:8001",
  ocrWorkerApiKey: process.env.OCR_WORKER_API_KEY ?? "",
  ocrWorkerRequired: (process.env.OCR_WORKER_REQUIRED ?? "true").toLowerCase() !== "false",
};

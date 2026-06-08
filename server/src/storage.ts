import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export const buckets = {
  tcPdfs: "tc-pdfs",
  massBalance: "mass-balance-xlsx",
} as const;

const safePart = (value: string, fallback = "file") => {
  const cleaned = String(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned || fallback;
};

export function buildStoragePath(companyId: string, bucket: string, fileName: string) {
  const ext = path.extname(fileName);
  const base = safePart(path.basename(fileName, ext), "upload");
  return `${companyId}/${randomUUID()}-${base}${ext}`;
}

export function buildMassBalanceStoragePath(companyId: string, productLotId: string, fileName: string) {
  return `${companyId}/${productLotId}/${safePart(fileName, "mass-balance.xlsx")}`;
}

export function resolveStoragePath(bucket: string, storagePath: string) {
  const normalized = storagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const absolute = path.resolve(config.fileStorageRoot, bucket, normalized);
  const bucketRoot = path.resolve(config.fileStorageRoot, bucket);
  const relative = path.relative(bucketRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid storage path");
  }
  return absolute;
}

export async function writeStoredFile(bucket: string, storagePath: string, bytes: Buffer | Uint8Array) {
  const target = resolveStoragePath(bucket, storagePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return target;
}

export async function readStoredFile(bucket: string, storagePath: string) {
  return fs.readFile(resolveStoragePath(bucket, storagePath));
}

export async function deleteStoredFile(bucket: string, storagePath: string) {
  try {
    await fs.unlink(resolveStoragePath(bucket, storagePath));
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function massBalanceFileName(input: {
  tcNumber?: string | null;
  shipmentNo?: string | null;
  productKey?: string | null;
}) {
  const tc = safePart(input.tcNumber || "tc", "tc");
  const shipment = safePart(input.shipmentNo || "shipment", "shipment");
  const product = safePart(input.productKey || "lot", "lot");
  return `${tc}_${shipment}_${product}.xlsx`;
}

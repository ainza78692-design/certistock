import { config } from "./config.js";

const normalizePin = (value: unknown) => String(value || "").trim();

export function assertAdminDeletePin(pin: unknown) {
  if (normalizePin(pin) !== normalizePin(config.adminDeletePin)) {
    const error = new Error("Invalid admin PIN");
    (error as any).statusCode = 403;
    throw error;
  }
}

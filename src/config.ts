import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ClinicInfo } from "./types.js";

export function loadClinicConfig(path = "config/clinic.json"): ClinicInfo {
  const abs = resolve(process.cwd(), path);
  return JSON.parse(readFileSync(abs, "utf8")) as ClinicInfo;
}

"use server";

import { assertCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import {
  getImportSecret,
  importDumpRequireEmpty,
  importSecretsEqual,
  parseDumpJson,
} from "@/lib/dump-import";

export type ImportDataState = {
  error?: string;
  ok?: boolean;
  /** Per-table row counts only — no PII */
  imported?: Record<string, number>;
};

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

async function readDumpText(formData: FormData): Promise<string> {
  const pasted = formString(formData, "dumpText").trim();
  if (pasted) return pasted;

  const file = formData.get("dumpFile");
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const blob = file as File;
    if (blob.size <= 0) return "";
    return Buffer.from(await blob.arrayBuffer()).toString("utf8");
  }
  return "";
}

export async function importDumpAction(
  _prev: ImportDataState,
  formData: FormData,
): Promise<ImportDataState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  const expected = getImportSecret();
  if (!expected) {
    return { error: "Import is not enabled on this deployment." };
  }

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`import-data:${ip}`, {
    maxHits: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!allowed) {
    return { error: "Too many attempts. Try again later." };
  }

  const provided = formString(formData, "importSecret");
  if (!provided || !importSecretsEqual(provided, expected)) {
    return { error: "Import secret rejected." };
  }

  let dumpText: string;
  try {
    dumpText = await readDumpText(formData);
  } catch {
    return { error: "Could not read dump upload." };
  }
  if (!dumpText) {
    return { error: "Provide a dump file or paste JSON." };
  }

  let dump;
  try {
    dump = parseDumpJson(dumpText);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "DUMP_TOO_LARGE") {
      return { error: "Dump is too large." };
    }
    return { error: "Dump JSON is invalid or unrecognized." };
  }

  try {
    const imported = await importDumpRequireEmpty(dump, {
      skipEphemeral: true,
    });
    // Counts only — never emails/hashes/tokens.
    console.log(
      "import-data: ok",
      JSON.stringify({
        tables: Object.keys(imported).length,
        rows: Object.values(imported).reduce((a, b) => a + b, 0),
      }),
    );
    return { ok: true, imported };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "REFUSE_NOT_EMPTY") {
      return { error: "Database already has users. Import refused." };
    }
    if (code === "NO_DATABASE_URL") {
      return {
        error:
          "Import requires hosted Postgres (DATABASE_URL). Not available locally.",
      };
    }
    if (code === "SCHEMA_MISSING") {
      return { error: "Database schema is not ready. Try again after deploy." };
    }
    console.error("import-data failed:", code || "unknown");
    return { error: "Import failed. Check secret and dump, then retry." };
  }
}

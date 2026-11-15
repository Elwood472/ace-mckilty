"use server";

import { assertCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { getCurrentUser } from "@/lib/session";
import {
  getImportGate,
  getImportSecret,
  importDumpRequireEmpty,
  importSecretsEqual,
  isImportSecretConfigured,
  MAX_DUMP_BYTES,
  parseDumpJson,
} from "@/lib/dump-import";

export type ImportDataState = {
  error?: string;
  ok?: boolean;
  /** Per-table row counts only — no PII */
  imported?: Record<string, number>;
};

const NOT_FOUND = "Not found.";

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

async function readDumpText(formData: FormData): Promise<string> {
  const pasted = formString(formData, "dumpText");
  if (pasted.length > MAX_DUMP_BYTES) {
    throw new Error("DUMP_TOO_LARGE");
  }
  const trimmed = pasted.trim();
  if (trimmed) return trimmed;

  const file = formData.get("dumpFile");
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const blob = file as File;
    if (blob.size <= 0) return "";
    if (blob.size > MAX_DUMP_BYTES) {
      throw new Error("DUMP_TOO_LARGE");
    }
    return Buffer.from(await blob.arrayBuffer()).toString("utf8");
  }
  return "";
}

export async function importDumpAction(
  _prev: ImportDataState,
  formData: FormData,
): Promise<ImportDataState> {
  // Fail closed with a generic message — never advertise the import feature.
  if (!isImportSecretConfigured()) {
    return { error: NOT_FOUND };
  }

  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sign in required." };
  }

  const ip = await getClientIp();
  if (
    !(await checkRateLimit(`import-data-ip:${ip}`, {
      maxHits: 3,
      windowMs: 15 * 60 * 1000,
    }))
  ) {
    return { error: "Too many attempts. Try again later." };
  }
  if (
    !(await checkRateLimit("import-data-global", {
      maxHits: 8,
      windowMs: 60 * 60 * 1000,
    }))
  ) {
    return { error: "Too many attempts. Try again later." };
  }
  if (
    !(await checkRateLimit(`import-data-user:${user.id}`, {
      maxHits: 3,
      windowMs: 15 * 60 * 1000,
    }))
  ) {
    return { error: "Too many attempts. Try again later." };
  }

  let gate;
  try {
    gate = await getImportGate(user.id);
  } catch {
    return { error: NOT_FOUND };
  }
  if (!gate.available || gate.locked || !gate.eligible) {
    return { error: NOT_FOUND };
  }

  const expected = getImportSecret();
  const provided = formString(formData, "importSecret");
  // Always run compare when expected is set (it is — gate.available).
  if (!provided || !importSecretsEqual(provided, expected)) {
    return { error: "Rejected." };
  }

  let dumpText: string;
  try {
    dumpText = await readDumpText(formData);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "DUMP_TOO_LARGE") {
      return { error: "Dump is too large." };
    }
    return { error: "Could not read upload." };
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
      operatorId: user.id,
    });
    // Counts only — never emails/hashes/tokens/secrets.
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
    if (
      code === "REFUSE_NOT_EMPTY" ||
      code === "REFUSE_LOCKED" ||
      code === "SCHEMA_MISSING" ||
      code === "NO_DATABASE_URL"
    ) {
      return { error: NOT_FOUND };
    }
    console.error("import-data failed:", code || "unknown");
    return { error: "Import failed." };
  }
}

import "server-only";

import {
  getImportGate,
  isImportSecretConfigured,
} from "@/lib/dump-import";

/** Whether the signed-in user should see the one-time Import header link. */
export async function shouldShowImportLink(
  userId: string | undefined,
): Promise<boolean> {
  if (!userId || !isImportSecretConfigured()) return false;
  try {
    const gate = await getImportGate(userId);
    return gate.available && !gate.locked && gate.eligible;
  } catch {
    return false;
  }
}

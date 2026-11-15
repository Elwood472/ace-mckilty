import "server-only";

import {
  getImportGate,
  isImportSecretConfigured,
} from "@/lib/dump-import";
import { canUseRecoverPasswords } from "@/lib/recover-passwords";

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

/** Set password — signed-in only, while IMPORT_SECRET is bound and not locked. */
export async function shouldShowRecoverLink(
  userId: string | undefined,
): Promise<boolean> {
  return canUseRecoverPasswords(userId);
}

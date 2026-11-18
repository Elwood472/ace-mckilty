"use server";

import { revalidatePath } from "next/cache";
import { assertCsrf } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { normalizeHex, THEME_PRESETS } from "@/lib/theme";

export type ActionState = { error?: string; ok?: string };

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function updateAppearance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertCsrf(formData.get("csrf"));
    const user = await requireUser();

    const preset = s(formData, "preset");
    let accent = s(formData, "accent");
    let page = s(formData, "page");
    let link = s(formData, "link");

    if (preset === "classic" || preset === "reset") {
      accent = "";
      page = "";
      link = "";
    } else if (preset) {
      const found = THEME_PRESETS.find((p) => p.id === preset);
      if (found) {
        accent = found.theme.accent;
        page = found.theme.page;
        link = found.theme.link;
      }
    }

    // Empty strings restore site defaults.
    const accentNorm = accent === "" ? "" : normalizeHex(accent);
    const pageNorm = page === "" ? "" : normalizeHex(page);
    const linkNorm = link === "" ? "" : normalizeHex(link);
    if (accent !== "" && !accentNorm) {
      return { error: "Accent must be a hex color like #000080." };
    }
    if (page !== "" && !pageNorm) {
      return { error: "Page background must be a hex color like #ffffff." };
    }
    if (link !== "" && !linkNorm) {
      return { error: "Link color must be a hex color like #000000." };
    }

    await sql(
      `update users
       set theme_accent = $1, theme_page = $2, theme_link = $3
       where id = $4`,
      [accentNorm ?? "", pageNorm ?? "", linkNorm ?? "", user.id],
    );

    revalidatePath("/", "layout");
    revalidatePath("/profile/appearance");
    revalidatePath("/dashboard");
    return { ok: "Colors saved." };
  } catch {
    return { error: "Could not save colors." };
  }
}

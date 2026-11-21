/** Strict #RRGGBB only — rejects short forms and named colors. */
const HEX = /^#[0-9a-fA-F]{6}$/;

export type UserTheme = {
  accent: string;
  page: string;
  link: string;
};

export const DEFAULT_THEME: UserTheme = {
  accent: "#000080",
  page: "#ffffff",
  link: "#000000",
};

export const THEME_PRESETS: { id: string; label: string; theme: UserTheme }[] =
  [
    {
      id: "classic",
      label: "Classic navy",
      theme: { accent: "#000080", page: "#ffffff", link: "#000000" },
    },
    {
      id: "forest",
      label: "Forest",
      theme: { accent: "#1b4d3e", page: "#f4f7f5", link: "#14352c" },
    },
    {
      id: "slate",
      label: "Slate",
      theme: { accent: "#334155", page: "#f8fafc", link: "#0f172a" },
    },
    {
      id: "wine",
      label: "Wine",
      theme: { accent: "#7a1f2b", page: "#fff8f7", link: "#4a1218" },
    },
  ];

export function normalizeHex(
  raw: string | null | undefined,
): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (!HEX.test(v)) return null;
  return v.toLowerCase();
}

function mixToward(hex: string, toward: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * amount);
  const g = Math.round(ag + (bg - ag) * amount);
  const bl = Math.round(ab + (bb - ab) * amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

export function resolveTheme(row: {
  theme_accent?: string | null;
  theme_page?: string | null;
  theme_link?: string | null;
} | null): UserTheme {
  if (!row) return DEFAULT_THEME;
  return {
    accent: normalizeHex(row.theme_accent) ?? DEFAULT_THEME.accent,
    page: normalizeHex(row.theme_page) ?? DEFAULT_THEME.page,
    link: normalizeHex(row.theme_link) ?? DEFAULT_THEME.link,
  };
}

/** CSS custom properties for `<html style={...}>`. */
export function themeToCssVars(theme: UserTheme): Record<string, string> {
  const accent = theme.accent;
  const soft = mixToward(accent, "#ffffff", 0.18);
  const deep = mixToward(accent, "#000000", 0.22);
  const mist = mixToward(accent, "#ffffff", 0.92);
  return {
    "--navy": accent,
    "--navy-soft": soft,
    "--pine": accent,
    "--pine-deep": deep,
    "--amber": accent,
    "--amber-deep": deep,
    "--restricted": accent,
    "--page": theme.page,
    "--background": theme.page,
    "--fog": theme.page,
    "--mist": mist,
    "--link": theme.link,
    "--link-hover": accent,
    "--foreground": "#000000",
  };
}

export function themeStyleAttribute(theme: UserTheme): string {
  return Object.entries(themeToCssVars(theme))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

/**
 * App email helper.
 * When RESEND_API_KEY is set, sends via Resend.
 * Otherwise logs a clear stub (local / until secret is bound).
 *
 * Cursor app secret to bind: RESEND_API_KEY
 * Optional: EMAIL_FROM (defaults to onboarding@resend.dev)
 */

export type SendEmailResult =
  | { ok: true; mode: "resend" | "stub"; id?: string }
  | { ok: false; mode: "resend" | "stub"; error: string };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from =
    process.env.EMAIL_FROM?.trim() ||
    "Ace McKilty Gift Registry <onboarding@resend.dev>";

  if (!apiKey) {
    // Do not log recipient, subject, or body (invite tokens / PII).
    console.info(
      "[email:stub] RESEND_API_KEY unset — email not sent. Bind RESEND_API_KEY for live mail.",
    );
    return { ok: true, mode: "stub" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html ?? `<pre>${escapeHtml(opts.text)}</pre>`,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        mode: "resend",
        error: data.message || `Resend HTTP ${res.status}`,
      };
    }
    return { ok: true, mode: "resend", id: data.id };
  } catch (e) {
    return {
      ok: false,
      mode: "resend",
      error: e instanceof Error ? e.message : "Send failed",
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function inviteEmailBody(opts: {
  /** Sanitized owner display name(s), e.g. "Charli Bray". */
  listOwnerLabel: string;
  inviteUrl: string;
}): { subject: string; text: string; html: string } {
  // Owner label must already be sanitized/capped by the caller.
  const label = opts.listOwnerLabel.trim();
  const named = label
    ? `a wish list (${label})`
    : "a wish list";
  const subject = label
    ? `Wish list invite (${label}) on Ace McKilty Gift Registry`
    : "Wish list invite on Ace McKilty Gift Registry";
  const lead = `You've been invited to view ${named} on Ace McKilty Gift Registry.`;
  const text =
    `${lead}\n\n` +
    `Open this invite link to get access:\n${opts.inviteUrl}\n\n` +
    `If you don't have an account yet, create one with this same email, then open the link again.`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
      <p>${escapeHtml(lead)}</p>
      <p><a href="${escapeHtml(opts.inviteUrl)}"
        style="display:inline-block;background:#000080;color:#fff;padding:10px 16px;text-decoration:none;font-weight:700">
        Accept invite
      </a></p>
      <p style="color:#555;font-size:12px">Or paste this invite link:<br>${escapeHtml(opts.inviteUrl)}</p>
    </div>`;
  return { subject, text, html };
}

/** Notify list owner(s) that someone requested access — same sendEmail/Resend path as invites. */
export function accessRequestEmailBody(opts: {
  listTitle: string;
  requesterName: string;
  requesterEmail: string;
  reviewUrl: string;
}): { subject: string; text: string; html: string } {
  // Fixed copy only — no attacker-controlled names/titles in outbound mail.
  void opts.listTitle;
  void opts.requesterName;
  void opts.requesterEmail;
  const subject = "Access request on Ace McKilty Gift Registry";
  const text =
    `Someone requested access to a wish list on Ace McKilty Gift Registry.\n\n` +
    `Review and approve or deny the request:\n${opts.reviewUrl}\n`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
      <p>Someone requested access to a wish list on Ace McKilty Gift Registry.</p>
      <p><a href="${escapeHtml(opts.reviewUrl)}"
        style="display:inline-block;background:#000080;color:#fff;padding:10px 16px;text-decoration:none;font-weight:700">
        Review request
      </a></p>
      <p style="color:#555;font-size:12px">Or open:<br>${escapeHtml(opts.reviewUrl)}</p>
    </div>`;
  return { subject, text, html };
}

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
    process.env.EMAIL_FROM?.trim() || "Gift Registry <onboarding@resend.dev>";

  if (!apiKey) {
    console.info(
      "[email:stub] RESEND_API_KEY unset — invite not emailed.\n" +
        `  to: ${opts.to}\n  subject: ${opts.subject}\n  body:\n${opts.text}\n` +
        "  Bind secret RESEND_API_KEY (and optional EMAIL_FROM) for live mail.",
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
  groupName: string;
  inviterName: string;
  inviteUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = `You're invited to ${opts.groupName} on Gift Registry`;
  const text =
    `${opts.inviterName} invited you to the friend circle “${opts.groupName}” on Gift Registry.\n\n` +
    `Open this link to join:\n${opts.inviteUrl}\n\n` +
    `If you don't have an account yet, create one with this same email, then open the link again.`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
      <p><b>${escapeHtml(opts.inviterName)}</b> invited you to the friend circle
      “${escapeHtml(opts.groupName)}” on Gift Registry.</p>
      <p><a href="${escapeHtml(opts.inviteUrl)}"
        style="display:inline-block;background:#000080;color:#fff;padding:10px 16px;text-decoration:none;font-weight:700">
        Accept invite
      </a></p>
      <p style="color:#555;font-size:12px">Or paste this link:<br>${escapeHtml(opts.inviteUrl)}</p>
    </div>`;
  return { subject, text, html };
}

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DeleteAccountForm,
  GrantAccessForms,
  InviteRescueForms,
  ReassignPurchaseForm,
  RevokeAccessForm,
  UnlockForms,
} from "@/app/admin/forms";
import { SiteHeader } from "@/components/site-header";
import { absoluteAppUrl } from "@/lib/app-url";
import { requireAdmin } from "@/lib/admin";
import { ensureCsrfToken } from "@/lib/csrf";
import { formatMdY, formatMdYTime } from "@/lib/dates";
import { sql } from "@/lib/db";

type Props = { params: Promise<{ userId: string }> };

export default async function AdminUserDetailPage({ params }: Props) {
  const admin = await requireAdmin();
  const csrf = await ensureCsrfToken();
  const { userId } = await params;

  const users = await sql<{
    id: string;
    email: string;
    display_name: string;
    created_at: string;
    last_active_at: string | null;
    totp_enabled: boolean;
    email_2fa_enabled: boolean;
  }>(
    `select id, email, display_name, created_at::text as created_at,
            last_active_at::text as last_active_at,
            totp_enabled, email_2fa_enabled
     from users where id = $1`,
    [userId],
  );
  if (!users.length) notFound();
  const user = users[0];

  const sessionCount = await sql<{ n: number }>(
    `select count(*)::int as n from sessions
     where user_id = $1 and expires_at > now()`,
    [userId],
  );

  const ownedLists = await sql<{
    id: string;
    title: string;
    list_type: string;
  }>(
    `select l.id, l.title, l.list_type
     from wish_lists l
     join wish_list_owners o on o.list_id = l.id
     where o.user_id = $1
     order by l.list_type, l.title`,
    [userId],
  );

  const viewersOnTheirLists = await sql<{
    list_id: string;
    list_title: string;
    viewer_id: string;
    viewer_name: string;
    viewer_email: string;
  }>(
    `select l.id as list_id, l.title as list_title,
            u.id as viewer_id, u.display_name as viewer_name, u.email as viewer_email
     from wish_list_owners o
     join wish_lists l on l.id = o.list_id
     join list_access a on a.list_id = l.id
     join users u on u.id = a.user_id
     where o.user_id = $1
     order by l.title, u.display_name`,
    [userId],
  );

  const listsTheyCanView = await sql<{
    list_id: string;
    list_title: string;
    owners: string;
  }>(
    `select l.id as list_id, l.title as list_title,
            string_agg(ou.display_name, ', ' order by ou.display_name) as owners
     from list_access a
     join wish_lists l on l.id = a.list_id
     join wish_list_owners o on o.list_id = l.id
     join users ou on ou.id = o.user_id
     where a.user_id = $1
     group by l.id, l.title
     order by l.title`,
    [userId],
  );

  const invitesSent = await sql<{
    id: string;
    email: string | null;
    token: string;
    list_title: string;
    expires_at: string;
  }>(
    `select i.id, i.email, i.token, l.title as list_title,
            i.expires_at::text as expires_at
     from list_invites i
     join wish_lists l on l.id = i.list_id
     where i.invited_by = $1
       and i.accepted_at is null
       and i.expires_at > now()
     order by i.created_at desc`,
    [userId],
  );

  const invitesToThem = await sql<{
    id: string;
    token: string;
    list_title: string;
    inviter: string;
    expires_at: string;
  }>(
    `select i.id, i.token, l.title as list_title,
            u.display_name as inviter,
            i.expires_at::text as expires_at
     from list_invites i
     join wish_lists l on l.id = i.list_id
     join users u on u.id = i.invited_by
     where i.email is not null
       and lower(i.email) = lower($1)
       and i.accepted_at is null
       and i.expires_at > now()
     order by i.created_at desc`,
    [user.email],
  );

  const pendingRequests = await sql<{
    id: string;
    list_title: string;
    requester: string;
    requester_email: string;
    created_at: string;
  }>(
    `select r.id, l.title as list_title,
            u.display_name as requester, u.email as requester_email,
            r.created_at::text as created_at
     from list_access_requests r
     join wish_lists l on l.id = r.list_id
     join wish_list_owners o on o.list_id = l.id and o.user_id = $1
     join users u on u.id = r.requester_id
     where r.status = 'pending'
     order by r.created_at`,
    [userId],
  );

  const recentAudit = await sql<{
    action: string;
    detail: unknown;
    created_at: string;
    actor_name: string;
  }>(
    `select a.action, a.detail, a.created_at::text as created_at,
            u.display_name as actor_name
     from admin_audit_log a
     join users u on u.id = a.actor_id
     where a.target_user_id = $1
     order by a.created_at desc
     limit 20`,
    [userId],
  );

  // Admin-only spoilers: purchase marks this user made, and marks on lists they own.
  const purchasesTheyMarked = await sql<{
    purchase_id: string;
    item_title: string;
    list_title: string;
    for_names: string;
    created_at: string;
  }>(
    `select p.id as purchase_id, i.title as item_title, l.title as list_title,
            string_agg(ou.display_name, ', ' order by ou.display_name) as for_names,
            p.created_at::text as created_at
     from purchases p
     join items i on i.id = p.item_id
     join wish_lists l on l.id = i.list_id
     join wish_list_owners o on o.list_id = l.id
     join users ou on ou.id = o.user_id
     where p.buyer_user_id = $1 and p.buyer_purged = false
     group by p.id, i.id, l.id
     order by p.created_at desc
     limit 50`,
    [userId],
  );

  const purchasesOnTheirLists = await sql<{
    purchase_id: string;
    item_title: string;
    list_title: string;
    buyer_name: string;
    buyer_email: string;
    created_at: string;
  }>(
    `select p.id as purchase_id, i.title as item_title, l.title as list_title,
            b.display_name as buyer_name, b.email as buyer_email,
            p.created_at::text as created_at
     from wish_list_owners o
     join wish_lists l on l.id = o.list_id
     join items i on i.list_id = l.id
     join purchases p on p.item_id = i.id and p.buyer_purged = false
     join users b on b.id = p.buyer_user_id
     where o.user_id = $1
     order by p.created_at desc
     limit 50`,
    [userId],
  );

  return (
    <>
      <SiteHeader user={admin} />
      <main className="site-main">
        <p>
          <Link href="/admin">← Users</Link>
          {" · "}
          <Link href="/dashboard">Home</Link>
        </p>
        <h1 style={{ color: "#000080", fontSize: 20, marginTop: 8 }}>
          {user.display_name}
        </h1>
        <p style={{ fontSize: 13, marginTop: 4 }}>
          {user.email}
          <br />
          Joined {formatMdY(user.created_at)} · Last active{" "}
          {formatMdYTime(user.last_active_at)} · Sessions{" "}
          {sessionCount[0]?.n ?? 0} · 2FA{" "}
          {[
            user.totp_enabled ? "authenticator" : null,
            user.email_2fa_enabled ? "email" : null,
          ]
            .filter(Boolean)
            .join(", ") || "none"}
          <br />
          <span style={{ color: "#555", fontSize: 12 }}>
            Last active updates on login, gift changes, purchases, and
            profile/colors saves (not which action).
          </span>
          <br />
          <Link href={`/profile/${user.id}`}>Profile</Link>
          {ownedLists[0] ? (
            <>
              {" · "}
              <Link href={`/lists/${ownedLists[0].id}`}>Personal list</Link>
            </>
          ) : null}
        </p>
        {userId === admin.id ? (
          <p
            style={{
              fontSize: 12,
              color: "#555",
              maxWidth: 560,
              marginTop: 8,
            }}
          >
            Opening your own gift list still uses normal owner rules — purchase
            marks stay hidden so you don&apos;t see spoilers. This admin page
            never lists gifts or buyers.
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
          <div className="panel" style={{ minWidth: 280, flex: "1 1 320px" }}>
            <div className="panel-head">Owned lists</div>
            <div style={{ padding: 10, fontSize: 13 }}>
              {ownedLists.length === 0 ? (
                <p style={{ color: "#555", margin: 0 }}>None</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {ownedLists.map((l) => (
                    <li key={l.id}>
                      <Link href={`/lists/${l.id}`}>{l.title}</Link>{" "}
                      <span style={{ color: "#555" }}>({l.list_type})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="panel" style={{ minWidth: 280, flex: "1 1 320px" }}>
            <div className="panel-head">Who can view their lists</div>
            <div style={{ padding: 10, fontSize: 13 }}>
              {viewersOnTheirLists.length === 0 ? (
                <p style={{ color: "#555", margin: 0 }}>Nobody yet</p>
              ) : (
                <table className="legacy-table" style={{ width: "100%" }}>
                  <tbody>
                    {viewersOnTheirLists.map((v) => (
                      <tr key={`${v.list_id}-${v.viewer_id}`}>
                        <td>
                          {v.viewer_name}
                          <div style={{ fontSize: 11, color: "#555" }}>
                            {v.viewer_email} · {v.list_title}
                          </div>
                        </td>
                        <td align="right">
                          <RevokeAccessForm
                            csrf={csrf}
                            targetUserId={userId}
                            listId={v.list_id}
                            viewerId={v.viewer_id}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="panel" style={{ minWidth: 280, flex: "1 1 320px" }}>
            <div className="panel-head">Lists they can view</div>
            <div style={{ padding: 10, fontSize: 13 }}>
              {listsTheyCanView.length === 0 ? (
                <p style={{ color: "#555", margin: 0 }}>None</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {listsTheyCanView.map((l) => (
                    <li key={l.list_id}>
                      <Link href={`/lists/${l.list_id}`}>{l.list_title}</Link>
                      <span style={{ color: "#555" }}> — {l.owners}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
          <div className="panel" style={{ minWidth: 280, flex: "1 1 360px" }}>
            <div className="panel-head">Open invites they sent</div>
            <div style={{ padding: 10, fontSize: 13 }}>
              {invitesSent.length === 0 ? (
                <p style={{ color: "#555", margin: 0 }}>None</p>
              ) : (
                invitesSent.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      borderBottom: "1px solid #ddd",
                      paddingBottom: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      {i.email ?? "(no email)"} · {i.list_title}
                    </div>
                    <InviteRescueForms
                      csrf={csrf}
                      inviteId={i.id}
                      targetUserId={userId}
                      inviteUrl={absoluteAppUrl(`/invite/${i.token}`)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel" style={{ minWidth: 280, flex: "1 1 360px" }}>
            <div className="panel-head">Open invites to their email</div>
            <div style={{ padding: 10, fontSize: 13 }}>
              {invitesToThem.length === 0 ? (
                <p style={{ color: "#555", margin: 0 }}>None</p>
              ) : (
                invitesToThem.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      borderBottom: "1px solid #ddd",
                      paddingBottom: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      From {i.inviter} · {i.list_title}
                    </div>
                    <InviteRescueForms
                      csrf={csrf}
                      inviteId={i.id}
                      targetUserId={userId}
                      inviteUrl={absoluteAppUrl(`/invite/${i.token}`)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
          <div className="panel" style={{ minWidth: 280, flex: "1 1 420px" }}>
            <div className="panel-head">Purchases they marked (admin only)</div>
            <div style={{ padding: 10, fontSize: 13 }}>
              <p style={{ fontSize: 12, color: "#555", marginTop: 0 }}>
                Reassign moves the secret “bought” mark to another account by
                email. Normal gift lists still hide buyers from list owners.
              </p>
              {purchasesTheyMarked.length === 0 ? (
                <p style={{ color: "#555", margin: 0 }}>None</p>
              ) : (
                purchasesTheyMarked.map((p) => (
                  <div
                    key={p.purchase_id}
                    style={{
                      borderBottom: "1px solid #ddd",
                      paddingBottom: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <b>{p.item_title}</b> for {p.for_names}
                    </div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      {p.list_title} · {formatMdY(p.created_at)}
                    </div>
                    <ReassignPurchaseForm
                      csrf={csrf}
                      targetUserId={userId}
                      purchaseId={p.purchase_id}
                      itemTitle={p.item_title}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel" style={{ minWidth: 280, flex: "1 1 420px" }}>
            <div className="panel-head">Purchases on their lists (admin only)</div>
            <div style={{ padding: 10, fontSize: 13 }}>
              {purchasesOnTheirLists.length === 0 ? (
                <p style={{ color: "#555", margin: 0 }}>None</p>
              ) : (
                purchasesOnTheirLists.map((p) => (
                  <div
                    key={p.purchase_id}
                    style={{
                      borderBottom: "1px solid #ddd",
                      paddingBottom: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <b>{p.item_title}</b>
                    </div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      Buyer {p.buyer_name} ({p.buyer_email}) · {p.list_title} ·{" "}
                      {formatMdY(p.created_at)}
                    </div>
                    <ReassignPurchaseForm
                      csrf={csrf}
                      targetUserId={userId}
                      purchaseId={p.purchase_id}
                      itemTitle={p.item_title}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
          <div className="panel" style={{ minWidth: 280, flex: "1 1 360px" }}>
            <div className="panel-head">Pending access requests on their lists</div>
            <div style={{ padding: 10, fontSize: 13 }}>
              {pendingRequests.length === 0 ? (
                <p style={{ color: "#555", margin: 0 }}>None</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {pendingRequests.map((r) => (
                    <li key={r.id}>
                      {r.requester} ({r.requester_email}) → {r.list_title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="panel" style={{ minWidth: 280, flex: "1 1 360px" }}>
            <div className="panel-head">Grant access</div>
            <div style={{ padding: 10 }}>
              <GrantAccessForms
                csrf={csrf}
                targetUserId={userId}
                targetEmail={user.email}
              />
            </div>
          </div>

          <div className="panel" style={{ minWidth: 280, flex: "1 1 360px" }}>
            <div className="panel-head">Unlock / auth help</div>
            <div style={{ padding: 10 }}>
              <UnlockForms csrf={csrf} targetUserId={userId} />
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16, maxWidth: 720 }}>
          <div className="panel-head">Recent admin actions on this user</div>
          <div style={{ padding: 10, fontSize: 12 }}>
            {recentAudit.length === 0 ? (
              <p style={{ color: "#555", margin: 0 }}>None yet</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {recentAudit.map((a, i) => (
                  <li key={`${a.created_at}-${i}`}>
                    {formatMdY(a.created_at)} · {a.actor_name} · {a.action}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {userId !== admin.id ? (
          <div className="panel" style={{ marginTop: 16, maxWidth: 480 }}>
            <div className="panel-head">Delete account</div>
            <div style={{ padding: 10 }}>
              <DeleteAccountForm
                csrf={csrf}
                targetUserId={userId}
                targetEmail={user.email}
              />
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

import { sql } from "@/lib/db";

export type HomeUpdate = {
  id: string;
  text: string;
  at: string;
};

const LIMIT = 20;

/**
 * Recent “what happened” lines for the signed-in user’s Gift Registry home.
 * Copy names the kind of event (no purchase spoilers).
 */
export async function listHomeUpdates(userId: string): Promise<HomeUpdate[]> {
  const [gifts, accepted, viewers] = await Promise.all([
    sql<{
      actor_id: string;
      actor_name: string;
      day_et: string;
      at: string;
      n: number;
    }>(
      `select i.created_by as actor_id,
              u.display_name as actor_name,
              ((i.created_at at time zone 'America/New_York')::date)::text as day_et,
              max(i.created_at)::text as at,
              count(*)::int as n
       from items i
       join users u on u.id = i.created_by
       where i.created_by <> $1
         and i.created_at > now() - interval '45 days'
         and exists (
           select 1 from list_access a
           where a.list_id = i.list_id and a.user_id = $1
         )
       group by i.created_by, u.display_name,
                (i.created_at at time zone 'America/New_York')::date`,
      [userId],
    ),
    sql<{
      id: string;
      actor_name: string;
      at: string;
    }>(
      `select r.id::text as id,
              string_agg(distinct ou.display_name, ' / ' order by ou.display_name)
                as actor_name,
              r.decided_at::text as at
       from list_access_requests r
       join wish_list_owners o on o.list_id = r.list_id
       join users ou on ou.id = o.user_id
       where r.requester_id = $1
         and r.status = 'approved'
         and r.decided_at is not null
         and r.decided_at > now() - interval '45 days'
       group by r.id, r.decided_at`,
      [userId],
    ),
    sql<{
      user_id: string;
      list_id: string;
      actor_name: string;
      list_type: string;
      list_title: string;
      at: string;
    }>(
      `select a.user_id::text as user_id,
              a.list_id::text as list_id,
              u.display_name as actor_name,
              l.list_type,
              l.title as list_title,
              a.created_at::text as at
       from list_access a
       join users u on u.id = a.user_id
       join wish_lists l on l.id = a.list_id
       where a.user_id <> $1
         and a.created_at > now() - interval '45 days'
         and exists (
           select 1 from wish_list_owners o
           where o.list_id = a.list_id and o.user_id = $1
         )`,
      [userId],
    ),
  ]);

  const updates: HomeUpdate[] = [];

  for (const g of gifts) {
    const text =
      g.n === 1
        ? `${g.actor_name} added a gift`
        : `${g.actor_name} added ${g.n} gifts`;
    updates.push({
      id: `gift:${g.actor_id}:${g.day_et}`,
      text,
      at: g.at,
    });
  }

  for (const a of accepted) {
    updates.push({
      id: `accepted:${a.id}`,
      text: `${a.actor_name} accepted your request`,
      at: a.at,
    });
  }

  for (const v of viewers) {
    const text =
      v.list_type === "personal"
        ? `${v.actor_name} can now see your list`
        : `${v.actor_name} can now see ${v.list_title}`;
    updates.push({
      id: `viewer:${v.list_id}:${v.user_id}`,
      text,
      at: v.at,
    });
  }

  updates.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return tb - ta;
  });

  return updates.slice(0, LIMIT);
}

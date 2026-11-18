-- Open invites must be bound to an email; expire any legacy null-email tokens.
update list_invites
set expires_at = least(expires_at, now())
where email is null
  and accepted_at is null
  and expires_at > now();

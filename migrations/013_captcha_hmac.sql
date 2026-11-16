-- Shared captcha HMAC material across hosted workers (math CAPTCHA fallback).

create table if not exists app_runtime_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

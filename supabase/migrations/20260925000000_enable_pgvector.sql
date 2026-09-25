create extension if not exists vector with schema extensions;

create table if not exists public.repository_chunks (
  id uuid primary key default gen_random_uuid(),
  repository_url text not null,
  commit_sha text not null,
  file_path text not null,
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists repository_chunks_embedding_idx
  on public.repository_chunks using hnsw (embedding vector_cosine_ops);

alter table public.repository_chunks enable row level security;
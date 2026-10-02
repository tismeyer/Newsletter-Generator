-- ============================================================
-- helvetic manual store — run this once in Supabase SQL editor
-- ============================================================

-- Enable the pgvector extension (already available in Supabase)
create extension if not exists vector;

-- ── manuals table ───────────────────────────────────────────
-- One row per uploaded manual. Upserted on each new upload.
create table if not exists manuals (
  id           uuid primary key default gen_random_uuid(),
  manual_name  text not null,          -- e.g. "OM-A"
  full_title   text,                   -- e.g. "Operations Manual Part A"
  revision     text,                   -- e.g. "01/19"
  revision_date text,                  -- e.g. "06.01.2026"
  filename     text,                   -- original PDF filename
  chunk_count  integer default 0,
  uploaded_at  timestamptz default now(),
  unique (manual_name, revision)
);

-- ── manual_chunks table ─────────────────────────────────────
-- One row per chunk. Old chunks for a manual+revision are
-- deleted and replaced on each upload (handled in app code).
create table if not exists manual_chunks (
  id            uuid primary key default gen_random_uuid(),
  manual_id     uuid references manuals(id) on delete cascade,
  manual_name   text not null,         -- denormalised for fast filtering
  revision      text,
  chapter       text,                  -- e.g. "8"
  section       text,                  -- e.g. "8.3.2"
  section_title text,                  -- e.g. "Wind Shear"
  page          integer,
  chunk_index   integer,               -- order within the document
  chunk_type    text default 'body',   -- body | table | note | caution | warning | heading
  content       text not null,
  citation      text,                  -- pre-formatted: "OM-A 8.3.2 Wind Shear (p.42)"
  embedding     vector(1024),          -- voyage-3 embedding
  fts           tsvector generated always as (to_tsvector('english', content)) stored
);

-- ── indexes ─────────────────────────────────────────────────
-- Semantic similarity search (cosine distance)
create index if not exists manual_chunks_embedding_idx
  on manual_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Full-text keyword search
create index if not exists manual_chunks_fts_idx
  on manual_chunks using gin(fts);

-- Fast lookup by manual
create index if not exists manual_chunks_manual_idx
  on manual_chunks(manual_name);

-- ── retrieval function ───────────────────────────────────────
-- Called from FastAPI: returns top-k chunks by hybrid score.
-- Combines semantic similarity + keyword rank (RRF fusion).
create or replace function search_chunks(
  query_embedding vector(1024),
  query_text      text,
  match_count     int     default 6,
  manual_filter   text[]  default null   -- null = search all manuals
)
returns table (
  id            uuid,
  manual_name   text,
  revision      text,
  section       text,
  section_title text,
  page          integer,
  chunk_type    text,
  content       text,
  citation      text,
  semantic_rank bigint,
  keyword_rank  bigint,
  rrf_score     float
)
language sql stable
as $$
  with semantic as (
    select
      c.id,
      row_number() over (order by c.embedding <=> query_embedding) as rank
    from manual_chunks c
    where manual_filter is null or c.manual_name = any(manual_filter)
    order by c.embedding <=> query_embedding
    limit 60
  ),
  keyword as (
    select
      c.id,
      row_number() over (order by ts_rank(c.fts, websearch_to_tsquery('english', query_text)) desc) as rank
    from manual_chunks c
    where manual_filter is null or c.manual_name = any(manual_filter)
      and c.fts @@ websearch_to_tsquery('english', query_text)
    order by ts_rank(c.fts, websearch_to_tsquery('english', query_text)) desc
    limit 60
  ),
  fused as (
    select
      coalesce(s.id, k.id) as id,
      coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + k.rank), 0) as rrf_score,
      s.rank as semantic_rank,
      k.rank as keyword_rank
    from semantic s
    full outer join keyword k on s.id = k.id
  )
  select
    c.id, c.manual_name, c.revision, c.section, c.section_title,
    c.page, c.chunk_type, c.content, c.citation,
    f.semantic_rank, f.keyword_rank, f.rrf_score
  from fused f
  join manual_chunks c on c.id = f.id
  order by f.rrf_score desc
  limit match_count;
$$;

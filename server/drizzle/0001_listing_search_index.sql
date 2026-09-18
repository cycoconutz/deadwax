-- Full-text search over the fields that matter to crate diggers.
-- Expression index: queried with websearch_to_tsquery + ILIKE fallback.
CREATE INDEX "listings_search_idx" ON "listings" USING gin (
  to_tsvector(
    'english',
    coalesce("title", '') || ' ' ||
    coalesce("artist", '') || ' ' ||
    coalesce("label", '')
  )
);

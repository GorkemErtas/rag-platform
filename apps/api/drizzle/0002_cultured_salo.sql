ALTER TABLE "documents" ADD COLUMN "indexing_fingerprint" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding_dimensions" integer;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD COLUMN "documents_skipped" integer DEFAULT 0 NOT NULL;
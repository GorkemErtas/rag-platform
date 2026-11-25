CREATE TABLE "deployment_identity" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_budgets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" integer NOT NULL,
	CONSTRAINT "request_budgets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE INDEX "request_budgets_expiry_idx" ON "request_budgets" USING btree ("expires_at");
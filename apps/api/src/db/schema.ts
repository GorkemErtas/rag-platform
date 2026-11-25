import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  uniqueIndex,
  vector,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

import { EMBEDDING_CONFIG } from "../config/constants.js";

export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);

export const ingestionStatusEnum = pgEnum("ingestion_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "PENDING",
  "INDEXED",
  "FAILED",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("USER"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(),
  title: text("title"),
  checksum: text("checksum"),
  indexingFingerprint: text("indexing_fingerprint"),
  embeddingModel: text("embedding_model"),
  embeddingDimensions: integer("embedding_dimensions"),
  status: documentStatusEnum("status").notNull().default("PENDING"),
  errorMessage: text("error_message"),
  indexedAt: timestamp("indexed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", {
      dimensions: EMBEDDING_CONFIG.dimensions,
    }),
  },
  (table) => [
    uniqueIndex("document_chunks_document_chunk_idx").on(
      table.documentId,
      table.chunkIndex,
    ),
  ],
);

export const ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  status: ingestionStatusEnum("status").notNull().default("PENDING"),
  documentsProcessed: integer("documents_processed").notNull().default(0),
  documentsSkipped: integer("documents_skipped").notNull().default(0),
  documentsFailed: integer("documents_failed").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const searchLogs = pgTable("search_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  query: text("query").notNull(),
  resultCount: integer("result_count").notNull().default(0),
  answered: boolean("answered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const deploymentIdentity = pgTable("deployment_identity", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const requestBudgets = pgTable("request_budgets", {
  key: text("key").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: integer("used").notNull(),
}, (table) => [
  primaryKey({ columns: [table.key, table.windowStart] }),
  index("request_budgets_expiry_idx").on(table.expiresAt),
]);

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { documentChunks, documents } from "../db/schema.js";

test("atomic reindex, rollback, unchanged skip, retry and no duplicates", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to an isolated PostgreSQL database with pgvector",
}, async () => {
  // Never migrate, truncate or reindex the application's configured database.
  const { env } = await import("../config/env.js");
  env.databaseUrl = process.env.TEST_DATABASE_URL;
  const { indexDocument } = await import("../services/ingestion-service.js");
  const { pool: applicationPool } = await import("../db/index.js");
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
  const schema = `rag_test_${randomUUID().replaceAll("-", "")}`;
  let isolated: Pool | undefined;
  try {
    await admin.query(`create schema ${schema}`);
    isolated = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public`, connectionTimeoutMillis: 5000 });
    const database = drizzle(isolated);
    const { readIndexRevision } = await import("../services/query-cache.js");
    await isolated.query(`
      create table documents (
        id serial primary key, path text unique not null, title text, checksum text,
        indexing_fingerprint text, embedding_model text, embedding_dimensions integer,
        status text not null default 'PENDING', error_message text, indexed_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table document_chunks (
        id serial primary key, document_id integer references documents(id) on delete cascade,
        chunk_index integer not null, content text not null, token_count integer,
        embedding vector(768), unique(document_id, chunk_index)
      );
    `);
    const vector = [1, ...Array<number>(767).fill(0)];
    let calls = 0;
    const embed = async () => { calls += 1; return vector; };
    const source = { path: "test.md", title: "Test", content: "Old searchable facts." };
    assert.equal(await indexDocument(source, database, embed, 0), "indexed");
    const originalRevision = await readIndexRevision(isolated);
    const [old] = await database.select().from(documents);
    assert.equal(await indexDocument(source, database, embed, 0), "skipped");
    assert.equal(calls, 1);
    assert.equal(await readIndexRevision(isolated), originalRevision);

    const changed = { ...source, content: "Replacement facts." };
    await assert.rejects(indexDocument(changed, database, async () => {
      const [visible] = await database.select().from(documents);
      assert.equal(visible.status, "INDEXED");
      assert.equal(visible.checksum, old.checksum);
      assert.equal((await database.select().from(documentChunks))[0].content, source.content);
      throw new Error("embedding unavailable");
    }, 0), /embedding unavailable/);
    const [afterFailure] = await database.select().from(documents);
    assert.equal(afterFailure.status, "INDEXED");
    assert.equal(afterFailure.checksum, old.checksum);
    assert.equal(afterFailure.indexedAt?.toISOString(), old.indexedAt?.toISOString());
    assert.equal(await readIndexRevision(isolated), originalRevision);

    // A DB insert error after deletion must roll back both chunks and metadata.
    await assert.rejects(indexDocument(changed, database, async () => [1, 0], 0));
    assert.equal((await database.select().from(documentChunks))[0].content, source.content);
    assert.equal((await database.select().from(documents))[0].checksum, old.checksum);

    assert.equal(await indexDocument(changed, database, embed, 0), "indexed");
    assert.equal((await database.select().from(documents)).length, 1);
    assert.equal((await database.select().from(documentChunks)).length, 1);
    assert.equal((await database.select().from(documentChunks))[0].content, changed.content);
    assert.equal((await database.select().from(documents))[0].errorMessage, null);
    assert.notEqual(await readIndexRevision(isolated), originalRevision);
    await database.update(documents).set({ indexingFingerprint: "stale" }).where(eq(documents.id, old.id));
    assert.equal(await indexDocument(changed, database, embed, 0), "indexed");
  } finally {
    await isolated?.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
    await applicationPool.end();
  }
});

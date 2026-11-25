import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import { Pool } from "pg";
import { env, rootDir } from "../config/env.js";

test("demo identity refuses existing data and PostgreSQL quotas are atomic across connections", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to an isolated PostgreSQL database",
}, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const schema = `demo_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  url.searchParams.set("options", `-c search_path=${schema},public`);
  env.databaseUrl = url.toString();
  env.demoDatabaseName = decodeURIComponent(url.pathname.slice(1));
  env.demoMode = true;
  env.corpusPath = path.join(rootDir, "demo-corpus");
  const { pool } = await import("../db/index.js");
  const otherConnection = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(`
      create table deployment_identity (key text primary key, value text not null);
      create table documents (id serial primary key, path text not null);
      create table users (id serial primary key);
      create table ingestion_runs (id serial primary key);
      create table search_logs (id serial primary key);
      create table request_budgets (key text not null, window_start timestamptz not null,
        expires_at timestamptz not null, used integer not null, primary key (key, window_start));
    `);
    const { initializeDemoDatabase, assertDemoDatabase } = await import("../services/demo-service.js");
    await assert.rejects(assertDemoDatabase(), /not initialized/);
    await pool.query("insert into documents (path) values ('original-case-study.md')");
    await assert.rejects(initializeDemoDatabase(), /empty dedicated database/);
    assert.equal((await pool.query("select count(*)::int as count from deployment_identity")).rows[0].count, 0);
    assert.equal((await pool.query("select count(*)::int as count from documents")).rows[0].count, 1);
    // This removes only the fixture in our randomly named test schema.
    await pool.query("delete from documents");
    await initializeDemoDatabase();
    await initializeDemoDatabase();
    await assertDemoDatabase();
    const { consumeBudget } = await import("../services/usage-service.js");
    const results = await Promise.all(Array.from({ length: 25 }, () => consumeBudget("atomic-test", 3, 86400000)));
    assert.equal(results.filter(Boolean).length, 3);
    const persisted = await otherConnection.query("select used from request_budgets where key = 'atomic-test'");
    assert.equal(persisted.rows[0].used, 3);
    assert.equal(await consumeBudget("atomic-test", 3, 86400000), false);
    await pool.query("insert into documents (path) values ('original-case-study.md')");
    await assert.rejects(assertDemoDatabase(), /different corpus/);
  } finally {
    await pool.end();
    await otherConnection.end();
    // Never touch public tables or the application's configured database.
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});

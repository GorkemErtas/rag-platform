"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  AuthUser,
  DashboardResponse,
} from "@playable-factory/shared";

import { getDashboard, runIngestion } from "@/lib/api";
import {
  clearAuthSession,
  getAuthUser,
} from "@/lib/auth";

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [dashboard, setDashboard] =
    useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionMessage, setIngestionMessage] = useState("");

  useEffect(() => {
    const currentUser = getAuthUser();

    if (!currentUser) {
      router.replace("/");
      return;
    }

    if (currentUser.role !== "ADMIN") {
      router.replace("/chat");
      return;
    }

    setUser(currentUser);

    async function loadDashboard() {
      try {
        const result = await getDashboard();
        setDashboard(result);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load dashboard.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboard();
  }, [router]);

  const answeredRate = useMemo(() => {
    if (!dashboard || dashboard.stats.totalSearches === 0) {
      return 0;
    }

    return Math.round(
      (dashboard.stats.answeredSearches /
        dashboard.stats.totalSearches) *
        100,
    );
  }, [dashboard]);

  async function handleIngestion() {
  if (isIngesting) {
    return;
  }

  const confirmed = window.confirm(
    "Re-index the entire corpus? This will regenerate embeddings for all documents.",
  );

  if (!confirmed) {
    return;
  }

  setIsIngesting(true);
  setIngestionMessage("");
  setError("");

  try {
    const result = await runIngestion();

    setIngestionMessage(
      `Ingestion completed: ${result.documentsProcessed} processed, ${result.documentsFailed} failed.`,
    );

    const refreshedDashboard = await getDashboard();
    setDashboard(refreshedDashboard);
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : "Corpus ingestion failed.",
    );
  } finally {
    setIsIngesting(false);
  }
}

function formatDocumentError(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("429") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("rate limit")
  ) {
    return "Embedding rate limit exceeded during ingestion.";
  }

  if (
    normalized.includes("401") ||
    normalized.includes("unauthorized") ||
    normalized.includes("api key")
  ) {
    return "Embedding provider authentication failed.";
  }

  return "Document ingestion failed. Check server logs for details.";
}

  function handleLogout() {
    clearAuthSession();
    router.replace("/");
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#111827] text-white">
              <SparkIcon />
            </div>

            <div>
              <p className="text-sm font-semibold text-text-primary">
                Lumen Knowledge
              </p>
              <p className="text-xs text-text-secondary">
                Administration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/chat")}
              className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
            >
              Knowledge assistant
            </button>

            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-text-primary">
                {user.email}
              </p>
              <p className="text-xs text-text-secondary">
                Administrator
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="ml-1 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-muted"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8">
            <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="mb-8">
                    <span className="inline-flex rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                        Admin
                    </span>

                    <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
                        System overview
                    </h1>

                    <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
                        Monitor corpus health, ingestion activity, and retrieval usage.
                    </p>
                    </div>

                </div>
                {ingestionMessage && (
                <div className="mb-6 rounded-xl border border-green-200 bg-success-soft px-4 py-3 text-sm text-success">
                    {ingestionMessage}
                </div>
                )}
          <span className="inline-flex rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
            Admin
          </span>

          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
            System overview
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            Monitor corpus health, ingestion activity, and retrieval usage.
          </p>
        </div>

        {isLoading && (
          <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border bg-white shadow-sm">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Spinner />
              </div>

              <p className="mt-4 text-sm font-medium text-text-primary">
                Loading dashboard
              </p>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-2xl border border-red-200 bg-danger-soft p-5 text-sm text-red-700">
            {error}
          </div>
        )}

        {dashboard && !isLoading && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Indexed documents"
                value={dashboard.stats.indexedDocuments}
                helper={`${dashboard.stats.totalDocuments} total`}
              />

              <MetricCard
                label="Vector chunks"
                value={dashboard.stats.totalChunks}
                helper="Searchable passages"
              />

              <MetricCard
                label="Searches"
                value={dashboard.stats.totalSearches}
                helper="Recorded queries"
              />

              <MetricCard
                label="Answer rate"
                value={`${answeredRate}%`}
                helper={`${dashboard.stats.answeredSearches} grounded answers`}
              />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <section className="rounded-2xl border border-border bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">
                      Recent searches
                    </h2>
                    <p className="mt-1 text-xs text-text-secondary">
                      Latest knowledge retrieval requests.
                    </p>
                  </div>

                  <span className="text-xs text-text-muted">
                    {dashboard.recentSearches.length} shown
                  </span>
                </div>

                {dashboard.recentSearches.length === 0 ? (
                  <EmptyState text="No searches recorded yet." />
                ) : (
                  <div className="divide-y divide-border">
                    {dashboard.recentSearches.map((search) => (
                      <div
                        key={search.id}
                        className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {search.query}
                          </p>

                          <p className="mt-1 text-xs text-text-secondary">
                            {formatDate(search.createdAt)} ·{" "}
                            {search.resultCount} source
                            {search.resultCount === 1 ? "" : "s"}
                          </p>
                        </div>

                        <span
                          className={
                            search.answered
                              ? "shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success"
                              : "shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-text-secondary"
                          }
                        >
                          {search.answered
                            ? "Answered"
                            : "No answer"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-white shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Ingestion history
                  </h2>

                  <p className="mt-1 text-xs text-text-secondary">
                    Recent indexing runs.
                  </p>
                </div>

                {dashboard.ingestionRuns.length === 0 ? (
                  <EmptyState text="No ingestion runs recorded." />
                ) : (
                  <div className="divide-y divide-border">
                    {dashboard.ingestionRuns.map((run) => (
                      <div
                        key={run.id}
                        className="px-5 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-text-primary">
                            Run #{run.id}
                          </p>

                          <StatusBadge status={run.status} />
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <MiniStat
                            label="Processed"
                            value={run.documentsProcessed}
                          />

                          <MiniStat
                            label="Failed"
                            value={run.documentsFailed}
                          />
                        </div>

                        <p className="mt-3 text-xs text-text-muted">
                          {formatNullableDate(run.startedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="mt-6 rounded-2xl border border-border bg-white shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
                <div>
                    <h2 className="text-sm font-semibold text-text-primary">
                    Corpus documents
                    </h2>

                    <p className="mt-1 text-xs text-text-secondary">
                    Indexing status for every source file.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                    {dashboard.stats.failedDocuments > 0 && (
                    <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger">
                        {dashboard.stats.failedDocuments} failed
                    </span>
                    )}

                    <button
                    type="button"
                    onClick={handleIngestion}
                    disabled={isIngesting}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                    {isIngesting ? (
                        <>
                        <Spinner />
                        Re-indexing...
                        </>
                    ) : (
                        "Re-index corpus"
                    )}
                    </button>
                </div>
                </div>

              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                      <th className="px-5 py-3 sm:px-6">
                        Document
                      </th>
                      <th className="px-5 py-3">
                        Status
                      </th>
                      <th className="px-5 py-3">
                        Indexed
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border">
                    {dashboard.documents.map((document) => (
                      <tr key={document.id}>
                        <td className="px-5 py-3.5 sm:px-6">
                          <p className="text-sm font-medium text-text-primary">
                            {document.title ?? document.path}
                          </p>

                          <p className="mt-1 text-xs text-text-secondary">
                            {document.path}
                          </p>

                          {document.errorMessage && (
                            <p className="mt-1 text-xs text-danger">
                                {formatDocumentError(document.errorMessage)}
                            </p>
                            )}
                        </td>

                        <td className="px-5 py-3.5">
                          <StatusBadge status={document.status} />
                        </td>

                        <td className="px-5 py-3.5 text-xs text-text-secondary">
                          {formatNullableDate(document.indexedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-text-secondary">
        {label}
      </p>

      <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary">
        {typeof value === "number"
          ? value.toLocaleString()
          : value}
      </p>

      <p className="mt-2 text-xs text-text-muted">
        {helper}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-surface-muted p-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </p>

      <p className="mt-1 text-lg font-semibold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const classes =
    status === "COMPLETED" || status === "INDEXED"
      ? "bg-success-soft text-success"
      : status === "FAILED"
        ? "bg-danger-soft text-danger"
        : "bg-warning-soft text-warning";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${classes}`}
    >
      {status}
    </span>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div className="px-5 py-10 text-center text-sm text-text-secondary">
      {text}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNullableDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  return formatDate(value);
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M12 2.75c.46 4.83 4.42 8.79 9.25 9.25-4.83.46-8.79 4.42-9.25 9.25C11.54 16.42 7.58 12.46 2.75 12 7.58 11.54 11.54 7.58 12 2.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 animate-spin text-brand"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
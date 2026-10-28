"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  AuthUser,
  ChatResponse,
} from "@playable-factory/shared";

import { askQuestion } from "@/lib/api";
import {
  clearAuthSession,
  getAuthUser,
} from "@/lib/auth";

export default function ChatPage() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const currentUser = getAuthUser();

    if (!currentUser) {
      router.replace("/");
      return;
    }

    setUser(currentUser);
  }, [router]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedQuestion = question.trim();

    if (!normalizedQuestion || isLoading) {
      return;
    }

    setError("");
    setResult(null);
    setIsLoading(true);

    try {
      const response = await askQuestion({
        question: normalizedQuestion,
      });

      setResult(response);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to process your question.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    router.replace("/");
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
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
                Grounded AI workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user.role === "ADMIN" && (
              <button
                type="button"
                onClick={() => router.push("/admin")}
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-muted hover:text-text-primary sm:inline-flex"
              >
                Admin dashboard
              </button>
            )}

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-text-primary">
                {user.email}
              </p>
              <p className="text-xs text-text-secondary">
                {user.role}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-muted"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8 lg:py-12">
        <div className="min-w-0">
          <div className="mb-8">
            <p className="text-sm font-medium text-brand">
              Knowledge assistant
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
              Ask the indexed corpus
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
              Answers are generated only from indexed sources. If the corpus
              does not contain enough information, the assistant will say so.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-md">
            <form
              onSubmit={handleSubmit}
              className="border-b border-border p-4 sm:p-5"
            >
              <label
                htmlFor="question"
                className="sr-only"
              >
                Ask a question
              </label>

              <textarea
                id="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about SDKs, build pipelines, incidents, localization..."
                rows={4}
                className="w-full resize-none bg-transparent text-sm leading-6 text-text-primary outline-none placeholder:text-text-muted sm:text-base"
              />

              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="hidden text-xs text-text-muted sm:block">
                  Cited evidence is shown with every supported answer.
                </p>

                <button
                  type="submit"
                  disabled={isLoading || !question.trim()}
                  className="ml-auto flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <LoadingIcon />
                      Searching...
                    </>
                  ) : (
                    <>
                      Ask
                      <ArrowIcon />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="min-h-[360px] p-5 sm:p-7">
              {!result && !error && !isLoading && (
                <EmptyState />
              )}

              {isLoading && (
                <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                    <LoadingIcon />
                  </div>

                  <p className="text-sm font-medium text-text-primary">
                    Searching the corpus
                  </p>

                  <p className="mt-1 text-sm text-text-secondary">
                    Retrieving relevant documents and generating a grounded
                    answer.
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              {result && (
                <AnswerPanel result={result} />
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-text-primary">
              How it works
            </p>

            <div className="mt-4 space-y-4">
              <Step
                number="1"
                title="Hybrid retrieval"
                description="Semantic search retrieves corpus passages while preserving document context."
              />

              <Step
                number="2"
                title="Grounded generation"
                description="Gemini receives only the retrieved corpus context."
              />

              <Step
                number="3"
                title="Source attribution"
                description="Answers cite supporting passages with quotations from the indexed documents."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-text-primary">
              Try asking
            </p>

            <div className="mt-3 space-y-2">
              {[
                "What is the maximum file size for an AppLovin playable, and how does it ship?",
                "How do I initialize the current Lumen SDK, and what happened to lumen.track?",
                "Why are sound assets built in a separate pass?",
                "What caused the March 2026 AppLovin rejections and what was fixed?",
                "Which languages must every playable ship with, and what is the fallback?",
                "How many paid vacation days do employees receive each year?",
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuestion(example)}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-left text-xs leading-5 text-text-secondary transition hover:border-brand/30 hover:bg-brand-soft hover:text-text-primary"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function AnswerPanel({
  result,
}: {
  result: ChatResponse;
}) {
  if (!result.answered) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-text-secondary">
          <SearchIcon />
        </div>

        <h2 className="text-base font-semibold text-text-primary">
          Not enough information
        </h2>

        <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
          {result.answer}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Grounded answer
        </span>
      </div>

      <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-text-primary sm:text-[15px]">
        {result.answer}
      </div>

      {result.sources.length > 0 && (
        <div className="mt-8 border-t border-border pt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">
              Cited sources
            </h2>

            <span className="text-xs text-text-muted">
              {result.sources.length} sources
            </span>
          </div>

          <div className="space-y-2">
            {result.sources.map((source, index) => (
              <div
                key={`${source.path}-${source.chunkIndex}-${index}`}
                className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-muted/50 p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {source.sourceId ? `[Source ${source.sourceId}] ` : ""}
                    {source.title ?? source.path}
                  </p>

                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {source.path}
                  </p>
                  {source.quotes?.map((quote, quoteIndex) => (
                    <blockquote key={quoteIndex} className="mt-2 border-l-2 border-border pl-3 text-xs leading-5 text-text-secondary">
                      {quote}
                    </blockquote>
                  ))}
                </div>

                <span
                  title="Cosine similarity is a retrieval ranking signal, not answer confidence."
                  className="shrink-0 rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-text-secondary shadow-sm"
                >
                  Cosine {source.similarity.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <SparkIcon />
      </div>

      <h2 className="text-base font-semibold text-text-primary">
        Ready when you are
      </h2>

      <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
        Ask a question about the indexed corpus to retrieve relevant sources
        and generate a grounded answer.
      </p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-xs font-semibold text-brand">
        {number}
      </div>

      <div>
        <p className="text-sm font-medium text-text-primary">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-text-secondary">
          {description}
        </p>
      </div>
    </div>
  );
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

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle
        cx="11"
        cy="11"
        r="6"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m16 16 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 animate-spin"
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

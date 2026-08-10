"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { saveAuthSession } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(
  event: FormEvent<HTMLFormElement>,
) {
  event.preventDefault();

  setError("");
  setIsLoading(true);

  try {
    const result = await login({
      email,
      password,
    });

    saveAuthSession(result);

    if (result.user.role === "ADMIN") {
      router.push("/admin");
      return;
    }

    router.push("/chat");
  } catch (error) {
    if (error instanceof Error) {
      setError(error.message);
    } else {
      setError("Unable to sign in. Please try again.");
    }
  } finally {
    setIsLoading(false);
  }
}

  return (
    <main className="relative flex min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand/10 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 right-0 h-[32rem] w-[32rem] rounded-full bg-violet-200/30 blur-3xl"
      />

      <section className="relative hidden w-[52%] flex-col justify-between border-r border-white/10 bg-[#111827] p-12 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#111827] shadow-lg shadow-black/10">
            <SparkIcon />
          </div>

          <div>
            <p className="text-sm font-semibold tracking-wide">
              Lumen Knowledge
            </p>
            <p className="text-xs text-slate-400">
              Internal AI workspace
            </p>
          </div>
        </div>

        <div className="max-w-xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Grounded knowledge retrieval
          </div>

          <h1 className="text-4xl font-semibold leading-[1.12] tracking-[-0.035em] xl:text-5xl">
            Ask your knowledge base.
            <span className="block text-slate-400">
              Get answers you can verify.
            </span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
            Search internal documentation, investigate production history,
            and receive grounded answers with source attribution.
          </p>

          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            <Feature
              value="RAG"
              label="Grounded answers"
            />
            <Feature
              value="MCP"
              label="Agent ready"
            />
            <Feature
              value="RBAC"
              label="Secure access"
            />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Playable Factory · AI Software Engineer Case Study
        </p>
      </section>

      <section className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-[430px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111827] text-white">
              <SparkIcon />
            </div>

            <div>
              <p className="text-sm font-semibold text-text-primary">
                Lumen Knowledge
              </p>
              <p className="text-xs text-text-secondary">
                Internal AI workspace
              </p>
            </div>
          </div>

          <div className="mb-8">
            <p className="mb-2 text-sm font-medium text-brand">
              Welcome back
            </p>

            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
              Sign in to your workspace
            </h2>

            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Use your account to access grounded search, chat, and
              workspace tools.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-text-primary"
              >
                Email address
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text-primary shadow-sm outline-none transition placeholder:text-text-muted hover:border-border-strong focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-text-primary"
                >
                  Password
                </label>
              </div>

              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-xl border border-border bg-white px-4 pr-12 text-sm text-text-primary shadow-sm outline-none transition placeholder:text-text-muted hover:border-border-strong focus:border-brand focus:ring-4 focus:ring-brand/10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-text-secondary transition hover:text-text-primary"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex gap-3 rounded-xl border border-red-200 bg-danger-soft px-4 py-3 text-sm text-red-700"
              >
                <ErrorIcon />

                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <LoadingIcon />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowIcon />
                </>
              )}
            </button>
          </form>

          <div className="my-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted">
              Secure workspace
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="rounded-xl border border-border bg-white/70 p-4 shadow-sm backdrop-blur">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <ShieldIcon />
              </div>

              <div>
                <p className="text-sm font-medium text-text-primary">
                  Role-based access
                </p>

                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Workspace features are protected according to your
                  assigned user or administrator role.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-text-muted">
            Internal knowledge system · Answers are grounded in indexed
            sources.
          </p>
        </div>
      </section>
    </main>
  );
}

function Feature({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <p className="text-sm font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{label}</p>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M12 2.75c.46 4.83 4.42 8.79 9.25 9.25-4.83.46-8.79 4.42-9.25 9.25C11.54 16.42 7.58 12.46 2.75 12 7.58 11.54 11.54 7.58 12 2.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M2.75 12s3.25-6 9.25-6 9.25 6 9.25 6-3.25 6-9.25 6-9.25-6-9.25-6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle
        cx="12"
        cy="12"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="m4 4 16 16M10.6 6.15A9.9 9.9 0 0 1 12 6c6 0 9.25 6 9.25 6a14 14 0 0 1-2.2 3.05M6.2 7.2C3.92 9.05 2.75 12 2.75 12s3.25 6 9.25 6a9.6 9.6 0 0 0 3.05-.48M9.85 9.85a3 3 0 0 0 4.3 4.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
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

function ErrorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="mt-0.5 h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 7.5v5M12 16.5h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M12 3 5.5 5.5v5.25c0 4.35 2.7 8.15 6.5 9.5 3.8-1.35 6.5-5.15 6.5-9.5V5.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 11.75 1.65 1.65 3.5-3.65"
        stroke="currentColor"
        strokeWidth="1.7"
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
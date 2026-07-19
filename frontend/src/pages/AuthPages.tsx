import { useState } from "react";

import { ApiError } from "../api/client";
import { useLogin, useRegister, useSetup } from "../api/hooks";
import { Button, ErrorText, Field, Input } from "../components/ui";

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
          <svg viewBox="0 0 64 64" className="h-8 w-8">
            <path
              d="M20 46V20a2 2 0 0 1 2-2h12a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6h-8v12"
              fill="none"
              stroke="#3B9EFF"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-[14px] text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error) return "Something went wrong — is the server reachable?";
  return "";
}

export function SetupPage() {
  const setup = useSetup();
  const [form, setForm] = useState({ display_name: "", email: "", password: "" });

  return (
    <AuthShell title="Welcome to Pitstop" subtitle="Set up the admin account for this instance.">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setup.mutate(form);
        }}
      >
        <Field label="Your name">
          <Input
            required
            autoFocus
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="Alex"
          />
        </Field>
        <Field label="Email">
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input
            required
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <ErrorText>{errorMessage(setup.error)}</ErrorText>
        <Button type="submit" className="w-full" disabled={setup.isPending}>
          {setup.isPending ? "Creating…" : "Create admin account"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function LoginPage({ allowRegistration }: { allowRegistration: boolean }) {
  const login = useLogin();
  const register = useRegister();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ display_name: "", email: "", password: "" });
  const active = mode === "login" ? login : register;

  return (
    <AuthShell
      title={mode === "login" ? "Welcome back" : "Create your account"}
      subtitle={mode === "login" ? "Sign in to your garage." : "Get your own private garage."}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "login") login.mutate({ email: form.email, password: form.password });
          else register.mutate(form);
        }}
      >
        {mode === "register" && (
          <Field label="Your name">
            <Input
              required
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Alex"
            />
          </Field>
        )}
        <Field label="Email">
          <Input
            required
            type="email"
            autoFocus
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" hint={mode === "register" ? "At least 8 characters." : undefined}>
          <Input
            required
            type="password"
            minLength={mode === "register" ? 8 : undefined}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <ErrorText>{errorMessage(active.error)}</ErrorText>
        <Button type="submit" className="w-full" disabled={active.isPending}>
          {active.isPending ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
      {allowRegistration && (
        <button
          type="button"
          className="mt-6 text-center text-[14px] text-muted hover:text-text"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? (
            <>
              New here? <span className="text-accent">Create an account</span>
            </>
          ) : (
            <>
              Already have an account? <span className="text-accent">Sign in</span>
            </>
          )}
        </button>
      )}
    </AuthShell>
  );
}

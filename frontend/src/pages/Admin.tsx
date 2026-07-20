import { ArrowLeft, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  useAdminSettings,
  useAdminUsers,
  useCreateAdminUser,
  useDeleteAdminUser,
  useUpdateAdminSettings,
} from "../api/hooks";
import type { User } from "../api/types";
import { Button, Card, ErrorText, Field, Input, Segmented, Spinner } from "../components/ui";
import { shortDate } from "../lib/format";

function AddUserCard() {
  const createUser = useCreateAdminUser();
  const [form, setForm] = useState({ email: "", display_name: "" });
  const [copied, setCopied] = useState(false);
  const created = createUser.data;

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
        <UserPlus size={15} className="text-accent" /> Add a user
      </h2>
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        Creates the account right away — no need to open registration. You'll get a
        temporary password to pass along.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setCopied(false);
          createUser.mutate(form, {
            onSuccess: () => setForm({ email: "", display_name: "" }),
          });
        }}
      >
        <Field label="Email">
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Display name">
          <Input
            required
            maxLength={80}
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </Field>
        <ErrorText>{createUser.error instanceof ApiError ? createUser.error.message : ""}</ErrorText>
        <Button type="submit" variant="surface" disabled={createUser.isPending}>
          Create account
        </Button>
      </form>
      {created && (
        <div className="mt-4 rounded-control bg-surface2 p-3.5">
          <p className="text-[13px] font-semibold">{created.user.email}</p>
          <p className="mt-1 font-mono text-[16px] font-bold tracking-wide text-accent">
            {created.temp_password}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Send them their email and this password — it won't be shown again after you
            leave this page. They'll get the welcome tour on first sign-in; suggest they
            change the password in Settings.
          </p>
          <Button
            variant="surface"
            className="mt-3"
            onClick={async () => {
              await navigator.clipboard.writeText(created.temp_password);
              setCopied(true);
            }}
          >
            {copied ? "Copied ✓" : "Copy password"}
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function AdminPage({ user }: { user: User }) {
  const { data: users } = useAdminUsers();
  const { data: settings } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const deleteUser = useDeleteAdminUser();

  if (!users || !settings) return <Spinner />;

  const registrationValue =
    settings.allow_registration === null ? "env" : settings.allow_registration ? "on" : "off";

  return (
    <div className="pt-safe pb-safe mx-auto max-w-lg px-4">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/settings"
          aria-label="Back to settings"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </Link>
        <h1 className="flex-1 text-[22px] font-extrabold tracking-tight">Admin</h1>
        <ShieldCheck size={19} className="text-accent" />
      </header>

      <div className="space-y-5">
        <Card>
          <h2 className="mb-1 text-[15px] font-semibold">Open registration</h2>
          <p className="mb-3 text-[13px] leading-relaxed text-muted">
            Whether visitors can create their own accounts. "Follow env" uses the
            ALLOW_REGISTRATION variable (currently {settings.env_default ? "on" : "off"}).
          </p>
          <Segmented
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
              { value: "env", label: "Follow env" },
            ]}
            value={registrationValue}
            onChange={(value) =>
              updateSettings.mutate({
                allow_registration: value === "env" ? null : value === "on",
              })
            }
          />
          <p className="mt-2 text-[12px] text-muted">
            Right now: registration is{" "}
            <span className={settings.effective_allow_registration ? "text-good" : "text-danger"}>
              {settings.effective_allow_registration ? "open" : "closed"}
            </span>
            .
          </p>
        </Card>

        <AddUserCard />

        <Card>
          <h2 className="mb-3 text-[15px] font-semibold">Users</h2>
          <div className="space-y-2.5">
            {users.map((account) => (
              <div key={account.id} className="flex items-center gap-3 rounded-control bg-surface2 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">
                    {account.display_name}
                    {account.role === "admin" && (
                      <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                        ADMIN
                      </span>
                    )}
                    {account.id === user.id && (
                      <span className="ml-2 text-[11px] font-medium text-muted">(you)</span>
                    )}
                  </p>
                  <p className="truncate text-[12px] text-muted">
                    {account.email} · {account.vehicle_count} vehicle
                    {account.vehicle_count === 1 ? "" : "s"} · {account.entry_count} entr
                    {account.entry_count === 1 ? "y" : "ies"} · joined {shortDate(account.created_at)}
                  </p>
                </div>
                {account.id !== user.id && (
                  <button
                    aria-label={`Delete ${account.email}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted hover:text-danger"
                    disabled={deleteUser.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${account.email} and ALL their vehicles and history? This can't be undone.`
                        )
                      ) {
                        deleteUser.mutate(account.id);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

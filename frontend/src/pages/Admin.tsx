import { ArrowLeft, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import {
  useAdminSettings,
  useAdminUsers,
  useDeleteAdminUser,
  useUpdateAdminSettings,
} from "../api/hooks";
import type { User } from "../api/types";
import { Card, Segmented, Spinner } from "../components/ui";
import { shortDate } from "../lib/format";

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

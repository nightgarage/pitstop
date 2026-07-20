import { ArrowLeft, Bell, Download, FileUp, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  useChangePassword,
  useChannels,
  useLogout,
  useSaveChannels,
  useUpdateProfile,
} from "../api/hooks";
import type { Channel, DistanceUnit, User, VolumeUnit } from "../api/types";
import { DISTANCE_UNIT_LABELS, VOLUME_UNIT_LABELS } from "../api/types";
import { Button, Card, ErrorText, Field, Input, Select } from "../components/ui";

const CHANNEL_META: Record<Channel["kind"], { label: string; fields: { key: string; label: string; placeholder: string }[] }> = {
  ntfy: {
    label: "ntfy",
    fields: [
      { key: "url", label: "Server", placeholder: "https://ntfy.sh" },
      { key: "topic", label: "Topic", placeholder: "my-pitstop" },
    ],
  },
  gotify: {
    label: "Gotify",
    fields: [
      { key: "url", label: "Server", placeholder: "https://push.example.com" },
      { key: "token", label: "App token", placeholder: "A1b2..." },
    ],
  },
  webhook: {
    label: "Webhook",
    fields: [{ key: "url", label: "URL", placeholder: "https://example.com/hook" }],
  },
  email: {
    label: "Email",
    fields: [{ key: "address", label: "Send to", placeholder: "you@example.com" }],
  },
};

function ChannelsCard() {
  const { data: saved } = useChannels();
  const save = useSaveChannels();
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    if (saved) {
      setChannels(
        (Object.keys(CHANNEL_META) as Channel["kind"][]).map(
          (kind) => saved.find((c) => c.kind === kind) ?? { kind, config: {}, enabled: false }
        )
      );
    }
  }, [saved]);

  const update = (kind: Channel["kind"], patch: Partial<Channel>) =>
    setChannels(channels.map((c) => (c.kind === kind ? { ...c, ...patch } : c)));

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
        <Bell size={15} className="text-accent" /> Notification channels
      </h2>
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        In-app notifications are always on. Reminders can also reach you through these.
        (Email needs SMTP configured on the server.)
      </p>
      <div className="space-y-3">
        {channels.map((channel) => (
          <div key={channel.kind} className="rounded-control bg-surface2 p-3.5">
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-[14px] font-semibold">{CHANNEL_META[channel.kind].label}</span>
              <input
                type="checkbox"
                checked={channel.enabled}
                onChange={(e) => update(channel.kind, { enabled: e.target.checked })}
                className="h-5 w-5 accent-[#3b9eff]"
              />
            </label>
            {channel.enabled && (
              <div className="mt-3 space-y-2.5">
                {CHANNEL_META[channel.kind].fields.map((field) => (
                  <Field key={field.key} label={field.label}>
                    <Input
                      value={channel.config[field.key] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(e) =>
                        update(channel.kind, {
                          config: { ...channel.config, [field.key]: e.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="surface"
        className="mt-4"
        disabled={save.isPending}
        onClick={() => save.mutate(channels)}
      >
        {save.isSuccess && !save.isPending ? "Saved ✓" : "Save channels"}
      </Button>
    </Card>
  );
}

export default function SettingsPage({ user }: { user: User }) {
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const logout = useLogout();

  const [profile, setProfile] = useState({
    display_name: user.display_name,
    distance_unit: user.distance_unit,
    volume_unit: user.volume_unit,
    currency: user.currency,
    show_driving_conditions: user.show_driving_conditions,
  });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });

  return (
    <div className="pt-safe pb-safe mx-auto max-w-lg px-4">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to garage"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </Link>
        <h1 className="text-[22px] font-extrabold tracking-tight">Settings</h1>
      </header>

      <div className="space-y-5">
        <Card>
          <h2 className="mb-4 text-[15px] font-semibold">Profile & units</h2>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              updateProfile.mutate(profile);
            }}
          >
            <Field label="Display name">
              <Input
                required
                value={profile.display_name}
                onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Distance">
                <Select
                  value={profile.distance_unit}
                  onChange={(e) => setProfile({ ...profile, distance_unit: e.target.value as DistanceUnit })}
                >
                  {Object.entries(DISTANCE_UNIT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Volume">
                <Select
                  value={profile.volume_unit}
                  onChange={(e) => setProfile({ ...profile, volume_unit: e.target.value as VolumeUnit })}
                >
                  {Object.entries(VOLUME_UNIT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Currency" hint="3-letter code, e.g. USD">
              <Input
                required
                maxLength={3}
                minLength={3}
                value={profile.currency}
                onChange={(e) => setProfile({ ...profile, currency: e.target.value.toUpperCase() })}
              />
            </Field>
            <label className="flex cursor-pointer items-center justify-between rounded-control bg-surface2 px-3.5 py-3">
              <span>
                <span className="block text-[14px] font-medium">Log driving conditions</span>
                <span className="block text-[12px] text-muted">
                  Adds a city / highway / mixed field to fuel-ups
                </span>
              </span>
              <input
                type="checkbox"
                checked={profile.show_driving_conditions}
                onChange={(e) =>
                  setProfile({ ...profile, show_driving_conditions: e.target.checked })
                }
                className="h-5 w-5 accent-[#3b9eff]"
              />
            </label>
            <ErrorText>
              {updateProfile.error instanceof ApiError ? updateProfile.error.message : ""}
            </ErrorText>
            <Button type="submit" variant="surface" disabled={updateProfile.isPending}>
              {updateProfile.isSuccess && !updateProfile.isPending ? "Saved ✓" : "Save"}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 text-[15px] font-semibold">Change password</h2>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              changePassword.mutate(passwords, {
                onSuccess: () => setPasswords({ current_password: "", new_password: "" }),
              });
            }}
          >
            <Field label="Current password">
              <Input
                required
                type="password"
                value={passwords.current_password}
                onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input
                required
                type="password"
                minLength={8}
                value={passwords.new_password}
                onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
              />
            </Field>
            <ErrorText>
              {changePassword.error instanceof ApiError ? changePassword.error.message : ""}
            </ErrorText>
            <Button type="submit" variant="surface" disabled={changePassword.isPending}>
              {changePassword.isSuccess && !changePassword.isPending ? "Changed ✓" : "Change password"}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-1 text-[15px] font-semibold">Import & export</h2>
          <p className="mb-4 text-[13px] leading-relaxed text-muted">
            Your data is yours. Bring in history from another tracker's CSV export, or take
            everything out any time.
          </p>
          <div className="space-y-2.5">
            <Link
              to="/settings/import"
              className="flex items-center gap-2.5 rounded-control bg-surface2 px-4 py-3 text-[14px] font-semibold transition-colors hover:bg-line"
            >
              <FileUp size={17} strokeWidth={1.8} className="text-accent" />
              Import from CSV…
            </Link>
            <a
              href="/api/export/json"
              className="flex items-center gap-2.5 rounded-control bg-surface2 px-4 py-3 text-[14px] font-semibold transition-colors hover:bg-line"
            >
              <Download size={17} strokeWidth={1.8} className="text-accent" />
              Export everything (JSON)
            </a>
            <a
              href="/api/export/csv"
              className="flex items-center gap-2.5 rounded-control bg-surface2 px-4 py-3 text-[14px] font-semibold transition-colors hover:bg-line"
            >
              <Download size={17} strokeWidth={1.8} className="text-accent" />
              Export everything (CSV bundle)
            </a>
          </div>
        </Card>

        <ChannelsCard />

        {user.role === "admin" && (
          <Link
            to="/admin"
            className="flex items-center gap-2.5 rounded-card bg-surface p-4 text-[14px] font-semibold transition-colors hover:bg-surface2"
          >
            <ShieldCheck size={17} strokeWidth={1.8} className="text-accent" />
            Admin — users & instance settings
          </Link>
        )}

        <Link
          to="/welcome"
          className="flex items-center gap-2.5 rounded-card bg-surface p-4 text-[14px] font-semibold transition-colors hover:bg-surface2"
        >
          <Sparkles size={17} strokeWidth={1.8} className="text-accent" />
          Replay the welcome tour
        </Link>

        <Card className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold">{user.display_name}</div>
            <div className="text-[13px] text-muted">
              {user.email}
              {user.role === "admin" && " · admin"}
            </div>
          </div>
          <Button variant="danger-ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <span className="flex items-center gap-1.5">
              <LogOut size={16} /> Sign out
            </span>
          </Button>
        </Card>

        {/* AGPL §13: people using a hosted instance must be able to get the source */}
        <p className="px-1 text-center text-[12px] leading-relaxed text-muted">
          Pitstop · free software under{" "}
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            className="text-accent"
            target="_blank"
            rel="noreferrer"
          >
            AGPL-3.0
          </a>
          <br />
          <a
            href="https://github.com/nightgarage/pitstop"
            className="text-accent"
            target="_blank"
            rel="noreferrer"
          >
            Source code
          </a>{" "}
          ·{" "}
          <a href="/api/docs" className="text-accent" target="_blank" rel="noreferrer">
            API docs
          </a>
        </p>
      </div>
    </div>
  );
}

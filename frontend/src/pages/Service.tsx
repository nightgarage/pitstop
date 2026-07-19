import { Plus, Wrench } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAllServices, useReminders } from "../api/hooks";
import type { Reminder, ReminderStatus, ServiceRecord, User } from "../api/types";
import { Card, Spinner } from "../components/ui";
import { money, num, shortDate } from "../lib/format";

const STATUS_META: Record<ReminderStatus, { label: string; dot: string; text: string }> = {
  overdue: { label: "Overdue", dot: "bg-danger", text: "text-danger" },
  due: { label: "Due soon", dot: "bg-warn", text: "text-warn" },
  upcoming: { label: "Upcoming", dot: "bg-good", text: "text-good" },
};

function primaryLine(reminder: Reminder): string {
  const miles = reminder.miles_remaining;
  const days = reminder.days_remaining;
  if (reminder.status === "overdue") {
    if (miles != null && miles < 0) return `${num(Math.abs(miles), 0)} mi over`;
    if (days != null && days < 0) return `${num(Math.abs(days), 0)} days over`;
    return "overdue";
  }
  // soonest side first
  if (miles != null && (days == null || miles / 40 <= days)) return `in ${num(miles, 0)} mi`;
  if (days != null) {
    if (days > 60) {
      return new Date(reminder.next_due_date!).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    }
    return `in ${days} days`;
  }
  return "scheduled";
}

function secondaryLine(reminder: Reminder): string {
  if (reminder.status === "overdue" && reminder.next_due_odometer != null) {
    return `was due at ${num(reminder.next_due_odometer, 0)}`;
  }
  const parts: string[] = [];
  if (reminder.interval_miles != null) parts.push(`every ${num(reminder.interval_miles, 0)} mi`);
  if (reminder.interval_months != null) parts.push(`every ${num(reminder.interval_months, 0)} mo`);
  if (!parts.length && reminder.next_due_date != null) {
    const days = reminder.days_remaining;
    if (days != null && days >= 0) return `in ~${days > 45 ? `${Math.round(days / 30)} months` : `${days} days`}`;
  }
  return parts.join(" / ") || "one-time";
}

function ReminderCard({ reminder }: { reminder: Reminder }) {
  const navigate = useNavigate();
  const meta = STATUS_META[reminder.status];
  return (
    <Card
      className="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface2"
    >
      <button
        className="flex w-full items-center gap-3 text-left"
        onClick={() => navigate(`/vehicles/${reminder.vehicle_id}/reminders/${reminder.id}`)}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface2 text-accent">
          <Wrench size={17} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{reminder.name}</span>
          <span className="block truncate text-[12px] text-muted">{reminder.vehicle_name}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-[14px] font-bold ${meta.text}`}>{primaryLine(reminder)}</span>
          <span className="block text-[12px] text-muted">{secondaryLine(reminder)}</span>
        </span>
      </button>
    </Card>
  );
}

function ServiceRecordCard({ record, currency }: { record: ServiceRecord; currency: string }) {
  const navigate = useNavigate();
  const types = record.items.map((i) => i.service_type).join(", ");
  return (
    <Card className="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface2">
      <button
        className="flex w-full items-center gap-3 text-left"
        onClick={() => navigate(`/vehicles/${record.vehicle_id}/services/${record.id}`)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{types}</span>
          <span className="block truncate text-[12px] text-muted">
            {shortDate(record.date)} · {record.vehicle_name}
            {record.odometer != null && ` · ${num(record.odometer, 0)} mi`}
            {record.is_diy ? " · DIY" : record.shop ? ` · ${record.shop}` : ""}
          </span>
        </span>
        <span className="tabular shrink-0 text-[15px] font-bold">
          {record.total_cost != null ? money(record.total_cost, currency) : ""}
        </span>
      </button>
    </Card>
  );
}

export default function ServicePage({ user }: { user: User }) {
  const { data: reminders, isLoading } = useReminders();
  const { data: services } = useAllServices();

  if (isLoading) return <Spinner />;

  const groups = (["overdue", "due", "upcoming"] as const)
    .map((status) => ({
      status,
      items: reminders?.filter((r) => r.status === status) ?? [],
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-[26px] font-extrabold tracking-tight">Service</h1>
        <Link
          to="/service/records/new"
          className="flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-accent"
        >
          <Plus size={16} strokeWidth={2.2} /> Log service
        </Link>
      </header>

      {groups.length === 0 && (
        <Card className="mb-4 py-8 text-center text-[14px] leading-relaxed text-muted">
          No reminders yet. Add one for oil changes, tire rotations, registration —
          anything on a schedule.
        </Card>
      )}

      {groups.map((group) => {
        const meta = STATUS_META[group.status];
        return (
          <section key={group.status} className="mb-5">
            <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              <span className={meta.text}>{meta.label}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                {group.items.length}
              </span>
            </div>
            <div className="space-y-2.5">
              {group.items.map((reminder) => (
                <ReminderCard key={reminder.id} reminder={reminder} />
              ))}
            </div>
          </section>
        );
      })}

      <Link
        to="/service/reminders/new"
        className="mb-8 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-3.5 text-[15px] font-semibold text-[#001427]"
      >
        <Plus size={18} strokeWidth={2.4} /> Add a reminder
      </Link>

      {services && services.length > 0 && (
        <>
          <h2 className="mb-3 text-[17px] font-bold tracking-tight">History</h2>
          <div className="space-y-2.5">
            {services.map((record) => (
              <ServiceRecordCard key={record.id} record={record} currency={user.currency} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

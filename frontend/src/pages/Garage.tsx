import { Bell, Car, Plus, Settings, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useNotifications, useReminders, useStatsSummary, useVehicles } from "../api/hooks";
import type { Reminder, User, Vehicle, VehicleStatsSummary } from "../api/types";
import { ENERGY_TYPE_LABELS } from "../api/types";
import { Card, Spinner } from "../components/ui";
import { currencyOf, distanceUnit, economyLabel, money, num } from "../lib/format";

const STATUS_STYLES = {
  overdue: { dot: "bg-danger", text: "text-danger" },
  due: { dot: "bg-warn", text: "text-warn" },
  upcoming: { dot: "bg-good", text: "text-good" },
} as const;

function nextServiceLine(reminder: Reminder): string {
  const miles = reminder.miles_remaining;
  const days = reminder.days_remaining;
  if (reminder.status === "overdue") {
    if (miles != null && miles < 0) return `${reminder.name} is ${num(Math.abs(miles), 0)} mi overdue`;
    if (days != null && days < 0) return `${reminder.name} is ${num(Math.abs(days), 0)} days overdue`;
    return `${reminder.name} is overdue`;
  }
  if (miles != null && (days == null || miles / 40 <= days)) {
    return `${reminder.name} in ${num(miles, 0)} mi`;
  }
  if (days != null) return `${reminder.name} in ${days} days`;
  return reminder.name;
}

function describeModel(vehicle: Vehicle): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  return parts.length ? parts.join(" ") : ENERGY_TYPE_LABELS[vehicle.energy_type];
}

function VehicleCard({
  vehicle,
  user,
  summary,
  nextReminder,
}: {
  vehicle: Vehicle;
  user: User;
  summary?: VehicleStatsSummary;
  nextReminder?: Reminder;
}) {
  const navigate = useNavigate();
  const isElectric = vehicle.energy_type === "electric";
  const odometer = summary?.latest_odometer ?? vehicle.odometer_start;
  const dUnit = distanceUnit(vehicle, user);
  const econUnit = economyLabel(vehicle.energy_type, dUnit);
  const hasEntries = summary?.avg_economy != null || (summary?.month_spend ?? 0) > 0;

  return (
    <Card className="cursor-pointer p-4 transition-colors hover:bg-surface2">
      <div onClick={() => navigate(`/vehicles/${vehicle.id}`)}>
        <div className="flex items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-surface2 to-[#1a1a1d] text-accent">
            {isElectric ? <Zap size={28} strokeWidth={1.8} /> : <Car size={28} strokeWidth={1.8} />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[18px] font-bold tracking-tight">{vehicle.name}</div>
            <div className="truncate text-[13px] text-muted">{describeModel(vehicle)}</div>
          </div>
          {vehicle.archived && (
            <span className="ml-auto whitespace-nowrap rounded-full bg-line px-2.5 py-1 text-[11px] font-semibold text-muted">
              Archived
            </span>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <div className="flex-1">
            <div className="tabular text-[20px] font-bold">
              {odometer != null ? num(odometer, 0) : "—"}{" "}
              {odometer != null && <span className="text-xs font-medium text-muted">{dUnit}</span>}
            </div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">Odometer</div>
          </div>
          <div className="flex-1">
            <div className="tabular text-[20px] font-bold">{num(summary?.avg_economy, 1)}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              Avg {econUnit}
            </div>
          </div>
          <div className="flex-1">
            <div className="tabular text-[20px] font-bold">
              {summary ? money(summary.month_spend, currencyOf(vehicle, user)) : "—"}
            </div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">This month</div>
          </div>
        </div>
        {nextReminder ? (
          <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3 text-[13px] text-muted">
            <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[nextReminder.status].dot}`} />
            <span>
              {nextReminder.status === "upcoming" && "Next up: "}
              <span className={`font-semibold ${STATUS_STYLES[nextReminder.status].text}`}>
                {nextServiceLine(nextReminder)}
              </span>
            </span>
          </div>
        ) : (
          !hasEntries && (
            <div className="mt-3.5 border-t border-line pt-3 text-[13px] text-muted">
              Log your first {isElectric ? "charge" : "fill-up"} to see stats here.
            </div>
          )
        )}
      </div>
    </Card>
  );
}

export default function GaragePage({ user }: { user: User }) {
  const { data: vehicles, isLoading } = useVehicles();
  const { data: summaries } = useStatsSummary();
  const { data: reminders } = useReminders();
  const { data: notifications } = useNotifications();
  const unread = notifications?.unread_count ?? 0;

  if (isLoading) return <Spinner />;

  return (
    <>
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Garage</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {vehicles?.length
              ? `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}`
              : "No vehicles yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/vehicles/new"
            aria-label="Add vehicle"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-accent transition-colors hover:bg-surface2"
          >
            <Plus size={20} strokeWidth={2} />
          </Link>
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-text"
          >
            <Bell size={18} strokeWidth={1.8} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Link
            to="/settings"
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-text"
          >
            <Settings size={19} strokeWidth={1.8} />
          </Link>
        </div>
      </header>

      <div className="space-y-3.5">
        {vehicles?.map((vehicle) => (
          <VehicleCard
            key={vehicle.id}
            vehicle={vehicle}
            user={user}
            summary={summaries?.find((s) => s.vehicle_id === vehicle.id)}
            // reminders arrive pre-sorted by urgency, so the first match is the next one
            nextReminder={reminders?.find((r) => r.vehicle_id === vehicle.id)}
          />
        ))}
        {vehicles?.length === 0 && (
          <Card className="flex flex-col items-center py-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface2 text-accent">
              <Car size={32} strokeWidth={1.6} />
            </div>
            <p className="text-[16px] font-semibold">Add your first vehicle</p>
            <p className="mx-8 mt-1.5 text-[13px] leading-relaxed text-muted">
              Your garage is empty. Add a car, truck, or EV to start logging fuel-ups and tracking
              maintenance.
            </p>
            <Link
              to="/vehicles/new"
              className="mt-5 flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-[#001427]"
            >
              <Plus size={17} strokeWidth={2.4} /> Add vehicle
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}

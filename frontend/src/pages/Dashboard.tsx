import { ArrowLeft, Fuel, Pencil, Zap } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { useVehicle, useVehicleStats } from "../api/hooks";
import type { EnergyStats, User } from "../api/types";
import { ENERGY_TYPE_LABELS } from "../api/types";
import EntryList from "../components/EntryList";
import { Card, Spinner } from "../components/ui";
import { currencyOf, distanceUnit, economyLabel, money, num } from "../lib/format";

function Stat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div>
      <div className={`tabular text-[22px] font-bold tracking-tight ${accent ? "text-accent" : ""}`}>
        {value}
        {sub && <span className="ml-1 text-[12px] font-medium text-muted">{sub}</span>}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function EnergyStatsCard({
  title,
  icon,
  stats,
  unit,
  currency,
  perDistance,
}: {
  title: string;
  icon: React.ReactNode;
  stats: EnergyStats;
  unit: string;
  currency: string;
  perDistance: string;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-muted">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Stat label={`Avg ${unit}`} value={num(stats.lifetime, 1)} accent />
        <Stat label={`Last ${unit}`} value={num(stats.last, 1)} />
        <Stat label="Best" value={num(stats.best, 1)} />
        <Stat label="Worst" value={num(stats.worst, 1)} />
        <Stat
          label={`Cost / ${perDistance}`}
          value={stats.cost_per_distance != null ? money(stats.cost_per_distance, currency) : "—"}
        />
        <Stat label="Total spend" value={money(stats.total_spend, currency)} />
      </div>
    </Card>
  );
}

export default function DashboardPage({ user }: { user: User }) {
  const { id } = useParams();
  const vehicleId = Number(id);
  const { data: vehicle, isLoading } = useVehicle(vehicleId);
  const { data: stats } = useVehicleStats(vehicleId);

  if (isLoading || !vehicle || !stats) return <Spinner />;

  const currency = currencyOf(vehicle, user);
  const dUnit = distanceUnit(vehicle, user);
  const model = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");

  return (
    <>
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to garage"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-extrabold tracking-tight">{vehicle.name}</h1>
          <p className="truncate text-[13px] text-muted">
            {model || ENERGY_TYPE_LABELS[vehicle.energy_type]}
            {vehicle.archived && " · archived"}
          </p>
        </div>
        <Link
          to={`/vehicles/${vehicle.id}/edit`}
          aria-label="Edit vehicle"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <Pencil size={17} strokeWidth={1.8} />
        </Link>
      </header>

      <div className="space-y-3.5">
        <Card>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Stat
              label="Odometer"
              value={stats.latest_odometer != null ? num(stats.latest_odometer, 0) : "—"}
              sub={stats.latest_odometer != null ? dUnit : undefined}
            />
            <Stat label="This month" value={money(stats.month_spend, currency)} />
          </div>
        </Card>

        {stats.fuel && (
          <EnergyStatsCard
            title="Fuel"
            icon={<Fuel size={16} strokeWidth={1.8} />}
            stats={stats.fuel}
            unit={economyLabel("gasoline", dUnit)}
            currency={currency}
            perDistance={dUnit}
          />
        )}
        {stats.electric && (
          <EnergyStatsCard
            title="Electric"
            icon={<Zap size={16} strokeWidth={1.8} />}
            stats={stats.electric}
            unit={economyLabel("electric", dUnit)}
            currency={currency}
            perDistance={dUnit}
          />
        )}
        {stats.blended_cost_per_distance != null && (
          <Card>
            <Stat
              label={`Blended cost / ${dUnit} (gas + electric)`}
              value={money(stats.blended_cost_per_distance, currency)}
              accent
            />
          </Card>
        )}

        <div className="flex items-center justify-between pt-2">
          <h2 className="text-[17px] font-bold tracking-tight">History</h2>
          <Link to={`/log?vehicle=${vehicle.id}`} className="text-[13px] font-semibold text-accent">
            + Log new
          </Link>
        </div>
        <EntryList vehicle={vehicle} user={user} withService />
      </div>
    </>
  );
}

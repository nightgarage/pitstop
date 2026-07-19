import { Fuel, Wrench, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useCharges, useFuelUps, useVehicleServices } from "../api/hooks";
import type { ChargeSession, FuelUp, ServiceRecord, User, Vehicle } from "../api/types";
import { currencyOf, distanceUnit, economyLabel, money, num, shortDate, volumeLabel, volumeUnit } from "../lib/format";
import { Card } from "./ui";

type Row =
  | { kind: "fuel"; entry: FuelUp }
  | { kind: "charge"; entry: ChargeSession }
  | { kind: "service"; entry: ServiceRecord };

function EconomyChip({
  row,
  label,
}: {
  row: Exclude<Row, { kind: "service" }>;
  label: string;
}) {
  const { economy, fill_type } = row.entry;
  if (economy != null) {
    return (
      <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-bold text-accent tabular">
        {num(economy, 1)} {label}
      </span>
    );
  }
  const reason = fill_type === "partial" ? "partial" : fill_type === "missed" ? "missed" : "baseline";
  return (
    <span className="rounded-full bg-line px-2.5 py-1 text-[12px] font-medium text-muted">{reason}</span>
  );
}

function ServiceRow({
  record,
  currency,
  dUnit,
}: {
  record: ServiceRecord;
  currency: string;
  dUnit: string;
}) {
  const navigate = useNavigate();
  const types = record.items.map((i) => i.service_type).join(", ");
  return (
    <Card className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface2">
      <button
        className="flex w-full items-center gap-3 text-left"
        onClick={() => navigate(`/vehicles/${record.vehicle_id}/services/${record.id}`)}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-accent">
          <Wrench size={16} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{types}</span>
          <span className="block truncate text-[12px] text-muted tabular">
            {shortDate(record.date)}
            {record.odometer != null && ` · ${num(record.odometer, 0)} ${dUnit}`}
            {record.is_diy ? " · DIY" : record.shop ? ` · ${record.shop}` : ""}
          </span>
        </span>
        <span className="tabular shrink-0 text-[14px] font-bold">
          {record.total_cost != null ? money(record.total_cost, currency) : ""}
        </span>
      </button>
    </Card>
  );
}

export default function EntryList({
  vehicle,
  user,
  limit,
  withService = false,
}: {
  vehicle: Vehicle;
  user: User;
  limit?: number;
  /** interleave service records so the list is the vehicle's full history */
  withService?: boolean;
}) {
  const navigate = useNavigate();
  const wantsFuel = vehicle.energy_type !== "electric";
  const wantsCharge = vehicle.energy_type === "electric" || vehicle.energy_type === "plug_in_hybrid";
  const { data: fuelups } = useFuelUps(wantsFuel ? vehicle.id : undefined);
  const { data: charges } = useCharges(wantsCharge ? vehicle.id : undefined);
  const { data: services } = useVehicleServices(withService ? vehicle.id : undefined);

  const currency = currencyOf(vehicle, user);
  const dUnit = distanceUnit(vehicle, user);
  const vUnit = volumeLabel(volumeUnit(vehicle, user));

  let rows: Row[] = [
    ...(fuelups ?? []).map((entry) => ({ kind: "fuel" as const, entry })),
    ...(charges ?? []).map((entry) => ({ kind: "charge" as const, entry })),
    ...(services ?? []).map((entry) => ({ kind: "service" as const, entry })),
  ];
  rows.sort((a, b) => (a.entry.date < b.entry.date ? 1 : -1));
  if (limit) rows = rows.slice(0, limit);

  if (rows.length === 0) {
    return (
      <Card className="py-8 text-center text-[14px] text-muted">
        Nothing logged yet — save your first {wantsFuel ? "fuel-up" : "charge"} above.
      </Card>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        if (row.kind === "service") {
          return (
            <ServiceRow
              key={`service-${row.entry.id}`}
              record={row.entry}
              currency={currency}
              dUnit={dUnit}
            />
          );
        }
        const entry = row.entry;
        const isFuel = row.kind === "fuel";
        const amount = isFuel
          ? `${num((entry as FuelUp).volume, 2)} ${vUnit}`
          : `${num((entry as ChargeSession).kwh_added, 1)} kWh`;
        const cost = entry.total_cost;
        const econLabel = economyLabel(isFuel ? "gasoline" : "electric", dUnit);
        return (
          <Card
            key={`${row.kind}-${entry.id}`}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface2"
          >
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() =>
                navigate(`/vehicles/${vehicle.id}/${row.kind === "fuel" ? "fuelups" : "charges"}/${entry.id}`)
              }
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-accent">
                {isFuel ? <Fuel size={16} strokeWidth={1.8} /> : <Zap size={16} strokeWidth={1.8} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">
                  {shortDate(entry.date)}
                  {isFuel && (entry as FuelUp).fuel_grade && (
                    <span className="ml-2 text-[12px] font-medium text-muted">
                      {(entry as FuelUp).fuel_grade}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[12px] text-muted tabular">
                  {num(entry.odometer, 0)} {dUnit} · {amount}
                  {cost != null && ` · ${money(cost, currency)}`}
                </span>
              </span>
              <EconomyChip row={row} label={econLabel} />
            </button>
          </Card>
        );
      })}
    </div>
  );
}

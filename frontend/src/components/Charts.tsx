import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useCharges, useFuelUps, useVehicleServices } from "../api/hooks";
import type { User, Vehicle } from "../api/types";
import { currencyOf, distanceUnit, economyLabel, money, num } from "../lib/format";
import { Card } from "./ui";

const ACCENT = "#3b9eff";
const MUTED = "#8e8e93";
const LINE = "#2c2c2e";

const axisProps = {
  stroke: LINE,
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "#1c1c1e",
    border: "none",
    borderRadius: 12,
    fontSize: 12,
    color: "#f5f5f7",
  },
  labelStyle: { color: MUTED },
  cursor: { stroke: LINE },
} as const;

const RANGES = [
  { key: "1w", label: "1W", days: 7 },
  { key: "1m", label: "1M", days: 31 },
  { key: "3m", label: "3M", days: 92 },
  { key: "6m", label: "6M", days: 183 },
  { key: "1y", label: "1Y", days: 366 },
  { key: "all", label: "All", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

export default function InsightsCharts({ vehicle, user }: { vehicle: Vehicle; user: User }) {
  const wantsFuel = vehicle.energy_type !== "electric";
  const wantsCharge = vehicle.energy_type === "electric" || vehicle.energy_type === "plug_in_hybrid";
  const { data: rawFuelups } = useFuelUps(wantsFuel ? vehicle.id : undefined);
  const { data: rawCharges } = useCharges(wantsCharge ? vehicle.id : undefined);
  const { data: rawServices } = useVehicleServices(vehicle.id);
  const [range, setRange] = useState<RangeKey>("all");

  const days = RANGES.find((r) => r.key === range)!.days;
  const cutoff = days == null ? "" : new Date(Date.now() - days * 86_400_000).toISOString();
  const inRange = <T extends { date: string }>(rows: T[] | undefined) =>
    (rows ?? []).filter((row) => row.date >= cutoff);
  const fuelups = inRange(rawFuelups);
  const charges = inRange(rawCharges);
  const services = inRange(rawServices);

  const currency = currencyOf(vehicle, user);
  const econUnit = economyLabel(vehicle.energy_type, distanceUnit(vehicle, user));

  // per-fill economy over time (primary series, accent)
  const primary = vehicle.energy_type === "electric" ? charges : fuelups;
  const econSeries = primary
    .filter((e) => e.economy != null)
    .map((e) => ({ date: e.date.slice(0, 10), economy: Math.round(e.economy! * 10) / 10 }))
    .reverse();

  // monthly rollup: energy spend, service spend, fill count
  const months = new Map<string, { fuel: number; service: number; fills: number }>();
  const bump = (key: string, patch: Partial<{ fuel: number; service: number; fills: number }>) => {
    const row = months.get(key) ?? { fuel: 0, service: 0, fills: 0 };
    months.set(key, {
      fuel: row.fuel + (patch.fuel ?? 0),
      service: row.service + (patch.service ?? 0),
      fills: row.fills + (patch.fills ?? 0),
    });
  };
  for (const f of fuelups ?? []) bump(monthKey(f.date), { fuel: f.total_cost ?? 0, fills: 1 });
  for (const c of charges ?? []) bump(monthKey(c.date), { fuel: c.total_cost ?? 0, fills: 1 });
  for (const s of services ?? []) bump(monthKey(s.date), { service: s.total_cost ?? 0 });
  const monthly = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, row]) => ({
      month: monthLabel(key),
      fuel: Math.round(row.fuel * 100) / 100,
      service: Math.round(row.service * 100) / 100,
      fills: row.fills,
    }));

  const totalFuel = monthly.reduce((a, m) => a + m.fuel, 0);
  const totalService = monthly.reduce((a, m) => a + m.service, 0);

  const rangePicker = (
    <div className="flex gap-1 rounded-full bg-surface p-1">
      {RANGES.map((option) => (
        <button
          key={option.key}
          onClick={() => setRange(option.key)}
          className={`flex-1 rounded-full px-2 py-1.5 text-[12px] font-semibold transition-colors ${
            range === option.key ? "bg-accent text-[#001427]" : "text-muted hover:text-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (econSeries.length < 2 && monthly.length === 0) {
    return (
      <div className="space-y-4">
        {rangePicker}
        <Card className="py-8 text-center text-[14px] text-muted">
          {range === "all"
            ? "Charts appear once there's some history to draw."
            : "Nothing logged in this period — try a longer range."}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rangePicker}
      {econSeries.length >= 2 && (
        <Card>
          <h3 className="mb-3 text-[14px] font-semibold text-muted">{econUnit} over time</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={econSeries} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="date" {...axisProps} minTickGap={40} />
              <YAxis {...axisProps} domain={["auto", "auto"]} width={44} />
              <Tooltip {...tooltipStyle} />
              <Line
                type="monotone"
                dataKey="economy"
                stroke={ACCENT}
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: ACCENT, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                name={econUnit}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {monthly.length > 0 && (
        <Card>
          <h3 className="mb-1 text-[14px] font-semibold text-muted">Monthly spend</h3>
          <p className="mb-3 text-[12px] text-muted">
            <span className="font-semibold text-accent">{money(totalFuel, currency)}</span> energy ·{" "}
            <span className="font-semibold text-text">{money(totalService, currency)}</span> service
            over {monthly.length} month{monthly.length === 1 ? "" : "s"}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} width={44} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="fuel" name="Fuel/energy" stackId="spend" fill={ACCENT} radius={[0, 0, 0, 0]} />
              <Bar dataKey="service" name="Service" stackId="spend" fill={MUTED} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {monthly.length > 0 && (
        <Card>
          <h3 className="mb-3 text-[14px] font-semibold text-muted">
            {vehicle.energy_type === "electric" ? "Charges" : "Fill-ups"} per month
          </h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={monthly} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} width={40} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="fills" name="Fills" fill={ACCENT} opacity={0.85} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-1 text-right text-[11px] text-muted">
            avg {num(monthly.reduce((a, m) => a + m.fills, 0) / monthly.length, 1)} per month
          </p>
        </Card>
      )}
    </div>
  );
}

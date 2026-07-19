import { Check, Fuel } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useGradeComparison, useVehicles } from "../api/hooks";
import type { GradeComparison, User, Vehicle } from "../api/types";
import InsightsCharts from "../components/Charts";
import { Card, Spinner } from "../components/ui";
import { currencyOf, money, num } from "../lib/format";

function cents(costPerDistance: number | null | undefined, currency: string): string {
  if (costPerDistance == null) return "—";
  if (currency === "USD" && costPerDistance < 1) {
    return `${(costPerDistance * 100).toFixed(1)}¢`;
  }
  return money(costPerDistance, currency);
}

function VehiclePicker({
  vehicles,
  selected,
  onSelect,
}: {
  vehicles: Vehicle[];
  selected: Vehicle;
  onSelect: (vehicle: Vehicle) => void;
}) {
  if (vehicles.length <= 1) return null;
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {vehicles.map((vehicle) => (
        <button
          key={vehicle.id}
          onClick={() => onSelect(vehicle)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
            vehicle.id === selected.id
              ? "bg-accent/15 text-accent border border-accent/50"
              : "bg-surface text-muted border border-transparent hover:text-text"
          }`}
        >
          {vehicle.name}
        </button>
      ))}
    </div>
  );
}

// ---- backward-looking comparison (mockup 02) ----

function ComparisonCard({
  comparison,
  currency,
}: {
  comparison: GradeComparison;
  currency: string;
}) {
  const ranked = [...comparison.grades]
    .filter((g) => g.cost_per_distance != null && g.enough_data)
    .sort((a, b) => a.cost_per_distance! - b.cost_per_distance!);

  if (ranked.length < 2) {
    return (
      <Card>
        <h2 className="mb-1 text-[16px] font-bold">Which grade is cheaper to run?</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Pitstop needs one clean full tank of two different grades before it can compare them.
          Log the grade with each fill-up and check back.
        </p>
        {comparison.grades.length > 0 && (
          <div className="space-y-2">
            {comparison.grades.map((grade) => (
              <div key={grade.grade} className="flex items-center gap-3">
                <span className="w-12 text-[15px] font-bold">{grade.grade}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                  <div
                    className="h-full rounded-full bg-accent/70"
                    style={{
                      width: `${Math.min(100, (grade.tank_count / comparison.min_tanks) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-24 text-right text-[12px] text-muted">
                  {grade.tank_count} of {comparison.min_tanks} tanks
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  const best = ranked[0];
  const maxCpd = ranked[ranked.length - 1].cost_per_distance!;
  const verdict = comparison.verdict;

  return (
    <Card>
      <h2 className="mb-1 text-[16px] font-bold">Which grade is cheaper to run?</h2>
      <p className="mb-4 text-[13px] text-muted">
        Cost per mile tells the real story — it blends pump price and MPG.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        {ranked.slice(0, 2).map((grade) => (
          <div
            key={grade.grade}
            className={`rounded-card p-4 text-center ${
              grade.grade === best.grade
                ? "bg-accent/10 border border-accent/40"
                : "bg-surface2 border border-transparent"
            }`}
          >
            {grade.grade === best.grade && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-bold text-accent">
                <Check size={11} strokeWidth={3} /> Best value
              </span>
            )}
            <div className="text-[32px] font-extrabold tracking-tight">{grade.grade}</div>
            <div className="text-[12px] text-muted">
              {grade.avg_price != null ? money(grade.avg_price, currency) : "—"} ·{" "}
              {num(grade.avg_economy, 1)} MPG
            </div>
            <div className="tabular mt-2 text-[26px] font-extrabold text-accent">
              {cents(grade.cost_per_distance, currency)}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted">per mile</div>
          </div>
        ))}
      </div>

      <div className="mb-4 space-y-2">
        {ranked.map((grade) => (
          <div key={grade.grade} className="flex items-center gap-3">
            <span className="w-10 text-[13px] font-bold">{grade.grade}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface2">
              <div
                className={`h-full rounded-full ${grade.grade === best.grade ? "bg-accent" : "bg-muted/50"}`}
                style={{ width: `${(grade.cost_per_distance! / maxCpd) * 100}%` }}
              />
            </div>
            <span className="tabular w-14 text-right text-[13px] font-semibold">
              {cents(grade.cost_per_distance, currency)}
            </span>
          </div>
        ))}
        <p className="text-right text-[11px] text-muted">cost per mile — lower is better</p>
      </div>

      {verdict && (
        <div className="rounded-card bg-surface2 p-4 text-center">
          <p className="text-[13px] text-muted">Sticking with {verdict.best_grade} saves you about</p>
          <p className="tabular my-1 text-[30px] font-extrabold text-good">
            {money(verdict.yearly_savings, currency)} / year
          </p>
          <p className="text-[12px] leading-relaxed text-muted">
            That's {money(verdict.per_1000_savings, currency)} per 1,000 miles versus{" "}
            {verdict.vs_grade}.{" "}
            {verdict.annual_distance_estimated
              ? `Estimated at ${num(verdict.annual_distance, 0)} mi/year.`
              : `Based on your actual ~${num(verdict.annual_distance, 0)} mi/year.`}
          </p>
        </div>
      )}

      <p className="mt-3 text-center text-[12px] text-muted">
        Based on {ranked.map((g) => `${g.tank_count} full tank${g.tank_count === 1 ? "" : "s"} of ${g.grade}`).join(" and ")}.
        <br />
        The more tanks you run of each grade, the closer this gets to the truth — one tank can
        be a fluke.
      </p>
    </Card>
  );
}

// ---- live buy advisor (mockup 03) ----

function AdvisorCard({
  comparison,
  currency,
}: {
  comparison: GradeComparison;
  currency: string;
}) {
  const measurable = comparison.grades.filter((g) => g.avg_economy != null);
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    setPrices({});
  }, [comparison.vehicle_id]);

  if (measurable.length < 2) {
    return (
      <Card>
        <h2 className="mb-1 text-[16px] font-bold">Which grade should I buy today?</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Once two grades have measured MPG, type today's posted prices here and Pitstop will
          pick the cheapest to run on the spot.
        </p>
      </Card>
    );
  }

  const rows = measurable.map((grade) => {
    const price = parseFloat(prices[grade.grade] ?? "");
    const costPerMile = isFinite(price) && grade.avg_economy ? price / grade.avg_economy : null;
    return { grade, price, costPerMile };
  });
  const priced = rows.filter((r) => r.costPerMile != null);
  const winner = priced.length >= 2 ? priced.reduce((a, b) => (a.costPerMile! <= b.costPerMile! ? a : b)) : null;
  const runnerUp = winner
    ? priced.filter((r) => r !== winner).reduce((a, b) => (a.costPerMile! <= b.costPerMile! ? a : b))
    : null;
  // the price the runner-up would need to hit to tie the winner
  const breakEven =
    winner && runnerUp ? winner.costPerMile! * runnerUp.grade.avg_economy! : null;

  return (
    <Card>
      <h2 className="mb-1 text-[16px] font-bold">Which grade should I buy today?</h2>
      <p className="mb-4 text-[13px] text-muted">
        Type the posted prices at the pump — your measured MPG does the rest.
      </p>

      <div className="space-y-2.5">
        {rows.map(({ grade, costPerMile }) => (
          <div key={grade.grade} className="flex items-center gap-3 rounded-card bg-surface2 p-3.5">
            <span className="w-12 text-[22px] font-extrabold tracking-tight">{grade.grade}</span>
            <label className="flex-1">
              <span className="block text-[11px] text-muted">today's price</span>
              <span className="flex items-baseline gap-1">
                <span className="text-[13px] text-muted">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={prices[grade.grade] ?? ""}
                  onChange={(e) => setPrices({ ...prices, [grade.grade]: e.target.value })}
                  placeholder="0.00"
                  className="tabular w-24 bg-transparent text-[20px] font-bold outline-none placeholder:text-muted/40"
                />
              </span>
            </label>
            <span className="text-right">
              <span
                className={`tabular block text-[18px] font-extrabold ${
                  winner?.grade.grade === grade.grade ? "text-good" : ""
                }`}
              >
                {costPerMile != null ? cents(costPerMile, currency) : "—"}
                <span className="text-[11px] font-medium text-muted">/mi</span>
              </span>
              <span className="block text-[11px] text-muted">your {num(grade.avg_economy, 1)} MPG</span>
            </span>
          </div>
        ))}
      </div>

      {winner && runnerUp && (
        <div className="mt-4 rounded-card bg-surface2 p-4 text-center">
          <p className="text-[17px] font-bold">
            Buy <span className="text-good">{winner.grade.grade}</span> — cheapest to run today.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            {runnerUp.grade.grade} would have to drop to about{" "}
            <span className="font-semibold text-text">{money(breakEven!, currency)}</span> to beat{" "}
            {winner.grade.grade} in this vehicle.
          </p>
          <Link
            to={`/log?vehicle=${comparison.vehicle_id}&grade=${encodeURIComponent(winner.grade.grade)}&price=${prices[winner.grade.grade]}`}
            className="mt-3 inline-block rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-[#001427]"
          >
            Use {winner.grade.grade} & log this fill-up →
          </Link>
        </div>
      )}
    </Card>
  );
}

export default function StatsPage({ user }: { user: User }) {
  const { data: vehicles, isLoading } = useVehicles();
  const [params, setParams] = useSearchParams();
  const [fallbackId, setFallbackId] = useState<number | null>(null);

  if (isLoading) return <Spinner />;
  const activeVehicles = vehicles?.filter((v) => !v.archived) ?? [];
  if (!activeVehicles.length) {
    return (
      <>
        <h1 className="mb-5 text-[26px] font-extrabold tracking-tight">Stats</h1>
        <Card className="py-10 text-center text-[14px] leading-relaxed text-muted">
          Add a vehicle and log some fill-ups — trends and fuel-grade tools show up here.
        </Card>
      </>
    );
  }

  const requestedId = params.get("vehicle") ? Number(params.get("vehicle")) : fallbackId;
  const selected = activeVehicles.find((v) => v.id === requestedId) ?? activeVehicles[0];

  return (
    <StatsForVehicle
      key={selected.id}
      vehicles={activeVehicles}
      selected={selected}
      user={user}
      onSelect={(vehicle) => {
        setFallbackId(vehicle.id);
        setParams({ vehicle: String(vehicle.id) }, { replace: true });
      }}
    />
  );
}

function StatsForVehicle({
  vehicles,
  selected,
  user,
  onSelect,
}: {
  vehicles: Vehicle[];
  selected: Vehicle;
  user: User;
  onSelect: (vehicle: Vehicle) => void;
}) {
  const isGas = selected.energy_type !== "electric";
  const { data: comparison, isLoading } = useGradeComparison(isGas ? selected.id : undefined);
  const currency = currencyOf(selected, user);

  return (
    <>
      <header className="mb-4 flex items-center gap-3">
        <h1 className="flex-1 text-[26px] font-extrabold tracking-tight">Stats</h1>
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
          <Fuel size={14} /> trends & fuel tools
        </span>
      </header>
      <VehiclePicker vehicles={vehicles} selected={selected} onSelect={onSelect} />
      <div className="space-y-4">
        {isGas &&
          (isLoading || !comparison ? (
            <Spinner />
          ) : (
            <>
              <AdvisorCard comparison={comparison} currency={currency} />
              <ComparisonCard comparison={comparison} currency={currency} />
            </>
          ))}
        <h2 className="pt-2 text-[17px] font-bold tracking-tight">Trends</h2>
        <InsightsCharts vehicle={selected} user={user} />
      </div>
    </>
  );
}

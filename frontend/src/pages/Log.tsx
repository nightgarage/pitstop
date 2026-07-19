import { TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  useCharges,
  useCreateCharge,
  useCreateFuelUp,
  useFuelUps,
  useStatsSummary,
  useVehicles,
} from "../api/hooks";
import type { User, Vehicle } from "../api/types";
import { ChargeForm, FuelUpForm } from "../components/EntryForm";
import EntryList from "../components/EntryList";
import { Button, Card, Spinner } from "../components/ui";
import { currencyOf, distanceUnit, economyLabel, money, num, volumeLabel, volumeUnit } from "../lib/format";
import { queueSave } from "../lib/offline";

function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency }).formatToParts(1);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
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

interface SavedInfo {
  economy: number | null;
  previousEconomy: number | null;
  fillType: string;
  distance: number | null;
  cost: number | null;
  econUnit: string;
  distUnit: string;
  offline?: boolean;
}

function SavedModal({
  info,
  currency,
  vehicleId,
}: {
  info: SavedInfo;
  currency: string;
  vehicleId: number;
}) {
  const navigate = useNavigate();
  // dismissing always lands on the vehicle page — one big target, no fat-fingering
  const done = () => navigate(`/vehicles/${vehicleId}`);
  const delta =
    info.economy != null && info.previousEconomy != null ? info.economy - info.previousEconomy : null;
  const noEconomyReason = info.offline
    ? "You're offline — this entry is saved on your phone and will sync automatically."
    : info.fillType === "partial"
      ? "Partial fill — it'll count toward your next full tank."
      : info.fillType === "missed"
        ? "Missed fill logged — the next full tank starts a fresh streak."
        : "First fill-up saved — your next full tank gets an economy number.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={done}
    >
      <div
        className="w-full max-w-sm rounded-card bg-surface p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[14px] font-semibold text-good">
          {info.offline ? "Saved offline ✓" : "Saved ✓"}
        </p>

        {info.economy != null ? (
          <>
            <div className="tabular mt-3 text-[56px] font-extrabold leading-none tracking-tight text-accent">
              {num(info.economy, 1)}
            </div>
            <div className="mt-1 text-[14px] font-medium text-muted">{info.econUnit} this fill</div>
            {delta != null && (
              <div
                className={`mt-3 flex items-center justify-center gap-1.5 text-[15px] font-semibold ${
                  delta >= 0 ? "text-good" : "text-danger"
                }`}
              >
                {delta >= 0 ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
                {delta >= 0 ? "+" : ""}
                {num(delta, 1)} vs last fill ({num(info.previousEconomy, 1)})
              </div>
            )}
            <div className="mt-3 text-[13px] text-muted tabular">
              {info.distance != null && `${num(info.distance, 0)} ${info.distUnit} traveled`}
              {info.distance != null && info.cost != null && " · "}
              {info.cost != null && money(info.cost, currency)}
            </div>
          </>
        ) : (
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{noEconomyReason}</p>
        )}

        <div className="mt-6">
          <Button className="w-full" onClick={done}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function LogForVehicle({
  vehicle,
  user,
  currentOdometer,
  initialGrade,
  initialPrice,
}: {
  vehicle: Vehicle;
  user: User;
  currentOdometer: number | null;
  initialGrade?: string;
  initialPrice?: string;
}) {
  const isPhev = vehicle.energy_type === "plug_in_hybrid";
  const isElectric = vehicle.energy_type === "electric";
  const [mode, setMode] = useState<"fuel" | "charge">(isElectric ? "charge" : "fuel");
  const activeMode = isElectric ? "charge" : isPhev ? mode : "fuel";

  const createFuel = useCreateFuelUp(vehicle.id);
  const createCharge = useCreateCharge(vehicle.id);
  // lists are newest-first; entry [0] feeds the greyed-out placeholders
  const { data: fuelups } = useFuelUps(activeMode === "fuel" ? vehicle.id : undefined);
  const { data: charges } = useCharges(activeMode === "charge" ? vehicle.id : undefined);
  // remount the form (clearing it) after each save
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState<SavedInfo | null>(null);

  const dUnit = distanceUnit(vehicle, user);

  const showResult = (info: SavedInfo) => {
    setFormKey((k) => k + 1);
    setSaved(info);
  };

  const errorText = (error: unknown) =>
    error instanceof ApiError ? error.message : error ? "Save failed — try again." : "";

  const currency = currencySymbol(currencyOf(vehicle, user));
  const vUnit = volumeLabel(volumeUnit(vehicle, user));

  return (
    <>
      {isPhev && (
        <div className="mb-4 flex gap-1 rounded-[14px] bg-surface p-1">
          {(["fuel", "charge"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-[11px] py-2.5 text-[14px] font-semibold transition-colors ${
                activeMode === m ? "bg-accent text-[#001427]" : "text-muted hover:text-text"
              }`}
            >
              {m === "fuel" ? "Fuel-up" : "Charge"}
            </button>
          ))}
        </div>
      )}

      {saved && (
        <SavedModal info={saved} currency={currencyOf(vehicle, user)} vehicleId={vehicle.id} />
      )}

      {activeMode === "fuel" ? (
        <FuelUpForm
          key={`fuel-${formKey}`}
          lastEntry={fuelups?.[0]}
          currentOdometer={currentOdometer}
          initialGrade={formKey === 0 ? initialGrade : undefined}
          initialPrice={formKey === 0 ? initialPrice : undefined}
          showDrivingConditions={user.show_driving_conditions}
          volumeUnitLabel={vUnit}
          currencySymbol={currency}
          distanceUnitLabel={dUnit}
          busy={createFuel.isPending}
          error={errorText(createFuel.error)}
          onSubmit={(payload) => {
            // the newest fill that has a number is "last fill" for the comparison
            const previousEconomy = fuelups?.find((f) => f.economy != null)?.economy ?? null;
            createFuel.mutate(payload, {
              onSuccess: (created) =>
                showResult({
                  economy: created.economy,
                  previousEconomy,
                  fillType: created.fill_type,
                  distance: created.distance,
                  cost: created.total_cost,
                  econUnit: economyLabel("gasoline", dUnit),
                  distUnit: dUnit,
                }),
              onError: (error) => {
                if (error instanceof TypeError) {
                  // network is down — keep the entry and sync later
                  queueSave("fuelup", vehicle.id, payload);
                  showResult({
                    economy: null,
                    previousEconomy: null,
                    fillType: payload.fill_type,
                    distance: null,
                    cost: payload.total_cost ?? null,
                    econUnit: economyLabel("gasoline", dUnit),
                    distUnit: dUnit,
                    offline: true,
                  });
                }
              },
            });
          }}
        />
      ) : (
        <ChargeForm
          key={`charge-${formKey}`}
          lastEntry={charges?.[0]}
          currentOdometer={currentOdometer}
          currencySymbol={currency}
          distanceUnitLabel={dUnit}
          busy={createCharge.isPending}
          error={errorText(createCharge.error)}
          onSubmit={(payload) => {
            const previousEconomy = charges?.find((c) => c.economy != null)?.economy ?? null;
            createCharge.mutate(payload, {
              onSuccess: (created) =>
                showResult({
                  economy: created.economy,
                  previousEconomy,
                  fillType: created.fill_type,
                  distance: created.distance,
                  cost: created.total_cost,
                  econUnit: economyLabel("electric", dUnit),
                  distUnit: dUnit,
                }),
              onError: (error) => {
                if (error instanceof TypeError) {
                  queueSave("charge", vehicle.id, payload);
                  showResult({
                    economy: null,
                    previousEconomy: null,
                    fillType: payload.fill_type,
                    distance: null,
                    cost: payload.total_cost ?? null,
                    econUnit: economyLabel("electric", dUnit),
                    distUnit: dUnit,
                    offline: true,
                  });
                }
              },
            });
          }}
        />
      )}

      <h2 className="mb-3 mt-8 text-[17px] font-bold tracking-tight">Recent</h2>
      <EntryList vehicle={vehicle} user={user} limit={10} />
    </>
  );
}

export default function LogPage({ user }: { user: User }) {
  const { data: vehicles, isLoading } = useVehicles();
  const { data: summaries } = useStatsSummary();
  const [params, setParams] = useSearchParams();
  const [fallbackId, setFallbackId] = useState<number | null>(null);

  if (isLoading) return <Spinner />;
  if (!vehicles?.length) {
    return (
      <>
        <h1 className="mb-5 text-[26px] font-extrabold tracking-tight">Log</h1>
        <Card className="py-10 text-center text-[14px] text-muted">
          Add a vehicle to your garage first, then log fuel-ups here.
        </Card>
      </>
    );
  }

  // default to the vehicle that was filled up most recently
  const dateOf = (v: Vehicle) =>
    summaries?.find((s) => s.vehicle_id === v.id)?.last_entry_date ?? "";
  const lastFilled = [...vehicles].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0];

  const requestedId = params.get("vehicle") ? Number(params.get("vehicle")) : fallbackId;
  const selected = vehicles.find((v) => v.id === requestedId) ?? lastFilled;

  const select = (vehicle: Vehicle) => {
    setFallbackId(vehicle.id);
    setParams({ vehicle: String(vehicle.id) }, { replace: true });
  };

  return (
    <>
      <h1 className="mb-4 text-[26px] font-extrabold tracking-tight">
        Log {selected.energy_type === "electric" ? "charge" : "fuel-up"}
      </h1>
      <VehiclePicker vehicles={vehicles} selected={selected} onSelect={select} />
      <LogForVehicle
        key={selected.id}
        vehicle={selected}
        user={user}
        currentOdometer={
          summaries?.find((s) => s.vehicle_id === selected.id)?.latest_odometer ??
          selected.odometer_start
        }
        initialGrade={params.get("grade") ?? undefined}
        initialPrice={params.get("price") ?? undefined}
      />
    </>
  );
}

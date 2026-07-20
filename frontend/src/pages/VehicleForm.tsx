import { ArrowLeft, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { useArchiveVehicle, useCreateVehicle, useUpdateVehicle, useVehicle } from "../api/hooks";
import type { DistanceUnit, EnergyType, VehiclePayload, VolumeUnit } from "../api/types";
import { DISTANCE_UNIT_LABELS, ENERGY_TYPE_LABELS, VOLUME_UNIT_LABELS } from "../api/types";
import { Button, ErrorText, Field, Input, Segmented, Select, Spinner } from "../components/ui";

const ENERGY_OPTIONS = (Object.keys(ENERGY_TYPE_LABELS) as EnergyType[]).map((value) => ({
  value,
  label: ENERGY_TYPE_LABELS[value],
}));

const hasTank = (energy: EnergyType) => energy !== "electric";
const hasBattery = (energy: EnergyType) => energy === "electric" || energy === "plug_in_hybrid";

interface FormState {
  name: string;
  energy_type: EnergyType;
  year: string;
  make: string;
  model: string;
  trim: string;
  tank_size: string;
  battery_size: string;
  odometer_start: string;
  distance_unit: DistanceUnit | "";
  volume_unit: VolumeUnit | "";
  currency: string;
}

const EMPTY: FormState = {
  name: "",
  energy_type: "gasoline",
  year: "",
  make: "",
  model: "",
  trim: "",
  tank_size: "",
  battery_size: "",
  odometer_start: "",
  distance_unit: "",
  volume_unit: "",
  currency: "",
};

function toPayload(form: FormState): VehiclePayload {
  const num = (value: string) => (value.trim() === "" ? null : Number(value));
  const text = (value: string) => (value.trim() === "" ? null : value.trim());
  return {
    name: form.name.trim(),
    energy_type: form.energy_type,
    year: num(form.year),
    make: text(form.make),
    model: text(form.model),
    trim: text(form.trim),
    tank_size: hasTank(form.energy_type) ? num(form.tank_size) : null,
    battery_size: hasBattery(form.energy_type) ? num(form.battery_size) : null,
    odometer_start: num(form.odometer_start),
    distance_unit: form.distance_unit || null,
    volume_unit: form.volume_unit || null,
    currency: text(form.currency.toUpperCase()),
  };
}

export default function VehicleFormPage({
  embedded = false,
  onSaved,
}: {
  /** render inside another page (the welcome walkthrough): no header, no page padding */
  embedded?: boolean;
  onSaved?: () => void;
} = {}) {
  const { id } = useParams();
  const vehicleId = id ? Number(id) : undefined;
  const isEdit = vehicleId !== undefined;
  const navigate = useNavigate();

  const { data: vehicle, isLoading } = useVehicle(vehicleId);
  const create = useCreateVehicle();
  const update = useUpdateVehicle(vehicleId ?? 0);
  const archive = useArchiveVehicle(vehicleId ?? 0);
  const mutation = isEdit ? update : create;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [showUnits, setShowUnits] = useState(false);

  useEffect(() => {
    if (vehicle) {
      setForm({
        name: vehicle.name,
        energy_type: vehicle.energy_type,
        year: vehicle.year?.toString() ?? "",
        make: vehicle.make ?? "",
        model: vehicle.model ?? "",
        trim: vehicle.trim ?? "",
        tank_size: vehicle.tank_size?.toString() ?? "",
        battery_size: vehicle.battery_size?.toString() ?? "",
        odometer_start: vehicle.odometer_start?.toString() ?? "",
        distance_unit: vehicle.distance_unit ?? "",
        volume_unit: vehicle.volume_unit ?? "",
        currency: vehicle.currency ?? "",
      });
      if (vehicle.distance_unit || vehicle.volume_unit || vehicle.currency) setShowUnits(true);
    }
  }, [vehicle]);

  if (isEdit && isLoading) return <Spinner />;

  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    mutation.mutate(toPayload(form), {
      onSuccess: () => (onSaved ? onSaved() : navigate("/")),
    });
  };

  return (
    <div className={embedded ? "" : "pt-safe pb-safe mx-auto max-w-lg px-4"}>
      {!embedded && (
        <header className="mb-6 flex items-center gap-3">
          <Link
            to="/"
            aria-label="Back to garage"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
          >
            <ArrowLeft size={19} strokeWidth={1.8} />
          </Link>
          <h1 className="text-[22px] font-extrabold tracking-tight">
            {isEdit ? "Edit vehicle" : "Add vehicle"}
          </h1>
        </header>
      )}

      <form className="space-y-5" onSubmit={submit}>
        <Field label="Nickname">
          <Input
            required
            autoFocus={!isEdit && !embedded}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Daily Driver"
          />
        </Field>

        <Field label="Energy type">
          <Segmented
            options={ENERGY_OPTIONS}
            value={form.energy_type}
            onChange={(energy_type) => set({ energy_type })}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Year">
            <Input
              type="number"
              inputMode="numeric"
              min={1886}
              max={2100}
              value={form.year}
              onChange={(e) => set({ year: e.target.value })}
              placeholder="2019"
            />
          </Field>
          <Field label="Make">
            <Input value={form.make} onChange={(e) => set({ make: e.target.value })} placeholder="GMC" />
          </Field>
          <Field label="Model">
            <Input value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="Sierra" />
          </Field>
        </div>

        <Field label="Trim (optional)">
          <Input value={form.trim} onChange={(e) => set({ trim: e.target.value })} placeholder="SLT" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {hasTank(form.energy_type) && (
            <Field label="Tank size (gal)">
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={form.tank_size}
                onChange={(e) => set({ tank_size: e.target.value })}
                placeholder="24"
              />
            </Field>
          )}
          {hasBattery(form.energy_type) && (
            <Field label="Battery size (kWh)">
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={form.battery_size}
                onChange={(e) => set({ battery_size: e.target.value })}
                placeholder="75"
              />
            </Field>
          )}
          <Field label="Current odometer">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={form.odometer_start}
              onChange={(e) => set({ odometer_start: e.target.value })}
              placeholder="84530"
            />
          </Field>
        </div>

        <button
          type="button"
          className="flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-text"
          onClick={() => setShowUnits(!showUnits)}
        >
          <ChevronDown size={16} className={`transition-transform ${showUnits ? "rotate-180" : ""}`} />
          Units for this vehicle
        </button>

        {showUnits && (
          <div className="grid grid-cols-2 gap-3 rounded-card bg-surface p-4">
            <Field label="Distance">
              <Select
                value={form.distance_unit}
                onChange={(e) => set({ distance_unit: e.target.value as DistanceUnit | "" })}
              >
                <option value="">Use my default</option>
                {Object.entries(DISTANCE_UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Volume">
              <Select
                value={form.volume_unit}
                onChange={(e) => set({ volume_unit: e.target.value as VolumeUnit | "" })}
              >
                <option value="">Use my default</option>
                {Object.entries(VOLUME_UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency" hint="3-letter code, e.g. USD">
              <Input
                maxLength={3}
                value={form.currency}
                onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
                placeholder="Default"
              />
            </Field>
          </div>
        )}

        <ErrorText>
          {mutation.error instanceof ApiError ? mutation.error.message : mutation.error ? "Save failed." : ""}
        </ErrorText>

        <div className="space-y-3 pt-2">
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Add to garage"}
          </Button>
          {isEdit && vehicle && !vehicle.archived && (
            <Button
              type="button"
              variant="danger-ghost"
              className="w-full"
              disabled={archive.isPending}
              onClick={() => archive.mutate(undefined, { onSuccess: () => navigate("/") })}
            >
              Archive vehicle
            </Button>
          )}
          {isEdit && vehicle?.archived && (
            <Button
              type="button"
              variant="surface"
              className="w-full"
              onClick={() => update.mutate({ archived: false }, { onSuccess: () => navigate("/") })}
            >
              Restore from archive
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

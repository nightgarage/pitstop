import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type {
  ChargePayload,
  ChargeSession,
  ChargeType,
  FillType,
  FuelUp,
  FuelUpPayload,
} from "../api/types";
import { CHARGE_TYPE_LABELS } from "../api/types";
import { fromLocalInput, toLocalInput } from "../lib/format";
import { Button, ErrorText, Field, Input } from "./ui";

type MoneyField = "amount" | "price" | "total";

const round = (value: number, digits: number) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/** Live price math: whichever two of amount/price/total were touched most
 * recently drive the third. The computed field stays editable — touching it
 * simply makes it one of the drivers. */
function useLinkedPrices(initial: { amount: string; price: string; total: string }) {
  const [values, setValues] = useState(initial);
  const [drivers, setDrivers] = useState<MoneyField[]>([]);

  const computed: MoneyField | null =
    drivers.length === 2
      ? (["amount", "price", "total"] as const).find((f) => !drivers.includes(f))!
      : null;

  function onChange(field: MoneyField, raw: string) {
    const next = { ...values, [field]: raw };
    const nextDrivers = [field, ...drivers.filter((f) => f !== field)].slice(0, 2) as MoneyField[];
    const target = (["amount", "price", "total"] as const).find((f) => !nextDrivers.includes(f));
    if (target) {
      const amount = parseFloat(next.amount);
      const price = parseFloat(next.price);
      const total = parseFloat(next.total);
      let result: number | null = null;
      if (target === "total" && isFinite(amount) && isFinite(price)) result = round(amount * price, 2);
      if (target === "price" && isFinite(amount) && isFinite(total) && amount > 0)
        result = round(total / amount, 3);
      if (target === "amount" && isFinite(price) && isFinite(total) && price > 0)
        result = round(total / price, 3);
      next[target] = result != null && isFinite(result) ? String(result) : next[target];
    }
    setValues(next);
    setDrivers(nextDrivers);
  }

  return { values, onChange, computed };
}

function BigField({
  label,
  unit,
  value,
  onChange,
  autoTag,
  autoFocus,
  required,
  placeholder,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (value: string) => void;
  autoTag?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="relative block rounded-card bg-surface px-4 py-3.5">
      {autoTag && (
        <span className="absolute right-4 top-3.5 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
          auto
        </span>
      )}
      <span className="block text-[12px] font-medium text-muted">{label}</span>
      <span className="flex items-baseline gap-1.5">
        {unit && <span className="text-[15px] text-muted">{unit}</span>}
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          required={required}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder ?? "0"}
          onChange={(e) => onChange(e.target.value)}
          className={`tabular w-full bg-transparent py-0.5 text-[24px] font-bold outline-none placeholder:text-muted/40 ${
            autoTag ? "text-accent" : "text-text"
          }`}
        />
      </span>
    </label>
  );
}

function FillTypeSegment({ value, onChange }: { value: FillType; onChange: (v: FillType) => void }) {
  const options: { value: FillType; label: string }[] = [
    { value: "full", label: "Full tank" },
    { value: "partial", label: "Partial" },
    { value: "missed", label: "Missed fill" },
  ];
  return (
    <div className="flex gap-1 rounded-[14px] bg-surface p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-[11px] py-3 text-[14px] font-semibold transition-colors ${
            value === option.value ? "bg-accent text-[#001427]" : "text-muted hover:text-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const GRADE_PRESETS = ["87", "89", "91", "93", "diesel"];

interface CommonDetails {
  date: string; // datetime-local
  station: string;
  location: string;
  notes: string;
  tags: string;
}

function DetailsSection({
  details,
  setDetails,
  open,
  setOpen,
  children,
}: {
  details: CommonDetails;
  setDetails: (d: CommonDetails) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  children?: React.ReactNode;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-card bg-surface px-4 py-4 text-[15px] text-muted"
      >
        Add details — station, notes, tags…
        <span className="text-[20px] font-bold text-accent">+</span>
      </button>
    );
  }
  return (
    <div className="space-y-4 rounded-card bg-surface p-4">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="flex w-full items-center justify-between text-[14px] font-medium text-muted"
      >
        Details
        <ChevronDown size={16} className="rotate-180" />
      </button>
      <Field label="Date & time">
        <Input
          type="datetime-local"
          value={details.date}
          onChange={(e) => setDetails({ ...details, date: e.target.value })}
        />
      </Field>
      {children}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Station">
          <Input
            value={details.station}
            onChange={(e) => setDetails({ ...details, station: e.target.value })}
            placeholder="Costco"
          />
        </Field>
        <Field label="Location">
          <Input
            value={details.location}
            onChange={(e) => setDetails({ ...details, location: e.target.value })}
            placeholder="Springfield"
          />
        </Field>
      </div>
      <Field label="Notes">
        <Input
          value={details.notes}
          onChange={(e) => setDetails({ ...details, notes: e.target.value })}
          placeholder="Optional"
        />
      </Field>
      <Field label="Tags" hint="Comma-separated, e.g. road trip, work">
        <Input
          value={details.tags}
          onChange={(e) => setDetails({ ...details, tags: e.target.value })}
          placeholder="Optional"
        />
      </Field>
    </div>
  );
}

const splitTags = (raw: string) =>
  raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const opt = (value: string) => (value.trim() === "" ? null : value.trim());
const optNum = (value: string) => {
  const parsed = parseFloat(value);
  return isFinite(parsed) ? parsed : null;
};

// ---- Fuel form ----

export function FuelUpForm({
  existing,
  lastEntry,
  currentOdometer,
  initialGrade,
  initialPrice,
  showDrivingConditions,
  volumeUnitLabel,
  currencySymbol,
  distanceUnitLabel,
  busy,
  error,
  onSubmit,
}: {
  existing?: FuelUp;
  /** most recent fuel-up; its numbers become the greyed-out placeholders */
  lastEntry?: FuelUp;
  /** current odometer, used as the placeholder when there's no previous entry */
  currentOdometer?: number | null;
  /** prefills coming from the buy advisor's "use this grade" button */
  initialGrade?: string;
  initialPrice?: string;
  /** optional logging field, off by default (Settings toggle) */
  showDrivingConditions?: boolean;
  volumeUnitLabel: string;
  currencySymbol: string;
  distanceUnitLabel: string;
  busy: boolean;
  error: string;
  onSubmit: (payload: FuelUpPayload) => void;
}) {
  const [odometer, setOdometer] = useState(existing ? String(existing.odometer) : "");
  const [fillType, setFillType] = useState<FillType>(existing?.fill_type ?? "full");
  const [grade, setGrade] = useState(existing?.fuel_grade ?? initialGrade ?? "");
  const [conditions, setConditions] = useState(existing?.driving_conditions ?? "");
  const prices = useLinkedPrices({
    amount: existing ? String(existing.volume) : "",
    price:
      existing?.price_per_unit != null ? String(existing.price_per_unit) : (initialPrice ?? ""),
    total: existing?.total_cost != null ? String(existing.total_cost) : "",
  });
  const [detailsOpen, setDetailsOpen] = useState(
    !!existing?.station || !!existing?.notes || initialGrade != null
  );
  const [details, setDetails] = useState<CommonDetails>({
    date: toLocalInput(existing?.date),
    station: existing?.station ?? "",
    location: existing?.location ?? "",
    notes: existing?.notes ?? "",
    tags: existing?.tags.join(", ") ?? "",
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      date: fromLocalInput(details.date),
      odometer: parseFloat(odometer),
      volume: parseFloat(prices.values.amount),
      price_per_unit: optNum(prices.values.price),
      total_cost: optNum(prices.values.total),
      fill_type: fillType,
      fuel_grade: opt(grade),
      station: opt(details.station),
      location: opt(details.location),
      driving_conditions: opt(conditions),
      notes: opt(details.notes),
      tags: splitTags(details.tags),
    });
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <BigField
        label="Odometer"
        unit={distanceUnitLabel}
        value={odometer}
        onChange={setOdometer}
        autoFocus={!existing}
        required
        placeholder={
          lastEntry ? String(lastEntry.odometer) : currentOdometer != null ? String(currentOdometer) : "0"
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <BigField
          label={volumeUnitLabel === "L" ? "Liters" : "Gallons"}
          value={prices.values.amount}
          onChange={(v) => prices.onChange("amount", v)}
          autoTag={prices.computed === "amount"}
          required
          placeholder={lastEntry ? String(lastEntry.volume) : "0"}
        />
        <BigField
          label={`Price / ${volumeUnitLabel}`}
          unit={currencySymbol}
          value={prices.values.price}
          onChange={(v) => prices.onChange("price", v)}
          autoTag={prices.computed === "price"}
          placeholder={lastEntry?.price_per_unit != null ? String(lastEntry.price_per_unit) : "0"}
        />
      </div>
      <BigField
        label="Total cost"
        unit={currencySymbol}
        value={prices.values.total}
        onChange={(v) => prices.onChange("total", v)}
        autoTag={prices.computed === "total"}
        placeholder={lastEntry?.total_cost != null ? String(lastEntry.total_cost) : "0"}
      />
      <FillTypeSegment value={fillType} onChange={setFillType} />
      <DetailsSection
        details={details}
        setDetails={setDetails}
        open={detailsOpen}
        setOpen={setDetailsOpen}
      >
        <Field label="Fuel grade">
          <div className="flex flex-wrap items-center gap-2">
            {GRADE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setGrade(grade === preset ? "" : preset)}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  grade === preset
                    ? "bg-accent/15 text-accent border border-accent/50"
                    : "bg-surface2 text-muted border border-transparent hover:text-text"
                }`}
              >
                {preset}
              </button>
            ))}
            <input
              value={GRADE_PRESETS.includes(grade) ? "" : grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="other"
              // 16px (not 13px like the pills beside it) so iOS doesn't zoom on
              // focus; the tighter padding and matching border keep it the
              // same height as those pills
              className="w-20 rounded-full border border-transparent bg-surface2 px-3.5 py-1.5 text-[16px] text-text outline-none placeholder:text-muted/60"
            />
          </div>
        </Field>
        {(showDrivingConditions || !!existing?.driving_conditions) && (
          <Field label="Driving conditions">
            <div className="flex flex-wrap gap-2">
              {["city", "highway", "mixed"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setConditions(conditions === option ? "" : option)}
                  className={`rounded-full px-3.5 py-2 text-[13px] font-semibold capitalize transition-colors ${
                    conditions === option
                      ? "bg-accent/15 text-accent border border-accent/50"
                      : "bg-surface2 text-muted border border-transparent hover:text-text"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </Field>
        )}
      </DetailsSection>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full py-4 text-[16px]" disabled={busy}>
        {busy ? "Saving…" : existing ? "Save changes" : "Save fuel-up"}
      </Button>
    </form>
  );
}

// ---- Charge form ----

export function ChargeForm({
  existing,
  lastEntry,
  currentOdometer,
  currencySymbol,
  distanceUnitLabel,
  busy,
  error,
  onSubmit,
}: {
  existing?: ChargeSession;
  /** most recent charge; its numbers become the greyed-out placeholders */
  lastEntry?: ChargeSession;
  /** current odometer, used as the placeholder when there's no previous entry */
  currentOdometer?: number | null;
  currencySymbol: string;
  distanceUnitLabel: string;
  busy: boolean;
  error: string;
  onSubmit: (payload: ChargePayload) => void;
}) {
  const [odometer, setOdometer] = useState(existing ? String(existing.odometer) : "");
  const [fillType, setFillType] = useState<FillType>(existing?.fill_type ?? "full");
  const [chargeType, setChargeType] = useState<ChargeType>(existing?.charge_type ?? "home");
  const [startPct, setStartPct] = useState(existing?.start_pct != null ? String(existing.start_pct) : "");
  const [endPct, setEndPct] = useState(existing?.end_pct != null ? String(existing.end_pct) : "");
  const prices = useLinkedPrices({
    amount: existing ? String(existing.kwh_added) : "",
    price: existing?.price_per_kwh != null ? String(existing.price_per_kwh) : "",
    total: existing?.total_cost != null ? String(existing.total_cost) : "",
  });
  const [detailsOpen, setDetailsOpen] = useState(!!existing?.station || !!existing?.notes);
  const [details, setDetails] = useState<CommonDetails>({
    date: toLocalInput(existing?.date),
    station: existing?.station ?? "",
    location: existing?.location ?? "",
    notes: existing?.notes ?? "",
    tags: existing?.tags.join(", ") ?? "",
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      date: fromLocalInput(details.date),
      odometer: parseFloat(odometer),
      kwh_added: parseFloat(prices.values.amount),
      price_per_kwh: optNum(prices.values.price),
      total_cost: optNum(prices.values.total),
      fill_type: fillType,
      charge_type: chargeType,
      start_pct: optNum(startPct),
      end_pct: optNum(endPct),
      station: opt(details.station),
      location: opt(details.location),
      notes: opt(details.notes),
      tags: splitTags(details.tags),
    });
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <BigField
        label="Odometer"
        unit={distanceUnitLabel}
        value={odometer}
        onChange={setOdometer}
        autoFocus={!existing}
        required
        placeholder={
          lastEntry ? String(lastEntry.odometer) : currentOdometer != null ? String(currentOdometer) : "0"
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <BigField
          label="kWh added"
          value={prices.values.amount}
          onChange={(v) => prices.onChange("amount", v)}
          autoTag={prices.computed === "amount"}
          required
          placeholder={lastEntry ? String(lastEntry.kwh_added) : "0"}
        />
        <BigField
          label="Price / kWh"
          unit={currencySymbol}
          value={prices.values.price}
          onChange={(v) => prices.onChange("price", v)}
          autoTag={prices.computed === "price"}
          placeholder={lastEntry?.price_per_kwh != null ? String(lastEntry.price_per_kwh) : "0"}
        />
      </div>
      <BigField
        label="Total cost"
        unit={currencySymbol}
        value={prices.values.total}
        onChange={(v) => prices.onChange("total", v)}
        autoTag={prices.computed === "total"}
        placeholder={lastEntry?.total_cost != null ? String(lastEntry.total_cost) : "0"}
      />
      <div className="flex gap-1 rounded-[14px] bg-surface p-1">
        {(Object.keys(CHARGE_TYPE_LABELS) as ChargeType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setChargeType(type)}
            className={`flex-1 rounded-[11px] py-3 text-[14px] font-semibold transition-colors ${
              chargeType === type ? "bg-accent text-[#001427]" : "text-muted hover:text-text"
            }`}
          >
            {CHARGE_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      <FillTypeSegment value={fillType} onChange={setFillType} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start %">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={startPct}
            onChange={(e) => setStartPct(e.target.value)}
            placeholder="20"
          />
        </Field>
        <Field label="End %">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={endPct}
            onChange={(e) => setEndPct(e.target.value)}
            placeholder="100"
          />
        </Field>
      </div>
      <DetailsSection
        details={details}
        setDetails={setDetails}
        open={detailsOpen}
        setOpen={setDetailsOpen}
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full py-4 text-[16px]" disabled={busy}>
        {busy ? "Saving…" : existing ? "Save changes" : "Save charge"}
      </Button>
    </form>
  );
}

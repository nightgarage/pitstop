import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  useCompleteReminder,
  useCreateReminder,
  useDeleteReminder,
  useReminders,
  useStatsSummary,
  useUpdateReminder,
  useVehicles,
} from "../api/hooks";
import type { ReminderPayload } from "../api/types";
import { fromLocalInput, num, toLocalInput } from "../lib/format";
import { Button, Card, ErrorText, Field, Input, Segmented, Select, Spinner } from "../components/ui";

const NAME_PRESETS = [
  "Oil & filter change",
  "Tire rotation",
  "Brakes",
  "Engine air filter",
  "Cabin air filter",
  "Coolant flush",
  "Registration renewal",
  "Inspection",
];

type Mode = "recurring" | "one_off";

export default function ReminderFormPage() {
  const navigate = useNavigate();
  const { id, reminderId } = useParams(); // present when editing
  const [params] = useSearchParams();
  const isEdit = reminderId !== undefined;

  const { data: vehicles } = useVehicles();
  const { data: reminders } = useReminders(true);
  const { data: summaries } = useStatsSummary();
  const existing = isEdit ? reminders?.find((r) => r.id === Number(reminderId)) : undefined;

  const [vehicleId, setVehicleId] = useState<number | null>(
    id ? Number(id) : params.get("vehicle") ? Number(params.get("vehicle")) : null
  );
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("recurring");
  const [intervalMiles, setIntervalMiles] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueOdometer, setDueOdometer] = useState("");
  const [lastDoneDate, setLastDoneDate] = useState("");
  const [lastDoneOdometer, setLastDoneOdometer] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeDate, setCompleteDate] = useState(toLocalInput());
  const [completeOdometer, setCompleteOdometer] = useState("");

  useEffect(() => {
    if (existing) {
      setVehicleId(existing.vehicle_id);
      setName(existing.name);
      setMode(existing.interval_miles != null || existing.interval_months != null ? "recurring" : "one_off");
      setIntervalMiles(existing.interval_miles?.toString() ?? "");
      setIntervalMonths(existing.interval_months?.toString() ?? "");
      setDueDate(existing.due_date ? existing.due_date.slice(0, 10) : "");
      setDueOdometer(existing.due_odometer?.toString() ?? "");
      setLastDoneDate(existing.last_done_date ? existing.last_done_date.slice(0, 10) : "");
      setLastDoneOdometer(existing.last_done_odometer?.toString() ?? "");
    }
  }, [existing]);

  const create = useCreateReminder(vehicleId ?? 0);
  const update = useUpdateReminder(existing?.vehicle_id ?? 0, Number(reminderId) || 0);
  const remove = useDeleteReminder(existing?.vehicle_id ?? 0, Number(reminderId) || 0);
  const complete = useCompleteReminder(existing?.vehicle_id ?? 0, Number(reminderId) || 0);
  const mutation = isEdit ? update : create;

  if (!vehicles) return <Spinner />;
  if (isEdit && !existing && reminders) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-[14px] text-muted">
        This reminder no longer exists.
      </div>
    );
  }

  const currentOdo = summaries?.find((s) => s.vehicle_id === vehicleId)?.latest_odometer;

  const opt = (value: string) => (value.trim() === "" ? null : Number(value));
  const optDate = (value: string) => (value ? fromLocalInput(`${value}T12:00`) : null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (vehicleId == null) return;
    const payload: ReminderPayload = {
      name: name.trim(),
      interval_miles: mode === "recurring" ? opt(intervalMiles) : null,
      interval_months: mode === "recurring" ? opt(intervalMonths) : null,
      due_date: mode === "one_off" ? optDate(dueDate) : null,
      due_odometer: mode === "one_off" ? opt(dueOdometer) : null,
      last_done_date: optDate(lastDoneDate),
      last_done_odometer: opt(lastDoneOdometer),
    };
    mutation.mutate(payload, { onSuccess: () => navigate("/service") });
  };

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? "Save failed — try again."
        : "";

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("/service")}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </button>
        <h1 className="text-[22px] font-extrabold tracking-tight">
          {isEdit ? "Edit reminder" : "Add reminder"}
        </h1>
      </header>

      {isEdit && existing && (
        <Card className="mb-5">
          {!completeOpen ? (
            <Button
              type="button"
              variant="surface"
              className="w-full"
              onClick={() => {
                setCompleteOdometer(currentOdo != null ? String(Math.round(currentOdo)) : "");
                setCompleteOpen(true);
              }}
            >
              <span className="flex items-center justify-center gap-2 text-good">
                <Check size={17} /> Mark as done
              </span>
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-[14px] font-semibold">When was it done?</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <Input
                    type="datetime-local"
                    value={completeDate}
                    onChange={(e) => setCompleteDate(e.target.value)}
                  />
                </Field>
                <Field label="Odometer">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={completeOdometer}
                    onChange={(e) => setCompleteOdometer(e.target.value)}
                    placeholder={currentOdo != null ? String(Math.round(currentOdo)) : "0"}
                  />
                </Field>
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={complete.isPending}
                onClick={() =>
                  complete.mutate(
                    {
                      date: fromLocalInput(completeDate),
                      odometer: completeOdometer.trim() === "" ? null : Number(completeOdometer),
                    },
                    { onSuccess: () => navigate("/service") }
                  )
                }
              >
                {complete.isPending ? "Saving…" : "Done — save it"}
              </Button>
            </div>
          )}
        </Card>
      )}

      <form className="space-y-5" onSubmit={submit}>
        {!isEdit && (
          <Field label="Vehicle">
            <Select
              required
              value={vehicleId ?? ""}
              onChange={(e) => setVehicleId(Number(e.target.value))}
            >
              <option value="" disabled>
                Choose a vehicle
              </option>
              {vehicles
                .filter((v) => !v.archived)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        <Field label="What needs doing?">
          <div className="mb-2 flex flex-wrap gap-2">
            {NAME_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setName(preset)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  name === preset
                    ? "bg-accent/15 text-accent border border-accent/50"
                    : "bg-surface2 text-muted border border-transparent hover:text-text"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Oil & filter change"
          />
        </Field>

        <Field label="Repeats?">
          <Segmented
            options={[
              { value: "recurring", label: "Recurring" },
              { value: "one_off", label: "One-time" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </Field>

        {mode === "recurring" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Every X miles" hint="Leave blank to skip">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={intervalMiles}
                  onChange={(e) => setIntervalMiles(e.target.value)}
                  placeholder="5000"
                />
              </Field>
              <Field label="Every X months" hint="Whichever comes first">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={intervalMonths}
                  onChange={(e) => setIntervalMonths(e.target.value)}
                  placeholder="6"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Last done — date">
                <Input type="date" value={lastDoneDate} onChange={(e) => setLastDoneDate(e.target.value)} />
              </Field>
              <Field label="Last done — odometer">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={lastDoneOdometer}
                  onChange={(e) => setLastDoneOdometer(e.target.value)}
                  placeholder={currentOdo != null ? String(Math.round(currentOdo)) : "0"}
                />
              </Field>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Due at odometer" hint="Either or both">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={dueOdometer}
                onChange={(e) => setDueOdometer(e.target.value)}
                placeholder={currentOdo != null ? String(Math.round(currentOdo + 1000)) : "0"}
              />
            </Field>
          </div>
        )}

        {currentOdo != null && (
          <p className="text-[12px] text-muted">
            Current odometer: <span className="tabular font-semibold">{num(currentOdo, 0)}</span>
          </p>
        )}

        <ErrorText>{errorMessage}</ErrorText>

        <div className="space-y-3 pt-1">
          <Button type="submit" className="w-full" disabled={mutation.isPending || vehicleId == null}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Add reminder"}
          </Button>
          {isEdit && (
            <Button
              type="button"
              variant="danger-ghost"
              className="w-full"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("Delete this reminder?")) {
                  remove.mutate(undefined, { onSuccess: () => navigate("/service") });
                }
              }}
            >
              Delete reminder
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

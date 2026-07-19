import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, ApiError } from "../api/client";
import { useVehicles } from "../api/hooks";
import type { User } from "../api/types";
import { Button, Card, ErrorText, Field, Segmented, Select, Spinner } from "../components/ui";
import { distanceUnit, volumeLabel, volumeUnit } from "../lib/format";

interface Preview {
  token: string;
  kind: string;
  headers: string[];
  suggested_mapping: Record<string, string | null>;
  sample_rows: Record<string, string>[];
  row_count: number;
  fields: Record<string, { required: boolean }>;
}

interface Result {
  created: number;
  skipped_duplicates: number;
  errors: string[];
  notes: string[];
}

function fieldLabels(dUnit: string, vUnit: string): Record<string, string> {
  const volumeName = vUnit === "L" ? "Liters" : "Gallons";
  return {
    date: "Date",
    odometer: `Odometer (${dUnit})`,
    volume: volumeName,
    price_per_unit: `Price per ${vUnit}`,
    total_cost: "Total cost",
    fill_type: "Fill type (full/partial/missed)",
    partial_flag: "Partial fill flag",
    missed_flag: "Missed fill flag",
    fuel_grade: "Fuel grade",
    station: "Station",
    location: "Location",
    notes: "Notes",
    tags: "Tags",
    service_type: "Service type(s)",
    cost: "Cost",
    shop: "Shop",
    is_diy: "DIY flag",
    parts: "Parts",
  };
}

export default function ImportPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: vehicles } = useVehicles();
  const fileInput = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<"fuelups" | "services">("fuelups");
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<Result | null>(null);

  if (!vehicles) return <Spinner />;
  const activeVehicles = vehicles.filter((v) => !v.archived);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const labels = fieldLabels(
    selectedVehicle ? distanceUnit(selectedVehicle, user) : user.distance_unit,
    volumeLabel(selectedVehicle ? volumeUnit(selectedVehicle, user) : user.volume_unit)
  );
  // the server may have recognized the file as the other kind
  const effectiveKind = (preview?.kind ?? kind) as "fuelups" | "services";

  const upload = async (file: File) => {
    if (vehicleId == null) {
      setError("Pick a vehicle first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/vehicles/${vehicleId}/import/preview?kind=${kind}`,
        { method: "POST", body: form, credentials: "same-origin" }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(response.status, body?.detail ?? "Upload failed");
      }
      const data: Preview = await response.json();
      setPreview(data);
      setMapping(data.suggested_mapping);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!preview || vehicleId == null) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.post<Result>(`/api/vehicles/${vehicleId}/import`, {
        token: preview.token,
        kind: preview.kind,
        mapping,
      });
      setResult(data);
      queryClient.invalidateQueries();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = preview
    ? Object.entries(preview.fields)
        .filter(([field, spec]) => spec.required && !mappedTargets.has(field))
        .map(([field]) => labels[field] ?? field)
    : [];

  return (
    <div className="pt-safe pb-safe mx-auto max-w-lg px-4">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </button>
        <h1 className="text-[22px] font-extrabold tracking-tight">Import history</h1>
      </header>

      {result ? (
        <Card className="text-center">
          <CheckCircle2 size={36} strokeWidth={1.5} className="mx-auto mb-3 text-good" />
          <p className="text-[18px] font-bold">
            {result.created} {effectiveKind === "fuelups" ? "fuel-up" : "service record"}
            {result.created === 1 ? "" : "s"} imported
          </p>
          {result.skipped_duplicates > 0 && (
            <p className="mt-1 text-[13px] text-muted">
              {result.skipped_duplicates} duplicate{result.skipped_duplicates === 1 ? "" : "s"} skipped.
            </p>
          )}
          {result.notes.map((note) => (
            <p key={note} className="mt-3 rounded-card bg-surface2 p-3 text-left text-[12px] leading-relaxed text-muted">
              {note}
            </p>
          ))}
          {result.errors.length > 0 && (
            <div className="mt-3 rounded-card bg-surface2 p-3 text-left">
              <p className="mb-1 text-[13px] font-semibold text-warn">
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} couldn't be read:
              </p>
              {result.errors.map((err) => (
                <p key={err} className="text-[12px] text-muted">
                  {err}
                </p>
              ))}
            </div>
          )}
          <div className="mt-5 space-y-2.5">
            <Link
              to={`/vehicles/${vehicleId}`}
              className="block w-full rounded-full bg-accent px-5 py-3 text-[15px] font-semibold text-[#001427]"
            >
              View the vehicle
            </Link>
            <Button
              variant="surface"
              className="w-full"
              onClick={() => {
                setResult(null);
                setPreview(null);
              }}
            >
              Import another file
            </Button>
          </div>
        </Card>
      ) : !preview ? (
        <div className="space-y-5">
          <Field label="What are you importing?">
            <Segmented
              options={[
                { value: "fuelups", label: "Fuel-ups" },
                { value: "services", label: "Service records" },
              ]}
              value={kind}
              onChange={setKind}
            />
          </Field>
          <Field label="Into which vehicle?">
            <Select
              required
              value={vehicleId ?? ""}
              onChange={(e) => setVehicleId(Number(e.target.value))}
            >
              <option value="" disabled>
                Choose a vehicle
              </option>
              {activeVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-card border border-dashed border-line py-10 text-muted transition-colors hover:border-accent/60 hover:text-accent"
          >
            <FileUp size={26} strokeWidth={1.6} />
            <span className="text-[14px] font-semibold">{busy ? "Reading…" : "Choose a CSV file"}</span>
            <span className="text-[12px]">Exports from other fuel trackers map automatically.</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <ErrorText>{error}</ErrorText>
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="bg-surface2/50">
            <p className="text-[13px] text-muted">
              <span className="font-semibold text-text">{preview.row_count} rows</span> found. Match
              each CSV column to a Pitstop field — we've guessed where we could.
            </p>
          </Card>

          <div className="space-y-3">
            {preview.headers.map((header) => (
              <div key={header} className="rounded-card bg-surface p-3.5">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold">{header}</span>
                  <span className="truncate text-[11px] text-muted">
                    e.g. {preview.sample_rows.map((r) => r[header]).filter(Boolean).slice(0, 2).join(", ") || "—"}
                  </span>
                </div>
                <Select
                  value={mapping[header] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [header]: e.target.value === "" ? null : e.target.value })
                  }
                >
                  <option value="">Don't import this column</option>
                  {Object.keys(preview.fields).map((field) => (
                    <option key={field} value={field}>
                      {labels[field] ?? field}
                      {preview.fields[field].required ? " (required)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          {missingRequired.length > 0 && (
            <p className="text-[13px] text-warn">
              Still needs a column for: {missingRequired.join(", ")}
            </p>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="space-y-2.5">
            <Button
              className="w-full"
              disabled={busy || missingRequired.length > 0}
              onClick={runImport}
            >
              {busy ? "Importing…" : `Import ${preview.row_count} rows`}
            </Button>
            <Button variant="surface" className="w-full" onClick={() => setPreview(null)}>
              Start over
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

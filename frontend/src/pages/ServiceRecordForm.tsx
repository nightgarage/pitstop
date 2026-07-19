import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, FileText, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ApiError, api, uploadFile } from "../api/client";
import {
  useAllServices,
  useCreateService,
  useDeleteService,
  useStatsSummary,
  useUpdateService,
  useVehicles,
} from "../api/hooks";
import type { ServiceRecord, ServiceRecordPayload } from "../api/types";
import { SERVICE_TYPE_PRESETS } from "../api/types";
import Lightbox from "../components/Lightbox";
import { Button, ErrorText, Field, Input, Segmented, Select, Spinner } from "../components/ui";

interface ItemRow {
  service_type: string;
  cost: string;
  parts: string;
}

const EMPTY_ITEM: ItemRow = { service_type: "", cost: "", parts: "" };

export default function ServiceRecordFormPage() {
  const navigate = useNavigate();
  const { id, recordId } = useParams();
  const [params] = useSearchParams();
  const isEdit = recordId !== undefined;

  const { data: vehicles } = useVehicles();
  const { data: services } = useAllServices();
  const { data: summaries } = useStatsSummary();
  const existing = isEdit ? services?.find((r) => r.id === Number(recordId)) : undefined;

  const [vehicleId, setVehicleId] = useState<number | null>(
    id ? Number(id) : params.get("vehicle") ? Number(params.get("vehicle")) : null
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [odometer, setOdometer] = useState("");
  const [where, setWhere] = useState<"shop" | "diy">("shop");
  const [shop, setShop] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (existing) {
      setVehicleId(existing.vehicle_id);
      setDate(existing.date.slice(0, 10));
      setOdometer(existing.odometer?.toString() ?? "");
      setWhere(existing.is_diy ? "diy" : "shop");
      setShop(existing.shop ?? "");
      setNotes(existing.notes ?? "");
      setItems(
        existing.items.map((item) => ({
          service_type: item.service_type,
          cost: item.cost?.toString() ?? "",
          parts: item.parts ?? "",
        }))
      );
    }
  }, [existing]);

  const create = useCreateService(vehicleId ?? 0);
  const update = useUpdateService(existing?.vehicle_id ?? 0, Number(recordId) || 0);
  const remove = useDeleteService(existing?.vehicle_id ?? 0, Number(recordId) || 0);
  const mutation = isEdit ? update : create;

  if (!vehicles) return <Spinner />;
  if (isEdit && !existing && services) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-[14px] text-muted">
        This service record no longer exists.
      </div>
    );
  }

  const currentOdo = summaries?.find((s) => s.vehicle_id === vehicleId)?.latest_odometer;

  const setItem = (index: number, patch: Partial<ItemRow>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const finishSave = async (record: ServiceRecord) => {
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        for (const file of pendingFiles) {
          await uploadFile(`/api/vehicles/${record.vehicle_id}/services/${record.id}/attachments`, file);
        }
      } finally {
        setUploading(false);
        queryClient.invalidateQueries({ queryKey: ["services"] });
      }
    }
    navigate("/service");
  };

  const removeAttachment = async (attachmentId: number) => {
    if (!window.confirm("Remove this attachment?")) return;
    await api.delete(`/api/attachments/${attachmentId}`);
    queryClient.invalidateQueries({ queryKey: ["services"] });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (vehicleId == null) return;
    const payload: ServiceRecordPayload = {
      // date-only field; store as noon so timezones can't shift the day
      date: `${date}T12:00:00`,
      odometer: odometer.trim() === "" ? null : Number(odometer),
      is_diy: where === "diy",
      shop: where === "shop" && shop.trim() !== "" ? shop.trim() : null,
      notes: notes.trim() === "" ? null : notes.trim(),
      items: items
        .filter((item) => item.service_type.trim() !== "")
        .map((item) => ({
          service_type: item.service_type.trim(),
          cost: item.cost.trim() === "" ? null : Number(item.cost),
          parts: item.parts.trim() === "" ? null : item.parts.trim(),
        })),
    };
    mutation.mutate(payload, { onSuccess: finishSave });
  };

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? "Save failed — try again."
        : "";

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      {viewer && <Lightbox src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("/service")}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </button>
        <h1 className="text-[22px] font-extrabold tracking-tight">
          {isEdit ? "Edit service" : "Log service"}
        </h1>
      </header>

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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Odometer">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder={currentOdo != null ? String(Math.round(currentOdo)) : "0"}
            />
          </Field>
        </div>

        <Field label="Done by">
          <Segmented
            options={[
              { value: "shop", label: "Shop" },
              { value: "diy", label: "DIY" },
            ]}
            value={where}
            onChange={setWhere}
          />
        </Field>
        {where === "shop" && (
          <Field label="Shop name">
            <Input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="Main Street Auto" />
          </Field>
        )}

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Work done</span>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="space-y-2.5 rounded-card bg-surface p-3.5">
                <div className="flex items-center gap-2">
                  <Input
                    required
                    list="service-type-presets"
                    value={item.service_type}
                    onChange={(e) => setItem(index, { service_type: e.target.value })}
                    placeholder="Oil & filter change"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => setItems(items.filter((_, i) => i !== index))}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-muted hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={item.cost}
                    onChange={(e) => setItem(index, { cost: e.target.value })}
                    placeholder="Cost"
                  />
                  <Input
                    value={item.parts}
                    onChange={(e) => setItem(index, { parts: e.target.value })}
                    placeholder="Parts (optional)"
                  />
                </div>
              </div>
            ))}
          </div>
          <datalist id="service-type-presets">
            {SERVICE_TYPE_PRESETS.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => setItems([...items, { ...EMPTY_ITEM }])}
            className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-accent"
          >
            <Plus size={16} strokeWidth={2.2} /> Add another item
          </button>
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Photos & receipts</span>
          <div className="flex flex-wrap gap-2.5">
            {existing?.attachments.map((attachment) => (
              <div key={attachment.id} className="relative">
                {attachment.content_type === "application/pdf" ? (
                  <a
                    href={`/api/attachments/${attachment.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-control bg-surface text-muted"
                  >
                    <FileText size={22} strokeWidth={1.6} />
                    <span className="max-w-16 truncate text-[10px]">{attachment.filename}</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setViewer({ src: `/api/attachments/${attachment.id}`, alt: attachment.filename })
                    }
                  >
                    <img
                      src={`/api/attachments/${attachment.id}`}
                      alt={attachment.filename}
                      className="h-20 w-20 rounded-control object-cover"
                    />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface2 text-muted shadow hover:text-danger"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {pendingFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="relative">
                {file.type === "application/pdf" ? (
                  <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-control bg-surface text-muted">
                    <FileText size={22} strokeWidth={1.6} />
                    <span className="max-w-16 truncate text-[10px]">{file.name}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setViewer({ src: URL.createObjectURL(file), alt: file.name })}
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-20 w-20 rounded-control object-cover opacity-80"
                    />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Remove pending file"
                  onClick={() => setPendingFiles(pendingFiles.filter((_, i) => i !== index))}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface2 text-muted shadow hover:text-danger"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line text-muted transition-colors hover:border-accent/60 hover:text-accent"
            >
              <Camera size={20} strokeWidth={1.6} />
              <span className="text-[10px] font-medium">Add</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                setPendingFiles([...pendingFiles, ...Array.from(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
          <span className="mt-1 block text-xs text-muted/80">
            Photos or PDFs, up to 15 MB each.{!isEdit && pendingFiles.length > 0 && " Uploads when you save."}
          </span>
        </div>

        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>

        <ErrorText>{errorMessage}</ErrorText>

        <div className="space-y-3 pt-1">
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending || uploading || vehicleId == null}
          >
            {uploading
              ? "Uploading photos…"
              : mutation.isPending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Save service"}
          </Button>
          {isEdit && (
            <Button
              type="button"
              variant="danger-ghost"
              className="w-full"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("Delete this service record?")) {
                  remove.mutate(undefined, { onSuccess: () => navigate("/service") });
                }
              }}
            >
              Delete record
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

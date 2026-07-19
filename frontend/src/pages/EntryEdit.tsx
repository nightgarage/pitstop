import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  useCharges,
  useDeleteCharge,
  useDeleteFuelUp,
  useFuelUps,
  useUpdateCharge,
  useUpdateFuelUp,
  useVehicle,
} from "../api/hooks";
import type { User } from "../api/types";
import { ChargeForm, FuelUpForm } from "../components/EntryForm";
import { Button, Spinner } from "../components/ui";
import { currencyOf, distanceUnit, volumeLabel, volumeUnit } from "../lib/format";

function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency }).formatToParts(1);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

export default function EntryEditPage({ user, kind }: { user: User; kind: "fuel" | "charge" }) {
  const { id, entryId } = useParams();
  const vehicleId = Number(id);
  const navigate = useNavigate();

  const { data: vehicle } = useVehicle(vehicleId);
  const { data: fuelups } = useFuelUps(kind === "fuel" ? vehicleId : undefined);
  const { data: charges } = useCharges(kind === "charge" ? vehicleId : undefined);

  const updateFuel = useUpdateFuelUp(vehicleId, Number(entryId));
  const deleteFuel = useDeleteFuelUp(vehicleId, Number(entryId));
  const updateCharge = useUpdateCharge(vehicleId, Number(entryId));
  const deleteCharge = useDeleteCharge(vehicleId, Number(entryId));

  const entryList = kind === "fuel" ? fuelups : charges;
  if (!vehicle || !entryList) return <Spinner />;
  const entry = entryList.find((e) => e.id === Number(entryId));
  if (!entry) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-[14px] text-muted">
        This entry no longer exists.{" "}
        <Link className="text-accent" to={`/vehicles/${vehicleId}`}>
          Back to the vehicle
        </Link>
      </div>
    );
  }

  const update = kind === "fuel" ? updateFuel : updateCharge;
  const remove = kind === "fuel" ? deleteFuel : deleteCharge;
  const back = () => navigate(`/vehicles/${vehicleId}`);
  const errorText = (error: unknown) =>
    error instanceof ApiError ? error.message : error ? "Save failed — try again." : "";

  const currency = currencySymbol(currencyOf(vehicle, user));
  const dUnit = distanceUnit(vehicle, user);
  const vUnit = volumeLabel(volumeUnit(vehicle, user));

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={back}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </button>
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">
            Edit {kind === "fuel" ? "fuel-up" : "charge"}
          </h1>
          <p className="text-[13px] text-muted">{vehicle.name}</p>
        </div>
      </header>

      {kind === "fuel" ? (
        <FuelUpForm
          existing={fuelups!.find((f) => f.id === Number(entryId))}
          showDrivingConditions={user.show_driving_conditions}
          volumeUnitLabel={vUnit}
          currencySymbol={currency}
          distanceUnitLabel={dUnit}
          busy={update.isPending}
          error={errorText(update.error)}
          onSubmit={(payload) => updateFuel.mutate(payload, { onSuccess: back })}
        />
      ) : (
        <ChargeForm
          existing={charges!.find((c) => c.id === Number(entryId))}
          currencySymbol={currency}
          distanceUnitLabel={dUnit}
          busy={update.isPending}
          error={errorText(update.error)}
          onSubmit={(payload) => updateCharge.mutate(payload, { onSuccess: back })}
        />
      )}

      <Button
        variant="danger-ghost"
        className="mt-3 w-full"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm("Delete this entry? Stats will recompute.")) {
            remove.mutate(undefined, { onSuccess: back });
          }
        }}
      >
        Delete entry
      </Button>
    </div>
  );
}

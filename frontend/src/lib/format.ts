import type { DistanceUnit, EnergyType, User, Vehicle, VolumeUnit } from "../api/types";

export function distanceUnit(vehicle: Vehicle, user: User): DistanceUnit {
  return vehicle.distance_unit ?? user.distance_unit;
}

export function volumeUnit(vehicle: Vehicle, user: User): VolumeUnit {
  return vehicle.volume_unit ?? user.volume_unit;
}

export function currencyOf(vehicle: Vehicle, user: User): string {
  return vehicle.currency ?? user.currency;
}

export function volumeLabel(unit: VolumeUnit): string {
  return unit === "l" ? "L" : "gal";
}

/** "MPG", "mi/kWh", "km/L", "km/kWh" — the economy unit for this vehicle. */
export function economyLabel(energy: EnergyType, distance: DistanceUnit): string {
  const electric = energy === "electric";
  if (distance === "mi") return electric ? "mi/kWh" : "MPG";
  return electric ? "km/kWh" : "km/L";
}

export function money(value: number | null | undefined, currency: string): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maxFractionDigits: 2,
    } as Intl.NumberFormatOptions).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function num(value: number | null | undefined, digits = 1): string {
  if (value == null) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** datetime-local input value for "now" or a stored ISO date. */
export function toLocalInput(iso?: string): string {
  const date = iso ? new Date(iso + (iso.endsWith("Z") || iso.includes("+") ? "" : "Z")) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Convert a datetime-local value to UTC ISO for the API. */
export function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

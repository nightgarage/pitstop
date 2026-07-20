export type EnergyType = "gasoline" | "diesel" | "hybrid" | "plug_in_hybrid" | "electric";
export type DistanceUnit = "mi" | "km";
export type VolumeUnit = "us_gal" | "uk_gal" | "l";
export type Role = "admin" | "user";

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  distance_unit: DistanceUnit;
  volume_unit: VolumeUnit;
  currency: string;
  show_driving_conditions: boolean;
  onboarding_done: boolean;
  created_at: string;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
  vehicle_count: number;
  entry_count: number;
}

export interface AdminCreatedUser {
  user: AdminUser;
  temp_password: string;
}

export interface AdminSettings {
  allow_registration: boolean | null;
  effective_allow_registration: boolean;
  env_default: boolean;
}

export interface Channel {
  id?: number;
  kind: "email" | "ntfy" | "gotify" | "webhook";
  config: Record<string, string>;
  enabled: boolean;
}

export interface AuthStatus {
  setup_required: boolean;
  allow_registration: boolean;
  user: User | null;
}

export interface Vehicle {
  id: number;
  owner_id: number;
  name: string;
  energy_type: EnergyType;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  tank_size: number | null;
  battery_size: number | null;
  odometer_start: number | null;
  photo_path: string | null;
  distance_unit: DistanceUnit | null;
  volume_unit: VolumeUnit | null;
  currency: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehiclePayload {
  name: string;
  energy_type: EnergyType;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  tank_size?: number | null;
  battery_size?: number | null;
  odometer_start?: number | null;
  distance_unit?: DistanceUnit | null;
  volume_unit?: VolumeUnit | null;
  currency?: string | null;
  archived?: boolean;
}

export type FillType = "full" | "partial" | "missed";
export type ChargeType = "home" | "public_l2" | "dc_fast";

export interface FuelUp {
  id: number;
  vehicle_id: number;
  date: string;
  odometer: number;
  volume: number;
  price_per_unit: number | null;
  total_cost: number | null;
  fill_type: FillType;
  fuel_grade: string | null;
  station: string | null;
  location: string | null;
  driving_conditions: string | null;
  notes: string | null;
  tags: string[];
  economy: number | null;
  distance: number | null;
}

export interface FuelUpPayload {
  date: string;
  odometer: number;
  volume: number;
  price_per_unit?: number | null;
  total_cost?: number | null;
  fill_type: FillType;
  fuel_grade?: string | null;
  station?: string | null;
  location?: string | null;
  driving_conditions?: string | null;
  notes?: string | null;
  tags?: string[];
}

export interface ChargeSession {
  id: number;
  vehicle_id: number;
  date: string;
  odometer: number;
  kwh_added: number;
  price_per_kwh: number | null;
  total_cost: number | null;
  fill_type: FillType;
  charge_type: ChargeType;
  start_pct: number | null;
  end_pct: number | null;
  station: string | null;
  location: string | null;
  notes: string | null;
  tags: string[];
  economy: number | null;
  distance: number | null;
}

export interface ChargePayload {
  date: string;
  odometer: number;
  kwh_added: number;
  price_per_kwh?: number | null;
  total_cost?: number | null;
  fill_type: FillType;
  charge_type: ChargeType;
  start_pct?: number | null;
  end_pct?: number | null;
  station?: string | null;
  location?: string | null;
  notes?: string | null;
  tags?: string[];
}

export interface EnergyStats {
  lifetime: number | null;
  best: number | null;
  worst: number | null;
  last: number | null;
  total_energy: number;
  total_spend: number;
  cost_per_distance: number | null;
}

export interface VehicleStats {
  vehicle_id: number;
  latest_odometer: number | null;
  entry_count: number;
  month_spend: number;
  fuel: EnergyStats | null;
  electric: EnergyStats | null;
  blended_cost_per_distance: number | null;
}

export interface VehicleStatsSummary {
  vehicle_id: number;
  latest_odometer: number | null;
  avg_economy: number | null;
  month_spend: number;
  last_entry_date: string | null;
}

// ---- Service & reminders ----

export interface ServiceItem {
  id?: number;
  service_type: string;
  cost?: number | null;
  parts?: string | null;
}

export interface Attachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  kind: string;
}

export interface ServiceRecord {
  id: number;
  vehicle_id: number;
  vehicle_name: string | null;
  date: string;
  odometer: number | null;
  shop: string | null;
  is_diy: boolean;
  total_cost: number | null;
  notes: string | null;
  items: ServiceItem[];
  attachments: Attachment[];
}

export interface ServiceRecordPayload {
  date: string;
  odometer?: number | null;
  shop?: string | null;
  is_diy?: boolean;
  total_cost?: number | null;
  notes?: string | null;
  items: ServiceItem[];
}

export type ReminderStatus = "upcoming" | "due" | "overdue";

export interface Reminder {
  id: number;
  vehicle_id: number;
  vehicle_name: string | null;
  name: string;
  interval_miles: number | null;
  interval_months: number | null;
  due_date: string | null;
  due_odometer: number | null;
  last_done_date: string | null;
  last_done_odometer: number | null;
  active: boolean;
  status: ReminderStatus;
  next_due_odometer: number | null;
  next_due_date: string | null;
  miles_remaining: number | null;
  days_remaining: number | null;
}

export interface ReminderPayload {
  name: string;
  interval_miles?: number | null;
  interval_months?: number | null;
  due_date?: string | null;
  due_odometer?: number | null;
  last_done_date?: string | null;
  last_done_odometer?: number | null;
  active?: boolean;
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string | null;
  kind: string;
  read: boolean;
  created_at: string;
}

export interface NotificationList {
  unread_count: number;
  notifications: NotificationItem[];
}

// ---- Fuel grades ----

export interface GradeStats {
  grade: string;
  tank_count: number;
  avg_economy: number | null;
  avg_price: number | null;
  cost_per_distance: number | null;
  enough_data: boolean;
}

export interface GradeVerdict {
  best_grade: string;
  vs_grade: string;
  per_1000_savings: number;
  yearly_savings: number;
  annual_distance: number;
  annual_distance_estimated: boolean;
}

export interface GradeComparison {
  vehicle_id: number;
  min_tanks: number;
  grades: GradeStats[];
  verdict: GradeVerdict | null;
}

export const SERVICE_TYPE_PRESETS = [
  "Oil & filter change",
  "Tire rotation",
  "New tires",
  "Brakes",
  "Battery",
  "Engine air filter",
  "Cabin air filter",
  "Coolant flush",
  "Transmission service",
  "Spark plugs",
  "Wipers",
  "Alignment",
  "Inspection",
  "Registration",
];

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  home: "Home",
  public_l2: "Public L2",
  dc_fast: "DC fast",
};

export const ENERGY_TYPE_LABELS: Record<EnergyType, string> = {
  gasoline: "Gasoline",
  diesel: "Diesel",
  hybrid: "Hybrid",
  plug_in_hybrid: "Plug-in hybrid",
  electric: "Electric",
};

export const DISTANCE_UNIT_LABELS: Record<DistanceUnit, string> = {
  mi: "Miles",
  km: "Kilometers",
};

export const VOLUME_UNIT_LABELS: Record<VolumeUnit, string> = {
  us_gal: "US gallons",
  uk_gal: "UK gallons",
  l: "Liters",
};

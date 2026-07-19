import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  AdminSettings,
  AdminUser,
  AuthStatus,
  Channel,
  ChargePayload,
  ChargeSession,
  FuelUp,
  FuelUpPayload,
  GradeComparison,
  NotificationList,
  Reminder,
  ReminderPayload,
  ServiceRecord,
  ServiceRecordPayload,
  User,
  Vehicle,
  VehiclePayload,
  VehicleStats,
  VehicleStatsSummary,
} from "./types";

export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth", "status"],
    queryFn: () => api.get<AuthStatus>("/api/auth/status"),
    staleTime: 60_000,
  });
}

function useAuthInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

export function useSetup() {
  const invalidate = useAuthInvalidation();
  return useMutation({
    mutationFn: (body: { email: string; password: string; display_name: string }) =>
      api.post<User>("/api/auth/setup", body),
    onSuccess: invalidate,
  });
}

export function useRegister() {
  const invalidate = useAuthInvalidation();
  return useMutation({
    mutationFn: (body: { email: string; password: string; display_name: string }) =>
      api.post<User>("/api/auth/register", body),
    onSuccess: invalidate,
  });
}

export function useLogin() {
  const invalidate = useAuthInvalidation();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<User>("/api/auth/login", body),
    onSuccess: invalidate,
  });
}

export function useLogout() {
  const invalidate = useAuthInvalidation();
  return useMutation({
    mutationFn: () => api.post<void>("/api/auth/logout"),
    onSuccess: invalidate,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<User, "display_name" | "distance_unit" | "volume_unit" | "currency">>) =>
      api.patch<User>("/api/auth/me", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api.post<void>("/api/auth/change-password", body),
  });
}

export function useVehicles(includeArchived = false) {
  return useQuery({
    queryKey: ["vehicles", { includeArchived }],
    queryFn: () =>
      api.get<Vehicle[]>(`/api/vehicles${includeArchived ? "?include_archived=true" : ""}`),
  });
}

export function useVehicle(id: number | undefined) {
  return useQuery({
    queryKey: ["vehicles", "detail", id],
    queryFn: () => api.get<Vehicle>(`/api/vehicles/${id}`),
    enabled: id !== undefined,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: VehiclePayload) => api.post<Vehicle>("/api/vehicles", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useUpdateVehicle(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<VehiclePayload>) => api.patch<Vehicle>(`/api/vehicles/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useArchiveVehicle(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<Vehicle>(`/api/vehicles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

// ---- entries & stats ----

function useEntryInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["fuelups"] });
    queryClient.invalidateQueries({ queryKey: ["charges"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };
}

export function useFuelUps(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ["fuelups", vehicleId],
    queryFn: () => api.get<FuelUp[]>(`/api/vehicles/${vehicleId}/fuelups`),
    enabled: vehicleId !== undefined,
  });
}

export function useCreateFuelUp(vehicleId: number) {
  const invalidate = useEntryInvalidation();
  return useMutation({
    mutationFn: (body: FuelUpPayload) =>
      api.post<FuelUp>(`/api/vehicles/${vehicleId}/fuelups`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateFuelUp(vehicleId: number, id: number) {
  const invalidate = useEntryInvalidation();
  return useMutation({
    mutationFn: (body: Partial<FuelUpPayload>) =>
      api.patch<FuelUp>(`/api/vehicles/${vehicleId}/fuelups/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteFuelUp(vehicleId: number, id: number) {
  const invalidate = useEntryInvalidation();
  return useMutation({
    mutationFn: () => api.delete<void>(`/api/vehicles/${vehicleId}/fuelups/${id}`),
    onSuccess: invalidate,
  });
}

export function useCharges(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ["charges", vehicleId],
    queryFn: () => api.get<ChargeSession[]>(`/api/vehicles/${vehicleId}/charges`),
    enabled: vehicleId !== undefined,
  });
}

export function useCreateCharge(vehicleId: number) {
  const invalidate = useEntryInvalidation();
  return useMutation({
    mutationFn: (body: ChargePayload) =>
      api.post<ChargeSession>(`/api/vehicles/${vehicleId}/charges`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCharge(vehicleId: number, id: number) {
  const invalidate = useEntryInvalidation();
  return useMutation({
    mutationFn: (body: Partial<ChargePayload>) =>
      api.patch<ChargeSession>(`/api/vehicles/${vehicleId}/charges/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteCharge(vehicleId: number, id: number) {
  const invalidate = useEntryInvalidation();
  return useMutation({
    mutationFn: () => api.delete<void>(`/api/vehicles/${vehicleId}/charges/${id}`),
    onSuccess: invalidate,
  });
}

export function useVehicleStats(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ["stats", "vehicle", vehicleId],
    queryFn: () => api.get<VehicleStats>(`/api/vehicles/${vehicleId}/stats`),
    enabled: vehicleId !== undefined,
  });
}

export function useStatsSummary() {
  return useQuery({
    queryKey: ["stats", "summary"],
    queryFn: () => api.get<VehicleStatsSummary[]>("/api/vehicles/stats-summary"),
  });
}

export function useGradeComparison(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ["grades", vehicleId],
    queryFn: () => api.get<GradeComparison>(`/api/vehicles/${vehicleId}/grades`),
    enabled: vehicleId !== undefined,
  });
}

// ---- service & reminders ----

function useServiceInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["services"] });
    queryClient.invalidateQueries({ queryKey: ["reminders"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useAllServices() {
  return useQuery({
    queryKey: ["services", "all"],
    queryFn: () => api.get<ServiceRecord[]>("/api/services"),
  });
}

export function useVehicleServices(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ["services", "vehicle", vehicleId],
    queryFn: () => api.get<ServiceRecord[]>(`/api/vehicles/${vehicleId}/services`),
    enabled: vehicleId !== undefined,
  });
}

export function useCreateService(vehicleId: number) {
  const invalidate = useServiceInvalidation();
  return useMutation({
    mutationFn: (body: ServiceRecordPayload) =>
      api.post<ServiceRecord>(`/api/vehicles/${vehicleId}/services`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateService(vehicleId: number, id: number) {
  const invalidate = useServiceInvalidation();
  return useMutation({
    mutationFn: (body: Partial<ServiceRecordPayload>) =>
      api.patch<ServiceRecord>(`/api/vehicles/${vehicleId}/services/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteService(vehicleId: number, id: number) {
  const invalidate = useServiceInvalidation();
  return useMutation({
    mutationFn: () => api.delete<void>(`/api/vehicles/${vehicleId}/services/${id}`),
    onSuccess: invalidate,
  });
}

export function useReminders(includeInactive = false) {
  return useQuery({
    queryKey: ["reminders", { includeInactive }],
    queryFn: () =>
      api.get<Reminder[]>(`/api/reminders${includeInactive ? "?include_inactive=true" : ""}`),
  });
}

export function useCreateReminder(vehicleId: number) {
  const invalidate = useServiceInvalidation();
  return useMutation({
    mutationFn: (body: ReminderPayload) =>
      api.post<Reminder>(`/api/vehicles/${vehicleId}/reminders`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateReminder(vehicleId: number, id: number) {
  const invalidate = useServiceInvalidation();
  return useMutation({
    mutationFn: (body: Partial<ReminderPayload>) =>
      api.patch<Reminder>(`/api/vehicles/${vehicleId}/reminders/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useCompleteReminder(vehicleId: number, id: number) {
  const invalidate = useServiceInvalidation();
  return useMutation({
    mutationFn: (body: { date: string; odometer?: number | null }) =>
      api.post<Reminder>(`/api/vehicles/${vehicleId}/reminders/${id}/complete`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteReminder(vehicleId: number, id: number) {
  const invalidate = useServiceInvalidation();
  return useMutation({
    mutationFn: () => api.delete<void>(`/api/vehicles/${vehicleId}/reminders/${id}`),
    onSuccess: invalidate,
  });
}

// ---- notifications ----

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationList>("/api/notifications"),
    staleTime: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<void>(`/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ---- notification channels ----

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<Channel[]>("/api/notifications/channels"),
  });
}

export function useSaveChannels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channels: Channel[]) => api.put<Channel[]>("/api/notifications/channels", channels),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });
}

// ---- admin ----

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<AdminUser[]>("/api/admin/users"),
  });
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/admin/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.get<AdminSettings>("/api/admin/settings"),
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { allow_registration: boolean | null }) =>
      api.put<AdminSettings>("/api/admin/settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}

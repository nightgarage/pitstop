import { useEffect, useRef } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuthStatus, useUpdateProfile, useVehicles } from "./api/hooks";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import type { User } from "./api/types";
import AdminPage from "./pages/Admin";
import { LoginPage, SetupPage } from "./pages/AuthPages";
import DashboardPage from "./pages/Dashboard";
import EntryEditPage from "./pages/EntryEdit";
import GaragePage from "./pages/Garage";
import ImportPage from "./pages/Import";
import LogPage from "./pages/Log";
import NotificationsPage from "./pages/Notifications";
import OnboardingPage from "./pages/Onboarding";
import ReminderFormPage from "./pages/ReminderForm";
import ServicePage from "./pages/Service";
import ServiceRecordFormPage from "./pages/ServiceRecordForm";
import SettingsPage from "./pages/SettingsPage";
import StatsPage from "./pages/Stats";
import VehicleFormPage from "./pages/VehicleForm";

export default function App() {
  const { data: status, isLoading, isError } = useAuthStatus();

  if (isLoading) return <Spinner />;
  if (isError || !status) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-8 text-center text-[14px] text-muted">
        Can't reach the Pitstop server. Check that it's running, then reload.
      </div>
    );
  }

  if (status.setup_required) return <SetupPage />;
  if (!status.user) return <LoginPage allowRegistration={status.allow_registration} />;

  return <AuthedApp user={status.user} />;
}

function AuthedApp({ user }: { user: User }) {
  // First-login walkthrough gate: brand-new accounts (no vehicles, flag unset)
  // go to /welcome. Accounts that predate the flag but already have vehicles
  // are marked done silently so they never see it.
  const needsCheck = !user.onboarding_done;
  const { data: vehicles } = useVehicles();
  const update = useUpdateProfile();
  const autoMarked = useRef(false);

  useEffect(() => {
    if (needsCheck && vehicles && vehicles.length > 0 && !autoMarked.current) {
      autoMarked.current = true;
      update.mutate({ onboarding_done: true });
    }
  }, [needsCheck, vehicles, update]);

  if (needsCheck && !vehicles) return <Spinner />;
  if (needsCheck && vehicles?.length === 0) {
    return (
      <Routes>
        <Route path="/welcome" element={<OnboardingPage user={user} />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/welcome" element={<OnboardingPage user={user} />} />
      <Route path="/vehicles/new" element={<VehicleFormPage />} />
      <Route path="/vehicles/:id/edit" element={<VehicleFormPage />} />
      <Route
        path="/vehicles/:id"
        element={
          <Layout>
            <DashboardPage user={user} />
          </Layout>
        }
      />
      <Route path="/vehicles/:id/fuelups/:entryId" element={<EntryEditPage user={user} kind="fuel" />} />
      <Route path="/vehicles/:id/charges/:entryId" element={<EntryEditPage user={user} kind="charge" />} />
      <Route path="/settings" element={<SettingsPage user={user} />} />
      <Route path="/settings/import" element={<ImportPage user={user} />} />
      {user.role === "admin" && <Route path="/admin" element={<AdminPage user={user} />} />}
      <Route
        path="/log"
        element={
          <Layout>
            <LogPage user={user} />
          </Layout>
        }
      />
      <Route
        path="/service"
        element={
          <Layout>
            <ServicePage user={user} />
          </Layout>
        }
      />
      <Route path="/service/reminders/new" element={<ReminderFormPage />} />
      <Route path="/service/records/new" element={<ServiceRecordFormPage />} />
      <Route path="/vehicles/:id/reminders/:reminderId" element={<ReminderFormPage />} />
      <Route path="/vehicles/:id/services/:recordId" element={<ServiceRecordFormPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route
        path="/stats"
        element={
          <Layout>
            <StatsPage user={user} />
          </Layout>
        }
      />
      <Route
        path="/"
        element={
          <Layout>
            <GaragePage user={user} />
          </Layout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

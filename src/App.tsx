import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import AppHeader from "./components/AppHeader";
import InstallPrompt from "./components/InstallPrompt";
import Spinner from "./components/ui/Spinner";
import AuthProvider from "./providers/AuthProvider";
import ToastProvider from "./providers/ToastProvider";
import ConfirmProvider from "./providers/ConfirmProvider";
import CelebrateProvider from "./providers/CelebrateProvider";
import NotificationsProvider from "./providers/NotificationsProvider";
import { useAuth } from "./hooks/useAuth";

// Route-level code splitting keeps the initial bundle lean.
const LoginPage = lazy(() => import("./pages/Login"));
const OnboardingPage = lazy(() => import("./pages/Onboarding"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const GroupPage = lazy(() => import("./pages/Group"));
const ProfilePage = lazy(() => import("./pages/Profile"));

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8 text-brand-500" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireProfile({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  // A fresh account (e.g. Google sign-in) lands here until it picks a username.
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireProfile>
        <AppLayout>{children}</AppLayout>
      </RequireProfile>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CelebrateProvider>
        <ConfirmProvider>
          <NotificationsProvider>
            <InstallPrompt />
            <Suspense fallback={<FullScreenLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
              <Route
                path="/onboarding"
                element={
                  <RequireAuth>
                    <OnboardingPage />
                  </RequireAuth>
                }
              />
              <Route path="/" element={<Protected><DashboardPage /></Protected>} />
              <Route path="/groups/:groupId" element={<Protected><GroupPage /></Protected>} />
              <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </NotificationsProvider>
        </ConfirmProvider>
        </CelebrateProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

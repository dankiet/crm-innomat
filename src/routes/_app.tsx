import { useState } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { Toaster } from "@/components/ui/sonner";
import { fetchMe } from "@/api/functions";
import type { SessionUser } from "@/lib/auth-types";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const user = await fetchMe();
    if (!user) {
      throw redirect({ to: "/login" });
    }
    return { user: user as SessionUser };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden">
      <AppSidebar
        user={user}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />
        <div className="flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-6 lg:p-8 safe-pb">
          <Outlet />
        </div>
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}

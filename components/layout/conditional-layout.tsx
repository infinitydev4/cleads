"use client";

import { usePathname } from "next/navigation";
import { RootLayout as MainLayout } from "@/components/layout/root-layout";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ClientLayout } from "@/components/layout/client-layout";

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isDashboardPage = pathname?.startsWith("/dashboard");
  const isClientPage = pathname?.startsWith("/client");

  // The homepage owns its navigation, footer and mobile conversion bar.
  if (pathname === "/") return <>{children}</>;

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (isDashboardPage) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  if (isClientPage) {
    return <ClientLayout>{children}</ClientLayout>;
  }

  return <MainLayout>{children}</MainLayout>;
}

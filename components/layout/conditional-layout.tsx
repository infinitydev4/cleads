"use client";

import { usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // The homepage and the legal pages own their layout; only the back-office gets a shell.
  if (pathname?.startsWith("/dashboard")) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  return <>{children}</>;
}

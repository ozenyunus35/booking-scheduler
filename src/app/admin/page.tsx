import type { Metadata } from "next";
import { Suspense } from "react";
import { Calendar } from "@/components/admin/calendar";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner label="Loading calendar" />}>
      <Calendar />
    </Suspense>
  );
}

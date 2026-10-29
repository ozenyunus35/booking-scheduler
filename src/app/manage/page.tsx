import type { Metadata } from "next";
import { Suspense } from "react";
import { ManagePage } from "@/components/booking/manage-page";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Manage your booking" };

// The booking link's token is read from the query string, which a static export only knows in the browser.
export default function Page() {
  return (
    <Suspense fallback={<Spinner label="Loading your booking" />}>
      <ManagePage />
    </Suspense>
  );
}

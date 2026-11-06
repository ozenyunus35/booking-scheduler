import type { Metadata } from "next";
import { Suspense } from "react";
import { Clients } from "@/components/admin/clients";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Clients" };

export default function Page() {
  // ?c=<id> opens a client, which a static export only reads in the browser.
  return (
    <Suspense fallback={<Spinner />}>
      <Clients />
    </Suspense>
  );
}

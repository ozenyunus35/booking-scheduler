import type { Metadata } from "next";
import { Clients } from "@/components/admin/clients";

export const metadata: Metadata = { title: "Clients" };

export default function Page() {
  return <Clients />;
}

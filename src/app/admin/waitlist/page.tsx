import type { Metadata } from "next";
import { Waitlist } from "@/components/admin/waitlist";

export const metadata: Metadata = { title: "Waitlist" };

export default function Page() {
  return <Waitlist />;
}

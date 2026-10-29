import type { Metadata } from "next";
import { Services } from "@/components/admin/services";

export const metadata: Metadata = { title: "Services" };

export default function Page() {
  return <Services />;
}

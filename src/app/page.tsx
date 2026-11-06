import { BookingPage } from "@/components/booking/booking-page";
import { LangProvider } from "@/lib/i18n";

export default function Home() {
  // The salon's own booking site is in English; only the admin console has a Turkish version.
  return (
    <LangProvider fixed="en">
      <BookingPage />
    </LangProvider>
  );
}

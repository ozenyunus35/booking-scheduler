/**
 * Times of day are minutes after midnight in the salon's time zone and dates are
 * "YYYY-MM-DD" salon dates, so availability never depends on the viewer's clock.
 */

export type ISODate = string;

export interface Interval {
  start: number;
  end: number;
}

/** One weekday's opening hours for a staff member; null means the day off. */
export interface DayHours extends Interval {
  breaks: Interval[];
}

export type Category = "Cuts" | "Color" | "Styling" | "Barbering" | "Treatments";

export interface Service {
  id: string;
  name: string;
  category: Category;
  description: string;
  duration: number;
  /** Clean-up time after the appointment, blocked on the staff member's calendar. */
  buffer: number;
  price: number;
  staffIds: string[];
  active: boolean;
  popular?: boolean;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  bio: string;
  /** Monday first. */
  hours: (DayHours | null)[];
  /** Calendar colour, a muted hue token (see globals.css). */
  hue: number;
}

export interface TimeOff {
  id: string;
  staffId: string;
  from: ISODate;
  to: ISODate;
  /** Set for a part of a single day, otherwise the whole days are off. */
  start?: number;
  end?: number;
  reason: string;
}

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no-show";
export type BookingSource = "online" | "phone" | "walk-in";

export interface Booking {
  id: string;
  ref: string;
  /** Secret for the client's "manage booking" link, so the link carries no personal data. */
  token: string;
  serviceId: string;
  staffId: string;
  clientId: string;
  date: ISODate;
  start: number;
  end: number;
  status: BookingStatus;
  price: number;
  source: BookingSource;
  /** The client picked "any available" and the salon assigned the staff member. */
  anyStaff: boolean;
  notes: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
}

export interface Rules {
  /** Minutes between possible start times. */
  slotStep: number;
  /** Earliest bookable time, in minutes from now. */
  minNotice: number;
  maxDaysAhead: number;
  /** Clients can cancel or reschedule online until this many hours before. */
  cancelHours: number;
}

export interface Salon {
  name: string;
  timeZone: string;
  address: string;
  phone: string;
  currency: string;
}

export interface DemoState {
  version: number;
  seededOn: ISODate;
  salon: Salon;
  rules: Rules;
  services: Service[];
  staff: Staff[];
  timeOff: TimeOff[];
  clients: Client[];
  bookings: Booking[];
}

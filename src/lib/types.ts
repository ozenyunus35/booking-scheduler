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
export type BookingSource = "online" | "phone" | "walk-in" | "waitlist";

export interface Booking {
  id: string;
  ref: string;
  /** Secret for the client's "manage booking" link, so the link carries no personal data. */
  token: string;
  serviceId: string;
  /** Services done right after the main one in the same visit, e.g. a cut after color. */
  addOnIds?: string[];
  staffId: string;
  clientId: string;
  date: ISODate;
  start: number;
  end: number;
  /** Shared by the appointments of a repeating series. */
  seriesId?: string;
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

/** Part of the day a waitlisted client can come in. */
export type DayPart = "any" | "morning" | "afternoon" | "evening";

export interface WaitlistEntry {
  id: string;
  clientId: string;
  serviceId: string;
  addOnIds?: string[];
  /** A staff id or "any". */
  staffId: string;
  date: ISODate;
  part: DayPart;
  status: "waiting" | "booked" | "removed";
  bookingId?: string;
  /** When the client was last told a time opened up, so they aren't messaged twice for the same day. */
  notifiedAt?: string;
  createdAt: string;
}

export type MessageKind = "confirmation" | "rescheduled" | "cancelled" | "waitlist-joined" | "slot-open" | "series";

/** A message the salon would send. In the demo they are only listed in the outbox. */
export interface Message {
  id: string;
  at: string;
  channel: "email" | "sms";
  kind: MessageKind;
  clientId: string;
  bookingId?: string;
  subject: string;
  body: string;
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
  waitlist: WaitlistEntry[];
  outbox: Message[];
}

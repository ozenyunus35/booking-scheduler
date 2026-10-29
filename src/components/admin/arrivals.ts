/** Bookings that just arrived from another tab, highlighted on the calendar for a few seconds. */
const arrived = new Map<string, number>();

export function markArrived(id: string) {
  arrived.set(id, Date.now());
}

export const isFresh = (id: string) => Date.now() - (arrived.get(id) ?? 0) < 6000;

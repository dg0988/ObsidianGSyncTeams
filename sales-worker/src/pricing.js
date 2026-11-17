/**
 * GSync Teams pricing: one-time, per business, by number of users.
 * 3 users = $49 and 30 users = $400; the per-user price falls evenly in between.
 * Each user may use GSync Teams on DEVICES_PER_USER devices.
 */
export const MIN_USERS = 3;
export const MAX_USERS = 30;
export const DEVICES_PER_USER = 2;

const PER_USER_AT_MIN = 49 / 3; // $16.33
const PER_USER_AT_MAX = 400 / 30; // $13.33

/** Whole-dollar price for `users` users, or null if out of range. */
export function priceFor(users) {
	const n = Number(users);
	if (!Number.isInteger(n) || n < MIN_USERS || n > MAX_USERS) return null;
	const perUser = PER_USER_AT_MIN - ((n - MIN_USERS) * (PER_USER_AT_MIN - PER_USER_AT_MAX)) / (MAX_USERS - MIN_USERS);
	return Math.round(n * perUser);
}

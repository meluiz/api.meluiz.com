// ISO 8601 as accepted by search engines: a date, optionally followed by a time
// and a timezone. Date.parse is not used because it also accepts "March 5, 2024".
const ISO_8601 =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/;

/* ///////////////////////////////////////////////// */

export const isIso8601 = (value: unknown) => {
  return typeof value === 'string' && ISO_8601.test(value.trim());
};

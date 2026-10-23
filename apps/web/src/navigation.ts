export const readRoute = () =>
  window.location.hash.replace(/^#\/?/, '') || 'overview';
export const go = (route: string) => {
  window.location.hash = `/${route}`;
};
export const message = (reason: unknown) =>
  reason instanceof Error
    ? reason.message
    : 'Something went wrong. Please try again.';
export function decodeRoutePart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

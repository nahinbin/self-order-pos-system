/** Single restaurant: always use id 1. */
export function getRestaurantIdFromRequest(_request: Request): number {
  return 1;
}

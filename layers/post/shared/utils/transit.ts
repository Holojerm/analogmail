// How many postal days a letter takes, from the distance between the two
// people's cities. Fixed: the same pair always gets the same transit, so the
// promised date is predictable. The floor is two days; nothing arrives the
// day after it is posted.

export interface Place {
  lat: number
  lng: number
  /** ISO 3166-1 alpha-2. */
  country: string
}

const EARTH_RADIUS_KM = 6371

export function distanceKm(from: Place, to: Place): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = radians(to.lat - from.lat)
  const dLng = radians(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function transitDaysForDistance(km: number, sameCountry: boolean): number {
  if (km < 100) return 2
  if (sameCountry) return km <= 1000 ? 3 : 4
  if (km < 2500) return 5
  return km <= 8000 ? 7 : 9
}

export function transitDays(from: Place, to: Place): number {
  return transitDaysForDistance(distanceKm(from, to), from.country === to.country)
}

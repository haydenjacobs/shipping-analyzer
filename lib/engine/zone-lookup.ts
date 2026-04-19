export type ZoneLookupResult =
  | { ok: true; zone: number }
  | { ok: false; error: string }

/**
 * Looks up the zone for a destination ZIP3 using a pre-built Map.
 * The Map is keyed by destZip3 and maps to zone number.
 */
export function lookupZone(
  destZip3: string,
  zoneMaps: Map<string, number>
): ZoneLookupResult {
  const zone = zoneMaps.get(destZip3)
  if (zone === undefined) {
    return { ok: false, error: `Zone not found for dest ZIP3 ${destZip3}` }
  }
  return { ok: true, zone }
}

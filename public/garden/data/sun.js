// Solar position (simplified NOAA / suncalc formulas). Astronomy, not sensor data.
const RAD = Math.PI / 180;
const E = RAD * 23.4397; // obliquity of the Earth

/** Returns { altitude, azimuth } in radians. Azimuth: 0 = south, positive towards west. */
export function sunPosition(timeMs, lat, lon) {
  const d = timeMs / 86400000 - 0.5 + 2440588 - 2451545; // days since J2000
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(E) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(E), Math.cos(L));
  const phi = RAD * lat;
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - ra;
  return {
    altitude: Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)),
    azimuth: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)),
  };
}

/** Unit vector towards the sun in world space (X east, Y up, Z south). */
export function sunDirection(pos, out) {
  const c = Math.cos(pos.altitude);
  return out.set(-Math.sin(pos.azimuth) * c, Math.sin(pos.altitude), Math.cos(pos.azimuth) * c);
}

/* Pure geometry and explicit educational fallback model. Not a JPL ephemeris. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LunarAstro = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const mod = (a, n) => ((a % n) + n) % n;

  function directionFromSubpoint(lat, lon, subLat, subLon) {
    const phi = lat * RAD;
    const delta = subLat * RAD;
    const dlon = (subLon - lon) * RAD;
    const east = Math.cos(delta) * Math.sin(dlon);
    const north = Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(dlon);
    const up = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(dlon);
    return { az: mod(Math.atan2(east, north) * DEG, 360), el: Math.asin(clamp(up, -1, 1)) * DEG };
  }

  // Educational periodic subsolar/sublunar approximation, intentionally not calibrated
  // to actual 2026 ephemerides. All UI readouts MUST label this mode "Modell / Demo".
  function simulatedAt(site, date) {
    const days = (date.getTime() - Date.UTC(2026, 10, 14)) / DAY;
    const sunLon = mod(-26 - (360 / 29.530588) * days + 180, 360) - 180;
    const sunLat = 1.54 * Math.sin(2 * Math.PI * days / 27.3217 - 0.8);
    const earthLon = 6.3 * Math.sin(2 * Math.PI * days / 27.55455 + 0.3);
    const earthLat = 6.5 * Math.sin(2 * Math.PI * days / 27.21222 - 1.1);
    return {
      sun: directionFromSubpoint(site.lat, site.lon, sunLat, sunLon),
      earth: directionFromSubpoint(site.lat, site.lon, earthLat, earthLon)
    };
  }

  function hourlyTimes(dateIso, hours) {
    const start = new Date(dateIso);
    if (!Number.isFinite(start.getTime())) throw new Error('Ungültige Startzeit');
    return Array.from({ length: hours + 1 }, (_, i) => new Date(start.getTime() + i * HOUR));
  }

  function lookupHorizons(ephemeris, siteId, date) {
    const record = ephemeris && ephemeris.sites && ephemeris.sites[siteId];
    if (!record) return null;
    const value = {};
    for (const body of ['sun', 'earth']) {
      if (!Array.isArray(record[body])) return null;
      const stamp = date.getTime();
      let nearest = null, best = Infinity;
      for (const x of record[body]) {
        const difference = Math.abs(new Date(x.time).getTime() - stamp);
        if (difference < best) { best = difference; nearest = x; }
      }
      const precision = Number(ephemeris.step_hours || 1) * HOUR;
      if (best > precision * 0.1 || !nearest || !Number.isFinite(nearest.az) || !Number.isFinite(nearest.el)) return null;
      value[body] = { az: nearest.az, el: nearest.el };
    }
    return value;
  }

  function analyze(site, times, ephemeris) {
    const series = times.map(time => ({
      time,
      data: ephemeris ? lookupHorizons(ephemeris, site.id, time) : simulatedAt(site, time)
    }));
    // One sample per hour; each sample represents the NEXT hour for a transparent
    // discrete coverage estimate, not a continuous visibility solution.
    const intervals = series.slice(0, -1);
    const complete = intervals.length > 0 && intervals.every(p => p.data !== null) && series[series.length - 1].data !== null;
    const tally = (fn) => complete ? intervals.filter(p => fn(p.data)).length : null;
    const sunny = tally(p => p.sun.el > 0);
    const contact = tally(p => p.earth.el > 0);
    const both = tally(p => p.sun.el > 0 && p.earth.el > 0);
    return { site, series, complete, sunny, contact, both, total: intervals.length,
      windows: complete ? visibleWindows(series, x => x.data.earth.el > 0) : [] };
  }

  function visibleWindows(series, visible) {
    let open = null;
    const spans = [];
    for (let i = 0; i < series.length - 1; i++) {
      const ok = visible(series[i]);
      if (ok && open === null) open = series[i].time;
      if (!ok && open !== null) { spans.push([open, series[i].time]); open = null; }
    }
    if (open !== null) spans.push([open, series[series.length - 1].time]);
    return spans;
  }

  function validateEphemeris(doc) {
    if (!doc || typeof doc !== 'object' || doc.source !== 'NASA/JPL Horizons' || !doc.sites || typeof doc.sites !== 'object') throw new Error('Ungültige Horizons-Datei (Quelle/Struktur).');
    if (!(Number(doc.step_hours) > 0 && Number(doc.step_hours) <= 24)) throw new Error('Ungültiges Stundenintervall.');
    let count = 0;
    for (const site of Object.values(doc.sites)) {
      for (const name of ['sun', 'earth']) {
        if (!Array.isArray(site[name]) || site[name].length < 2) throw new Error('Horizons-Reihen unvollständig.');
        let previous = -Infinity;
        for (const v of site[name]) {
          const stamp = new Date(v.time).getTime();
          if (!Number.isFinite(stamp) || stamp <= previous || !Number.isFinite(v.az) || !Number.isFinite(v.el) || v.az < 0 || v.az >= 360 || v.el < -90 || v.el > 90) throw new Error('Ungültige Werte oder Sortierung in Horizons-Reihe.');
          previous = stamp;
          count++;
        }
      }
    }
    if (!count) throw new Error('Keine Horizontwerte gefunden.');
    return doc;
  }

  return { HOUR, directionFromSubpoint, simulatedAt, hourlyTimes, lookupHorizons, analyze, visibleWindows, validateEphemeris };
});

#!/usr/bin/env python3
"""Fetch real NASA/JPL Horizons topocentric (airless) Sun/Earth azimuth/elevation.

Python 3.9+, stdlib only. Network access needed. No interpolation is made.
Data will be written to data/horizons.json only after EVERY request succeeds.

Usage:
  python tools/fetch_horizons.py --start 2026-11-14 --days 7 --step-hours 1

All times in UTC. Geographic longitude east-positive in degrees; altitude 0 km
above the reference ellipsoid. Geometric horizon only; no terrain masking.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://ssd.jpl.nasa.gov/api/horizons.api"
UTC = dt.timezone.utc


def parse_horizons_text(text: str):
    """Parse a Horizons CSV observer table restricted to quantity #4 (Az, El)."""
    match = re.search(r"\$\$SOE\s*(.*?)\s*\$\$EOE", text, re.S)
    if not match:
        raise ValueError("JPL-Antwort ohne $$SOE/$$EOE. " + text[:350].replace("\n", " "))
    samples = []
    for row in csv.reader(match.group(1).splitlines()):
        if not row or not row[0].strip():
            continue
        raw_date = row[0].strip().replace("A.D. ", "")
        try:
            stamp = dt.datetime.strptime(raw_date, "%Y-%b-%d %H:%M").replace(tzinfo=UTC)
        except ValueError as e:
            raise ValueError(f"Unbekanntes Datumsformat in JPL-Antwort: {raw_date}") from e
        # With QUANTITIES='4' and CSV_FORMAT='YES', the trailing two numerical
        # columns are azimuth and elevation; solar/interfering-body flags can
        # precede them. Extra output quantities are deliberately not requested.
        numbers = []
        for field in row[1:]:
            field = field.strip()
            try:
                val = float(field)
                if val == val and abs(val) != float("inf"):
                    numbers.append(val)
            except ValueError:
                continue
        if len(numbers) != 2:
            raise ValueError(f"JPL-Zeile enthält nicht exakt Az und El: {row!r}")
        az, el = numbers
        if not (0 <= az < 360 and -90 <= el <= 90):
            raise ValueError(f"Ungültiger JPL-Winkel: {az}, {el}")
        samples.append({"time": stamp.isoformat().replace("+00:00", "Z"), "az": round(az, 6), "el": round(el, 6)})
    if len(samples) < 2:
        raise ValueError("Nicht genug Zeitwerte aus JPL Horizons.")
    if any(samples[i]["time"] >= samples[i + 1]["time"] for i in range(len(samples) - 1)):
        raise ValueError("JPL-Zeitstempel nicht strikt aufsteigend.")
    return samples


def query_horizons(body: str, lat: float, lon: float, start: dt.datetime, end: dt.datetime, step_hours: int, timeout: int):
    params = {
        "format": "json",
        "COMMAND": "'10'" if body == "sun" else "'399'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon:.6f},{lat:.6f},0'",
        "START_TIME": f"'{start.strftime('%Y-%m-%d %H:%M')}'",
        "STOP_TIME": f"'{end.strftime('%Y-%m-%d %H:%M')}'",
        "STEP_SIZE": f"'{step_hours} h'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
        "CAL_FORMAT": "'CAL'",
        "TIME_DIGITS": "'MINUTES'",
        "TIME_TYPE": "'UT'",
        "APPARENT": "'AIRLESS'",
        "ANG_FORMAT": "'DEG'",
        "SKIP_DAYLT": "'NO'",
        "ELEV_CUT": "'-90'",
    }
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": "Lunar-Mission-Browser/3.0 (educational prototype)"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        payload = json.load(response)
    if "error" in payload:
        raise RuntimeError(f"JPL API Fehler: {payload['error']}")
    return parse_horizons_text(payload.get("result", ""))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2026-11-14", help="Startdatum UTC: YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=7, help="Zeitraum in Tagen (1 bis 14)")
    parser.add_argument("--step-hours", type=int, default=1, help="Abtastintervall in Stunden (Webapp benötigt 1)")
    parser.add_argument("--timeout", type=int, default=45, help="Netzwerk-Timeout pro Anfrage in Sekunden")
    args = parser.parse_args(argv)
    if not 1 <= args.days <= 14 or args.step_hours != 1:
        parser.error("Ungültige Tage oder Schrittweite: Die Webapp benötigt 1-Stunden-Daten")
    if 24 * args.days % args.step_hours:
        parser.error("Schrittweite muss den Zeitraum exakt teilen")
    try:
        start = dt.datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError:
        parser.error("--start muss YYYY-MM-DD sein")
    stop = start + dt.timedelta(days=args.days)
    sites = json.loads((ROOT / "data" / "sites.json").read_text(encoding="utf-8"))["sites"]
    result = {
        "source": "NASA/JPL Horizons",
        "fetched_utc": dt.datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "api": API,
        "method": "Topocentric airless observer Az/El (quantity 4); zero-height lunar reference ellipsoid; local tangent horizon 0 degrees; NO terrain or mast masking",
        "start_utc": start.isoformat().replace("+00:00", "Z"),
        "stop_utc": stop.isoformat().replace("+00:00", "Z"),
        "step_hours": args.step_hours,
        "sites": {},
    }
    count = args.days * 24 // args.step_hours + 1
    for site in sites:
        sid = site["id"]
        print(f"[{sid}] Abruf von {count} Werten für Sonne und Erde ...", flush=True)
        result["sites"][sid] = {}
        for body in ("sun", "earth"):
            try:
                rows = query_horizons(body, site["lat"], site["lon"], start, stop, args.step_hours, args.timeout)
            except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
                print(f"Fehler bei {sid}/{body}: {exc}", file=sys.stderr)
                print("Kein unvollständiger Datensatz wird gespeichert.", file=sys.stderr)
                return 1
            if len(rows) != count or rows[0]["time"] != start.isoformat().replace("+00:00", "Z") or rows[-1]["time"] != stop.isoformat().replace("+00:00", "Z"):
                print(f"Fehler: JPL liefert {len(rows)} statt {count} Abtastwerte oder einen abweichenden Zeitbereich.", file=sys.stderr)
                return 1
            result["sites"][sid][body] = rows
            print(f"   {body}: {len(rows)} gültige JPL-Zeilen", flush=True)
            time.sleep(.5)
    target = ROOT / "data" / "horizons.json"
    tmp = target.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(target)
    print(f"OK: {target} ({target.stat().st_size // 1024} KiB)")
    print("Im Dashboard über JPL JSON IMPORT die Datei data/horizons.json auswählen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

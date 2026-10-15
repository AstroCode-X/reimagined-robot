# Dancing with SARS – Detailed Setup and Troubleshooting (English)

🌐 **Change language:** [Deutsch](README.de.md) | **English** · [Interactive help](guide.html) · [Start](../README.md)

> **Version:** October 15, 2026. This package preserves your original mission-control UI, the 2D and 3D Moon views, and target overlays. It adds optional genuine NASA/JPL Horizons ephemerides and a Groq-powered conversational assistant. The key is stored only as a Cloudflare Worker Secret. This is **not** a flight safety tool, independently verified lunar terrain dataset, or validated water-ice detector.

## 1. Features and scope

The interface still has the interactive 2D polar Moon, whole-Moon view, freely rotating WebGL globe, simulated SAR/PSR/hazard overlays, original five targets, local demonstrator ML score, and Mission Control layout. The added features are:

- **Groq chat:** `POST /chat` forwards user/assistant messages to `llama-3.3-70b-versatile` via a Worker. The API key is *never* included in browser code.
- **Worker diagnostics:** the “Worker / NASA / KI Status” panel checks whether your Cloudflare deployment is accessible, and whether the Groq Secret, rate-limit binding, and allowed website origin are configured.
- **NASA/JPL Horizons:** `GET /ephemeris` fetches geometrical, topocentric azimuth/elevation of the Sun and Earth at the five prototype coordinates (1-hour sample, 24/72/168 hours).
- **NASA SVS lunar texture:** `GET /texture` proxies the NASA CGI Moon Kit LRO WAC/LOLA image for visualization only; it does not provide measured local slopes or ice probability.
- **Bilingual Markdown docs:** switch between German and English using the links at the top of this document; an interactive language switch is also supplied in `guide.html`.

## 2. Why am I not seeing real NASA data?

Your original project had hard-coded example values for `ice_score`, `slope_deg`, `thermal_k`, `backscatter_db`, PSR polygons, and hazard polygons. These are not independently verified NASA measurements. An API connection cannot retroactively turn them into real measurements.

The *genuine* dataset supported by this upgrade is **JPL Horizons observer ephemerides**: your browser requests `/ephemeris` from the Worker; the Worker calls `https://ssd.jpl.nasa.gov/api/horizons.api`, validates the output, and returns a complete JSON series. The app labels that series **NASA/JPL LIVE** **only after a successful fetch**. Otherwise it displays `N/A` and an explicit error, not invented values. A separate `/texture` call fetches an authentic NASA image. If unavailable, the Moon display uses a labeled illustrative, offline image.

The five coordinates are retained from your prototype and are **not confirmed CLPS mission sites**. You can calculate correct JPL geometry *for those input coordinates* without those sites being NASA-approved landing targets.

## 3. Fix “AI currently unavailable: Load failed”

That message means that **the browser cannot obtain a usable Worker response**. It does **not** by itself prove that the Groq key is wrong.

### A. Check the Worker

Open **https://apikey.elias256.workers.dev/health** in a browser. The new package should return JSON, for example:

```json
{
  "status":"ok",
  "service":"Dancing with SARS API",
  "version":"2026.10.15-diagnostics.1",
  "groq_configured":true,
  "chat_rate_limit_configured":true,
  "data_rate_limit_configured":true,
  "origin_allowed":true
}
```

These values are **examples**, not a claim that your Worker is currently deployed. No secret values are returned.

| Finding | What it means | What to do |
| --- | --- | --- |
| `404` on `/health` | An older or different Worker is deployed | Deploy the included `cloudflare/worker.js` to Worker **`apikey`** |
| HTML, non-JSON response | Wrong Worker, path or proxy | Verify the Worker route and source code |
| `groq_configured: false` | `GROQ_API_KEY` secret not set | Add the secret to the actual deployed Worker |
| `chat_rate_limit_configured: false` | `CHAT_RATE_LIMITER` missing | Deploy using the bundled `wrangler.jsonc` |
| `origin_allowed: false` | CORS origin not in allowlist | Add your **exact origin** to `ALLOWED_ORIGINS` and redeploy |
| `HTTP 401/403` from Groq | Invalid/restricted API key | Check your Groq account and replace the secret |
| `HTTP 429` | Groq or Worker request limit | Check quota and retry later |
| `HTTP 502` from `/ephemeris` | Upstream JPL, network or parser failure | Read error response, try 24-hour window |
| Browser opened with `file://` | Local file origin is not allowed | Use `http://localhost:8000` or Cloudflare Pages |

A `404` at the base URL `/` was expected on an earlier Worker version; the **new** Worker returns its safe diagnostics at both `/` and `/health`.

### B. Deploy using Wrangler (recommended)

Install Node.js and sign into the correct Cloudflare account. **Back up your existing Worker** if it has any other purpose before overwriting it.

```bash
cd cloudflare
npm install
npx wrangler login
```

Edit `cloudflare/wrangler.jsonc` and configure `ALLOWED_ORIGINS`. Example:

```json
"ALLOWED_ORIGINS": "http://localhost:8000,http://127.0.0.1:8000,https://your-project.pages.dev"
```

Use **scheme + host + optional port only**. No path or trailing slash. Include each Pages/custom domain separately, separated by commas.

```bash
npx wrangler deploy
npx wrangler secret put GROQ_API_KEY
```

Get your key from **https://console.groq.com/keys**. Paste it **only** when Wrangler prompts for the secret. Never hard-code a key into the frontend, zip, repository, logs or documentation. The Wrangler config ships with `CHAT_RATE_LIMITER` and `DATA_RATE_LIMITER`; if you use only the Cloudflare Dashboard editor, you must configure bindings independently as well.

Revisit `/health`. Then reload the actual site and click **“VERBINDUNG PRÜFEN”** (“Check connection”) in the status panel. That browser call tests the **actual site origin** rather than a command-line client without an Origin header.

### C. Publish on Cloudflare Pages

Upload the **contents of `web/`**, not the parent folder as an extra nested directory. Configure the site's complete origin in the Worker allowlist and redeploy the Worker. For local testing, run this in the root directory:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`, not a directly opened local HTML file. On Windows, `py -m http.server 8000` may be needed.

## 4. Use genuine NASA ephemerides

For an online check, start with **24 hours** and one selected target, then press **“JPL LIVE LADEN”**. Use **“ALLE ORTE LADEN”** to fetch data for each of the five prototype sites. The Worker makes separate NASA/JPL requests for the Sun and Earth and caches successful complete results.

If you want to create and import an authentic JPL response independently of Cloudflare, run:

```bash
python tools/fetch_horizons.py --start 2026-11-14 --days 7 --step-hours 1
```

Python 3.9+ and internet connectivity are required. The exporter saves `data/horizons.json` only after it has validated the full time series for every site and both bodies. Import it using **“JPL JSON IMPORT”**. Imported JSON is *structurally validated*, but the web application cannot prove the provenance of a user-supplied file.

**Interpretation of scientific output:** Azimuth describes a horizontal direction, and elevation is the angle of the Sun's/Earth's **center** above the local geometrical tangent horizon at a zero-height reference-ellipsoid site. A positive elevation is not a reliable measure of actual sunlight or unobstructed radio line-of-sight. Nearby crater walls, boulders, antenna heights, terrain profiles, and spacecraft systems are not modeled. “Percent visible” is the fraction of **hourly sampled intervals**, not a continuous guarantee.

NASA's CGI Moon Kit is optimized for *appearance*, not quantitative scientific analyses. Its polar regions include lower-resolution LOLA albedo infill. Real science-grade landing hazard assessment would require validated LRO/LOLA elevations, local topographic horizon profiles, and a mission-specific model.

## 5. Understand the two distinct AIs

**Groq conversational assistant:** the browser sends your chat text and a small snapshot of the displayed mission values to the Cloudflare Worker. The Worker authenticates to `https://api.groq.com/openai/v1/chat/completions` using the secret and returns the model's response. Groq can hallucinate. It cannot browse or load arbitrary NASA records unless you explicitly add and validate such retrieval logic.

**Local ML score:** separately, the browser runs a small demonstrator model trained on synthetic input/labels. Its inputs include example slope and temperature, plus displayed illumination/contact coverage where available. Its 0–100 score is **not** a calibrated landing success probability. Do not equate it with actual NASA landing risk.

**Security and privacy:** browser code never receives your Groq key. Chat messages and supplied dashboard values do travel to Groq via the Worker. The Worker rate-limits request frequency and constrains input length, but CORS is *not* authentication, and the public endpoint can be called by non-browser clients. For a real public deployment consider Cloudflare Turnstile, WAF and/or login, with quota/cost monitoring.

## 6. Worker endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/` | Public diagnostic overview on the upgraded Worker |
| GET | `/health` | Safe config flags and origin check, no secret values |
| GET | `/texture` | NASA SVS LRO visual texture proxy |
| GET | `/ephemeris?site=SAR-001&start=2026-11-14T00:00&hours=24` | JSON Sun/Earth JPL Horizons observer ephemerides |
| POST | `/chat` | Groq chat completion using server-side secret |

Terminal test:

```bash
curl -i https://apikey.elias256.workers.dev/health
curl -i 'https://apikey.elias256.workers.dev/ephemeris?site=SAR-001&start=2026-11-14T00%3A00&hours=24'
```

**Important:** curl normally doesn't send an Origin header, so a healthy response from curl does not guarantee that your website is in the CORS allowlist. Test from your actual deployed site using the new diagnostic panel.

## 7. Project structure

```text
index.html, assets/               Mission Control front end, WebGL Moon, chat, diagnostics
web/                              Identical deployable Pages frontend
cloudflare/worker.js              Worker proxy with no API key hardcoded
cloudflare/wrangler.jsonc         Worker name, CORS allowlist and rate-limit bindings
cloudflare/package.json          Wrangler CLI
original/                         Your unchanged original files
data/data.json                    Original example/Demo source values
data/sites.json                   Prototype site coordinates (NOT verified CLPS sites)
tools/fetch_horizons.py           Optional verified-format JPL exporter
assets/astro.js                   Ephemeris analysis and explicitly labeled demo model
assets/chat.js                    Groq UI with improved error feedback
assets/worker-diagnostics.js      Public Worker status checks
docs/README.de.md                 Full German documentation
docs/README.en.md                 This English documentation
docs/guide.html                   Interactive German/English quick guide
```

## 8. Tests and limitations

```bash
node --test tests/worker.test.mjs
node --test tests/astro.test.js
python -m unittest discover -s tests -p 'test_horizons.py'
```

Existing tests use **mock** JPL/Groq responses. Passing them does not establish that your *actual Cloudflare account*, *API key*, or the upstream services have been tested end to end. Deploy and confirm on the site before claiming successful live retrieval.

## 9. References

- [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720)
- [NASA/JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- [JPL Horizons user manual](https://ssd.jpl.nasa.gov/horizons/manual.html)
- [Groq API reference](https://console.groq.com/docs/api-reference)
- [Groq API key management](https://console.groq.com/keys)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Worker rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

A science-ready Space Apps entry still requires verified mission coordinates, measured elevation/slope products, terrain horizon masks and defensible ice evidence. **A high circular polarization ratio (CPR) alone does not establish water ice.**

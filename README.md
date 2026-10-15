# Dancing with SARS — NASA/JPL + Groq Chat + Cloudflare Worker

**Choose your documentation language / Sprache wählen:**

- 🇩🇪 **[Deutsch – Ausführliche Installations- und Fehlerbehebungsanleitung](docs/README.de.md)**
- 🇬🇧 **[English – Full setup and troubleshooting documentation](docs/README.en.md)**
- 🌐 **[Interaktive Hilfe mit Sprachauswahl / Interactive language switch](docs/guide.html)**

Originales Mission-Control-Design, 2D-/3D-Mond, synthetische SAR-/Hazard-Karten plus optional echte NASA/JPL-Horizons-Zeitreihen, NASA-LRO-Bildtextur und eine Groq-Chat-KI. **Weder Groq-Zugang noch Live-NASA-Abruf sind vorkonfiguriert:** Du musst den Cloudflare Worker `apikey` deployen und deinen Groq-Schlüssel als Secret speichern.

**Quick setup / Schnellstart**

```bash
cd cloudflare
npm install
npx wrangler login
# Edit ALLOWED_ORIGINS in wrangler.jsonc first!
npx wrangler deploy
npx wrangler secret put GROQ_API_KEY
```

**Diagnose / Diagnostics:** https://apikey.elias256.workers.dev/health

**Website:** Den Ordner `web/` auf Cloudflare Pages veröffentlichen / publish `web/` on Cloudflare Pages. Locally use `python -m http.server 8000` and open `http://localhost:8000`, **not `file://`**.

**Research integrity:** Original ice/slope/thermal/CPR metrics, polygons and local ML score are DEMO; only successfully fetched Horizons Sun/Earth ephemerides are NASA/JPL data. NASA SVS imagery is for visual context rather than quantitative geospatial science. Full explanations in the language-specific docs.

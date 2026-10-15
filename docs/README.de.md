# Dancing with SARS – Ausführliche Anleitung (Deutsch)

🌐 **Sprache wechseln:** **Deutsch** | [English](README.en.md) · [Interaktive Web-Hilfe](guide.html) · [Zur Startseite](../README.md)

> **Stand:** 15. Oktober 2026. Dieses Projekt bewahrt das ursprünglich gelieferte Mission-Control-Dashboard mit 2D-/3D-Mond und kombiniert es mit einer optionalen Groq-Chat-KI sowie NASA/JPL-Horizons-Daten. **Der API-Key gehört ausschließlich in das Cloudflare Worker Secret.** Keine Missionstauglichkeitsprüfung und keine verifizierte Wassereiskarte.

## 1. Was ist neu?

Die alte Oberfläche ist erhalten: links SAR-Schichtwahl, drehbarer WebGL-Mond, lokaler KI-Mission-Analyst, Zielmesswerte und Zeitreihen; rechts eine große 2D-Südpolkarte, ganze Mondkarte und 3D-Mondansicht. Neu sind:

- Groq-Chat zur Beantwortung von Missionsfragen (`POST /chat`). Die Antwort kommt vom echten Groq-Modell, sobald Worker, API-Key, Origin und Rate-Limit-Binding korrekt konfiguriert sind.
- Ein eigenständiger **„Worker / NASA / KI Status“** mit Diagnose für die Ursachen von `Load failed` und einem Link zum öffentlichen `/health`.
- NASA/JPL-Horizons-Ephemeriden (`GET /ephemeris`) für den **topozentrischen geometrischen Sonnen- und Erdwinkel** an den gespeicherten Orten. `QUANTITIES=4`, 1-Stunden-Raster; 24/72/168 Stunden.
- NASA LRO WAC/LOLA-Farbmosaik vom NASA-SVS-CGI-Moon-Kit (`GET /texture`) – **Illustration mit echtem Bildmaterial**, keine SAR- oder DEM-Messkarte.
- Ausführliche Markdown-Dokumentation in zwei Sprachen, mit anklickbarer Sprachauswahl, plus Browser-Hilfeseite.

## 2. Warum zeigt die App keine echten NASA-Daten?

Die Online-Daten sind **nicht fest als echte Messdaten in die ursprüngliche Website eingebettet**. Sie werden erst bei erreichbarem Cloudflare-Worker nachgeladen:

1. Browser fragt bei `https://apikey.elias256.workers.dev/ephemeris` an.
2. Der Worker fragt die offizielle JPL-Horizons-API nach Sonnen- und Erdazimut/-elevation ab.
3. Der Worker validiert die Antwort und sendet JSON zum Dashboard.
4. Das Dashboard zeigt **NASA/JPL LIVE** an, wenn die Reihe vollständig und validiert angekommen ist. Ohne gültige Daten stehen `N/A` und ein Fehlerhinweis – **keine ausgedachten NASA-Werte**.

Die Bildtextur benötigt einen separaten Worker-Aufruf zu `/texture`, der das NASA-SVS-Mosaik abruft und zwischenspeichert. Ohne diesen Aufruf siehst du die illustrative Offline-Mondtextur. Ein NASA-Bild ist außerdem keine Karte mit echten lokalen Landeneigungen oder nachgewiesenen Eisvorkommen.

**Was weiterhin Demo ist:** In den ursprünglich hochgeladenen Dateien sind `ice_score`, `illumination_pct`, `slope_deg`, `thermal_k`, `backscatter_db`, alle PSR-/Gefahrenpolygone sowie der lokale ML-Score aus festen beziehungsweise synthetischen Werten aufgebaut. Das bleibt sichtbar gekennzeichnet. Keine dieser Angaben wurde allein durch den API-Anschluss zu einer NASA-Messung. Auch die Koordinaten der fünf Orte stammen aus dem Prototyp und sind **keine bestätigten CLPS-Landepunkte**.

## 3. Fehler „KI derzeit nicht erreichbar: Load failed“ beheben

`Load failed` ist meistens eine **Netzwerk- oder CORS-Störung**. Es ist keine eindeutige Aussage über einen falschen Groq-Key.

### Schritt A: Worker-Status öffnen

Öffne direkt **https://apikey.elias256.workers.dev/health**. Der neu beigefügte Worker antwortet mit JSON, ungefähr so:

```json
{
  "status": "ok",
  "service": "Dancing with SARS API",
  "version": "2026.10.15-diagnostics.1",
  "groq_configured": true,
  "chat_rate_limit_configured": true,
  "data_rate_limit_configured": true,
  "origin_allowed": true,
  "browser_origin": "https://deine-seite.pages.dev"
}
```

Die Felder sind **Beispiele**, nicht das Ergebnis einer Liveprüfung deines Cloudflare-Kontos. Das `/health` gibt **niemals den API-Key-Wert** aus.

- **404 / HTML statt JSON**: Unter der Adresse läuft nicht der neue `worker.js` oder ein anderes Routing. `cloudflare/worker.js` deployen und Workername `apikey` prüfen. Ein `404` nur unter `/` konnte beim alten Worker normal sein; beim **neuen** Worker beantwortet auch `/` eine Diagnose.
- **Worker nicht erreichbar / DNS / Timeout**: URL, Cloudflare-Status und Netzverbindung überprüfen; die Browser-Konsole (F12 → Network) ansehen.
- **`groq_configured: false`**: Secret `GROQ_API_KEY` fehlt im tatsächlich deployten Worker.
- **`chat_rate_limit_configured: false`**: `CHAT_RATE_LIMITER` ist nicht gebunden. Der Chat wird absichtlich deaktiviert, bis die Begrenzung existiert.
- **`origin_allowed: false`**: Exakte Website-Origin (Schema + Domain + gegebenenfalls Port) in `ALLOWED_ORIGINS` aufnehmen. Beim lokalen Start z. B. `http://localhost:8000`; bei Pages z. B. `https://meinprojekt.pages.dev`. **Keine Slash- oder Unterpfadangaben.**
- **Groq HTTP 401/403**: ungültiges/gesperrtes Secret oder Kontorechte; neuen Key im Cloudflare-Secret hinterlegen.
- **Groq HTTP 429**: Quota bzw. Rate Limit; später erneut versuchen. Die Limits können bei Groq *und* Cloudflare greifen.
- **JPL HTTP 502**: Die nachgelagerte Horizons-API oder das JPL-Datenformat schlug fehl. Die App zeigt dann bewusst keine Livewerte an.
- **Direkt `file:///.../index.html` geöffnet**: Die Browser-Origin ist `null` beziehungsweise nicht freigegeben. Website über localhost oder Pages starten.

### Schritt B: Worker im Cloudflare-Dashboard aktualisieren

Du kannst den Code manuell in **Workers & Pages → Workers → `apikey` → Edit code** einfügen. Dann musst du **separat** Secret, CORS-Variable und Rate-Limit-Bindings einrichten. Einfach nur den JavaScript-Text einzufügen reicht nicht. Weil die Konfiguration mit Bindings fehleranfällig ist, ist Wrangler im Terminal empfehlenswert.

### Schritt C: Mit Wrangler deployen

Voraussetzungen: Node.js und Zugriff auf dein Cloudflare-Konto. Vergewissere dich vorher, dass du den richtigen Worker aktualisierst; sichere andere Funktionen, falls der Worker bereits etwas anderes macht.

```bash
cd cloudflare
npm install
npx wrangler login
```

In `wrangler.jsonc` **`ALLOWED_ORIGINS` ändern**, zum Beispiel:

```json
"ALLOWED_ORIGINS": "http://localhost:8000,http://127.0.0.1:8000,https://dein-projekt.pages.dev"
```

Danach:

```bash
npx wrangler deploy
npx wrangler secret put GROQ_API_KEY
```

Beim Secret-Befehl gibst du deinen persönlichen Schlüssel von **https://console.groq.com/keys** ein. **Nie** in HTML, Chat, `wrangler.jsonc`, GitHub oder die ZIP schreiben. Falls Secret schon existiert und mit einem anderen Worker geteilt werden soll, bitte vorab Cloudflare-Konfiguration prüfen.

Kontrolliere anschließend die JSON-Antwort unter `/health`, lade deine Seite neu (ggf. Strg+F5) und klicke **„VERBINDUNG PRÜFEN“**. Wenn die Werte bereit sind, teste zuerst eine kurze Chatfrage.

### Schritt D: Cloudflare Pages richtig veröffentlichen

Die Website liegt im Ordner **`web/`**. Lade den **Inhalt** dieses Ordners als statische Pages-Site hoch. Stelle sicher, dass dein Projekt unter HTTPS erreichbar ist und **genau dessen Origin** im Worker freigeschaltet ist. Unter mehreren Domains müssen alle erlaubten Origins eingetragen werden (z. B. Pages-Subdomain und eigene Domain). Danach Worker erneut deployen.

Für eine lokale Vorschau: **im Hauptordner**

```bash
python -m http.server 8000
```

Danach `http://localhost:8000` öffnen. Unter Windows kann auch `py -m http.server 8000` verwendet werden.

## 4. Echte NASA-Daten laden

**Online:** Stelle im Browser zunächst sicher, dass der Worker in der Statusanzeige erreichbar ist. Wähle Datum, Zeitraum und Landepunkt; drücke **„JPL LIVE LADEN“**. Zum Vergleich aller fünf Orte **„ALLE ORTE LADEN“**. Je nach NASA-Last können einzelne Anfragen scheitern. Stelle den Zeitraum zum Test erst auf **24 Stunden**, nicht auf 7 Tage.

**Offline-Import aus offiziellen JPL-Abrufen:** Bei installierter Python-Umgebung (Python 3.9+) und Internet kannst du echte Ephemeriden ohne Worker separat erstellen:

```bash
python tools/fetch_horizons.py --start 2026-11-14 --days 7 --step-hours 1
```

Das Skript fragt JPL für fünf Prototyp-Koordinaten und Sonne/Erde ab. Erst wenn **alle** Anfragen vollständig sind, wird `data/horizons.json` geschrieben. Diese Datei kannst du im Dashboard über **„JPL JSON IMPORT“** auswählen. Alternativ die Datei bei Cloudflare Pages unter `web/data/horizons.json` hochladen und im Browser importieren. Der Browser prüft das Format, kann die externe Herkunft einer beliebigen importierten JSON-Datei aber **nicht kryptografisch bestätigen**.

### Exakte Aussagekraft der angezeigten NASA/JPL-Zahlen

- **Azimut:** Richtung entlang des idealisierten lokalen Horizonts in Grad.
- **Elevation:** Winkel des Sonnen- bzw. Erdmittelpunkts über/unter dem geometrischen Tangentialhorizont.
- **Sichtbarkeitsanteil:** Prozentsatz der **abgetasteten Stunden**, in denen die Elevation über 0° liegt. Kein kontinuierlicher Nachweis.
- **Fehlende Informationen:** umliegende Berge/Kraterränder, tatsächliche Lichtstärke, Sonnenenergieanlage, Antenne, Hindernisse, Funkstrecke und Eisnachweis.

NASA/JPL-Daten bedeuten also hier nicht, dass das Dashboard bereits eine sichere Landestelle berechnet.

## 5. Was ist die „KI“?

Es sind **zwei verschiedene Funktionen**:

**A. Groq-Chat (externe generative KI).** Dein Browser übermittelt deine Nachrichten und einen gekürzten Dashboard-Kontext an den Worker. Der Worker nutzt das Secret, fragt `https://api.groq.com/openai/v1/chat/completions` an und liefert die Antwort zurück. Das Modell heißt `llama-3.3-70b-versatile` (sofern zum Nutzungszeitpunkt in deinem Groq-Konto verfügbar). Die Antworten können Fehler enthalten, und die KI durchsucht nicht selbstständig NASA-Datenbanken.

**B. Lokaler ML-Score.** Dieses synthetisch trainierte Modell verwendet unter anderem Demo-Hangneigung und Demo-Temperatur. Sein Prozentwert ist **keine** echte Wahrscheinlichkeit einer sicheren Mondlandung. Groq-Chat und lokaler ML-Score dürfen nicht verwechselt werden.

**Privatsphäre:** Chattexte und dargestellter Missionskontext werden an Groq weitergeleitet. Kein API-Key im Chat. Externe Zugriffe auf einen öffentlichen Worker können Nutzungskosten auslösen; deshalb sind Limits eingebaut. CORS ist keine Authentifizierung: Für eine öffentliche App sind zusätzlich Turnstile, WAF oder Login sinnvoll.

## 6. API-Referenz

| Methode | Route | Erklärung |
| --- | --- | --- |
| GET | `https://apikey.elias256.workers.dev/` | Neuer öffentlicher Status, statt 404 auf der Startseite |
| GET | `/health` | Version, Origin-Freigabe und boolesche Konfigurationsfelder; keine Secrets |
| GET | `/ephemeris?site=SAR-001&start=2026-11-14T00:00&hours=24` | JPL-Observer-Zeitreihe `sun`/`earth` für die Originalkoordinaten |
| GET | `/texture` | NASA-SVS-LRO-Bildproxy (JPEG, Cache) |
| POST | `/chat` | Groq-Chat mit Nachrichtengeschichte und kontextabhängigem Prompt |

Test von einem Terminal:

```bash
curl -i https://apikey.elias256.workers.dev/health
curl -i 'https://apikey.elias256.workers.dev/ephemeris?site=SAR-001&start=2026-11-14T00%3A00&hours=24'
```

Die zweite URL prüft NASA nur dann erfolgreich, wenn der Worker deployed und JPL erreichbar ist. **Achtung:** Ein URL-Aufruf von außerhalb des Browsers sendet normalerweise keine `Origin`-Header; `origin_allowed` kann dann `true` sein, auch wenn deine Website-Origin in `ALLOWED_ORIGINS` fehlt. Die Statusanzeige **innerhalb der Website** ist der zuverlässigere CORS-Test.

## 7. Projektstruktur

```text
index.html, assets/               Hauptansicht, Karten, Diagramme, Chat, Diagnostik
web/                              Cloudflare-Pages-Veröffentlichung (gleicher Frontend-Code)
cloudflare/worker.js              Servercode ohne API-Key
cloudflare/wrangler.jsonc         Name apikey, Origins, Rate-Limits
cloudflare/package.json          Wrangler-Entwicklerwerkzeuge
data/sites.json                   Prototyp-Standortkoordinaten (unverifiziert)
data/data.json                    ursprüngliche DEMO-Zielwerte und Polygone
tools/fetch_horizons.py           optionaler echter JPL-Datenexport
assets/worker-diagnostics.js      öffentliches Statusprüfmodul
assets/chat.js                    Frontend-Chat (ohne API-Key)
assets/astro.js                   Zeitreihen/DEMO-Näherung mit klarer Kennzeichnung
original/                         unveränderte Originaldateien
docs/README.de.md                 diese ausführliche deutschsprachige Anleitung
docs/README.en.md                 ausführliche englische Anleitung
docs/guide.html                   interaktive DE/EN-Kurzanleitung
```

## 8. Tests und Grenzen

```bash
node --test tests/worker.test.mjs
node --test tests/astro.test.js
python -m unittest discover -s tests -p 'test_horizons.py'
```

Die vorhandenen Tests benutzen simulierte JPL-/Groq-Antworten (Mocks). **Ein erfolgreicher Mock-Test beweist nicht, dass dein Cloudflare-Account oder der externe Live-Service bereits funktioniert.** Ein Live-End-to-End-Test erfordert, dass du den Worker in deinem Konto deployt, das Secret hinterlegt und deine öffentliche Webseite konfiguriert hast. 

## 9. Originalquellen und weitere Forschung

- [NASA SVS CGI Moon Kit – LRO-Farbmosaik](https://svs.gsfc.nasa.gov/4720) (für Visualisierung optimiert; Polarflächen zum Teil aus LOLA-Albedo)
- [JPL Horizons REST API](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- [JPL Horizons Handbuch](https://ssd.jpl.nasa.gov/horizons/manual.html)
- [Groq Chat API](https://console.groq.com/docs/api-reference)
- [Groq Schlüsselverwaltung](https://console.groq.com/keys)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Rate-Limiting-Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

Für einen wissenschaftlich robusten NASA-Space-Apps-Beitrag brauchst du zusätzlich validierte Mond-Koordinaten, echte DEM/Hangdaten, zeitabhängige lokale Geländehorizonte und eine methodisch belastbare Eis-Auswertung. **CPR größer als 1 beweist allein kein Wassereis.**

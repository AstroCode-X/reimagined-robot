# Dancing with SARS — Lunar SAR & CLPS Landing Control Dashboard

**NASA Space Apps Challenge 2026**  
**Team:** `00000000A_LAGRANGE_NEXUS`  
**Challenge Target:** Commercial Lunar Payload Services (CLPS) Site Selection & Water Ice Detection

---

## 🛰️ Mission & Problem Statement

Commercial Lunar Payload Services (**CLPS**) missions sending landers and rovers to the Lunar South Pole face critical operational hazards:

1. **Pitch Black Environments:** Permanently Shadowed Regions (PSRs) hide volatile water ice deposits but render optical cameras useless.
2. **Landing Hazards:** Extreme slopes and boulder fields risk tipping over commercial landers upon touchdown.
3. **Power & Thermal Limits:** Solar-powered landers must remain near high-illumination ridges while sending rovers into cold traps.

---

## 💡 Our Solution
**Dancing with SARS** merges **Synthetic Aperture Radar (SAR)** backscatter metrics with **CLPS landing criteria** (Solar Illumination, Slope Hazards, and Thermal Bounds) into a real-time interactive Lunar Control Room.

---

## 🚀 Key Features

- **2D Surface SAR & CLPS Map (Leaflet):** Interactive target markers evaluating Ice Score, Slope Hazards, and Solar Illumination %.
- **3D Interactive Lunar Viewport (Three.js):** 3D orbital Moon visualization with atmospheric glow effects.
- **CLPS Telemetry Teleprompter:** Dynamic metrics output displaying site suitability ratings for commercial landers.
- **Python Pre-computation Pipeline:** `generate_data.py` processes raw lunar target parameters into structured JSON (`data.json`).

---

## 💻 Local Quickstart

1. Clone or download this repository.
2. Generate the dataset:
   ```bash
   python3 generate_data.py
   ```
3. Open `index.html` in your web browser or deploy directly to **Cloudflare Pages / GitHub Pages**.

---

## 👥 Team & Credits
- **UI & Telemetry Integration:** Team Lead
- **3D Modeling & Viewport Sync:** Deshan
- **Event:** NASA Space Apps Challenge 2026

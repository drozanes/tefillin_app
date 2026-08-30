# Tefillin Mirror | מראת תפילין 🪞✨

**Tefillin Mirror** is a real-time AI & Computer Vision web application designed to help Jewish users align their Head Tefillin (*Shel Rosh* / קציצה של ראש) with Halachic precision.

---

## 📜 Halachic Rules Verified

1. **Horizontal Alignment (אמצע ברוחב):**
   - The Shel Rosh box must sit **exactly in the middle** between the eyes (along the facial symmetry axis).
2. **Vertical Alignment (מקום גידול שיער בגובה):**
   - The entire box (*Ketzitzah*) and loop (*Ma'avarta*) must rest **strictly on the scalp where hair grows (or used to grow)**.
   - If even a fraction of the lower edge touches or slips down onto the smooth forehead skin, the mitzvah is not fulfilled.

---

## ✨ Features & Architecture

- **Shared Computer Vision Engine (`tefillin_engine.js`):** Unified algorithm for 3D face geometry analysis, connected-component dark blob segmentation, glare bridging, and Halachic classification.
- **Real-Time 3D Face Tracking:** Powered by MediaPipe Face Mesh, invariant to head pitch, tilt, and rotations.
- **Precision Lowest-Edge Tracking:** Detects the exact bottom-most edge of the Tefillin box to enforce zero-tolerance forehead overlap.
- **Interactive Hairline Calibration:** On-screen fine-tuning controls (`▲`, `▼`, `↺`) saved locally in `localStorage` to match any individual's personal hairline.
- **Bilingual Interface:** Full support for Hebrew (RTL) and English.
- **Mirror Mode & Visual Guides:** Dynamic central symmetry line and hairline boundary indicators.
- **Developer Test Studio (`test.html`):** Offline-ready static photo tester with real-time threshold tuning and automated bulk benchmarking.

---

## 🚀 Getting Started

Simply open `index.html` in any modern web browser with webcam access:

```bash
# Optional: run with a local HTTP server
python -m http.server 8000
```
Then visit `http://localhost:8000` (or open `index.html` directly).

---

## 📁 Repository Structure

```
tefillin_app/
├── index.html            # Main production web camera app (Tefillin Mirror)
├── script.js             # Production UI controller, camera feed & metric gauges
├── style.css             # Responsive dark glassmorphism styling
├── tefillin_engine.js    # Core standalone CV & Halachic alignment algorithm module
├── test.html             # Developer test studio, photo inspector & bulk benchmark suite
├── generate_samples.ps1  # Helper script to compile local sample images into Base64 for offline test.html
├── .gitignore            # Git ignore rules (keeps private sample datasets local)
└── README.md             # Project overview & documentation
```

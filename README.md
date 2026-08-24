# Tefillin Aligner | מכוון תפילין כהלכה 🔳✨

A real-time AI & Computer Vision web application designed to help Jewish users align their Head Tefillin (*Shel Rosh* / קציצה של ראש) with Halachic precision.

---

## 📜 Halachic Rules Verified

1. **Horizontal Alignment (אמצע ברוחב):**
   - The Shel Rosh box must sit **exactly in the middle** between the eyes (along the facial symmetry axis).
2. **Vertical Alignment (מקום גידול שיער בגובה):**
   - The entire box (*Ketzitzah*) and loop (*Ma'avarta*) must rest **strictly on the scalp where hair grows (or used to grow)**.
   - If even a fraction of the lower edge touches or slips down onto the smooth forehead skin, the mitzvah is not fulfilled.

---

## ✨ Features & Architecture

- **Real-Time 3D Face Tracking:** Powered by MediaPipe Face Mesh (468 landmarks), invariant to head tilt and rotations.
- **Connected-Component Blob Analysis:** Segments and isolates the solid black *Ketzitzah* cube from hair strands, colored test blocks, side straps (*Retzuot*), and glasses frames.
- **Precision Lowest-Edge Tracking:** Detects the exact bottom-most edge of the Tefillin box to enforce zero-tolerance forehead overlap.
- **Interactive Hairline Calibration:** On-screen fine-tuning controls (`▲`, `▼`, `↺`) saved locally to match any individual's personal hair root boundary.
- **Bilingual Interface:** Full support for Hebrew (RTL) and English.
- **Mirror Mode & Visual Guides:** Dynamic central symmetry line and hairline boundary indicators.

---

## 🚀 Getting Started

Simply open `index.html` in any modern web browser with webcam access:

```bash
# Optional: run with a local HTTP server
python -m http.server 8000
```
Then visit `http://localhost:8000`.

---

## 📁 Project Structure

```
tefillin_app/
├── index.html       # Application UI & Video Viewport
├── style.css        # Responsive Dark Glassmorphism Styles
├── script.js        # MediaPipe Face Mesh & Computer Vision Engine
└── README.md        # Documentation
```

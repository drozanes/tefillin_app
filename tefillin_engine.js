/**
 * TefillinEngine - Shared Computer Vision & Halachic Alignment Engine
 * Used by both the live app (index.html) and the benchmark test studio (test.html).
 */

const TefillinEngine = (function () {
  'use strict';

  /**
   * 1. Extract 3D Facial Geometry & Halachic Reference Points from MediaPipe 468/478 Landmarks
   * Using Option 1: Multi-Thirds Facial Anthropometry (The Da Vinci / Farkas Canon)
   */
  /**
   * Helper: Adaptive Visual Hairline Detection
   * Samples forehead skin tone above Glabella and scans along the central facial symmetry axis (uUp)
   * to find the true physiological boundary where forehead skin ends and hair roots begin.
   * If hair is detected, snaps to the real visible hair roots.
   * If bald or low contrast, returns null so the engine falls back to the calibrated anatomical prior.
   */
  function detectVisualHairline(ctx, width, height, glabellaPt, uUp, eyeDist, pitchAngle) {
    if (!ctx) return null;
    try {
      const pitchFactor = Math.max(0.60, Math.cos(25 * Math.PI / 180 + pitchAngle) / Math.cos(25 * Math.PI / 180));
      const uCross = { x: -uUp.y, y: uUp.x };
      
      const scanStart = 0.64 * eyeDist * pitchFactor;
      const scanEnd = 0.94 * eyeDist * pitchFactor;
      const corridorHalfW = Math.round(eyeDist * 0.25);
      
      const ptBottom = { x: glabellaPt.x + uUp.x * (0.35 * eyeDist), y: glabellaPt.y + uUp.y * (0.35 * eyeDist) };
      const ptTop = { x: glabellaPt.x + uUp.x * scanEnd, y: glabellaPt.y + uUp.y * scanEnd };
      
      const minX = Math.max(0, Math.min(Math.round(Math.min(ptBottom.x, ptTop.x) - corridorHalfW), width - 1));
      const maxX = Math.max(0, Math.min(Math.round(Math.max(ptBottom.x, ptTop.x) + corridorHalfW), width - 1));
      const minY = Math.max(0, Math.min(Math.round(Math.min(ptBottom.y, ptTop.y) - 10), height - 1));
      const maxY = Math.max(0, Math.min(Math.round(Math.max(ptBottom.y, ptTop.y) + 10), height - 1));
      
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      if (cropW < 5 || cropH < 5) return null;
      
      const imgData = ctx.getImageData(minX, minY, cropW, cropH);
      const data = imgData.data;
      
      function getGray(px, py) {
        const rx = Math.round(px) - minX;
        const ry = Math.round(py) - minY;
        if (rx < 0 || rx >= cropW || ry < 0 || ry >= cropH) return -1;
        const idx = (ry * cropW + rx) * 4;
        return (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
      }
      
      // Sample baseline forehead skin tone (between 0.40 and 0.55 * eyeDist)
      let skinSum = 0, skinCount = 0;
      for (let s = 0; s < 10; s++) {
        const d = (0.40 + s * 0.015) * eyeDist;
        const pt = { x: glabellaPt.x + uUp.x * d, y: glabellaPt.y + uUp.y * d };
        const g = getGray(pt.x, pt.y);
        if (g >= 0) { skinSum += g; skinCount++; }
      }
      if (skinCount === 0) return null;
      const skinMed = skinSum / skinCount;
      
      const stepPx = Math.max(2, Math.round(eyeDist * 0.012));
      const numSteps = Math.floor((scanEnd - scanStart) / stepPx);
      
      for (let i = 0; i < numSteps; i++) {
        const d = scanStart + i * stepPx;
        const cx = glabellaPt.x + uUp.x * d;
        const cy = glabellaPt.y + uUp.y * d;
        
        const cVal = getGray(cx, cy);
        if (cVal < 0) continue;
        
        const lx = cx - uCross.x * (eyeDist * 0.15);
        const ly = cy - uCross.y * (eyeDist * 0.15);
        const rx = cx + uCross.x * (eyeDist * 0.15);
        const ry = cy + uCross.y * (eyeDist * 0.15);
        
        const lVal = getGray(lx, ly);
        const rVal = getGray(rx, ry);
        
        const isDarkCenter = (cVal < skinMed - 26) || (cVal < skinMed * 0.74);
        const isDarkLeft = lVal >= 0 && ((lVal < skinMed - 22) || (lVal < skinMed * 0.78));
        const isDarkRight = rVal >= 0 && ((rVal < skinMed - 22) || (rVal < skinMed * 0.78));
        
        // 5-point local texture std
        let sum = 0, sumSq = 0, count = 0;
        for (let dy = -2; dy <= 2; dy += 2) {
          for (let dx = -2; dx <= 2; dx += 2) {
            const v = getGray(cx + dx, cy + dy);
            if (v >= 0) { sum += v; sumSq += v * v; count++; }
          }
        }
        const mean = count > 0 ? sum / count : cVal;
        const variance = count > 0 ? (sumSq / count) - (mean * mean) : 0;
        const stdDev = Math.sqrt(Math.max(0, variance));
        
        if ((isDarkCenter && (isDarkLeft || isDarkRight)) || (stdDev > 18 && cVal < skinMed - 15)) {
          return d;
        }
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Temporal Geometry Stabilizer for live video streams (e.g. smartphone cameras).
   * Eliminates 1-2px micro-jitter via deadband thresholding and smooths deliberate
   * head movement using an adaptive low-pass filter (Exponential Moving Average).
   */
  function createGeometryStabilizer(options = {}) {
    const deadbandPx = options.deadbandPx !== undefined ? options.deadbandPx : 2.0;
    const angleDeadbandDeg = options.angleDeadbandDeg !== undefined ? options.angleDeadbandDeg : 0.6;
    const minAlpha = options.minAlpha !== undefined ? options.minAlpha : 0.18;
    const maxAlpha = options.maxAlpha !== undefined ? options.maxAlpha : 0.85;

    let prevGeometry = null;
    let prevBox = null;
    let lastVisualRatio = null;
    let missingVisualCount = 0;

    let headRelBox = null;
    let consecutiveMissCount = 0;

    function reset() {
      prevGeometry = null;
      prevBox = null;
      headRelBox = null;
      consecutiveMissCount = 0;
      lastVisualRatio = null;
      missingVisualCount = 0;
    }

    function stabilizePoint(prevPt, rawPt, deadband, scale = 1.0) {
      if (!prevPt) return { ...rawPt };
      const dx = rawPt.x - prevPt.x;
      const dy = rawPt.y - prevPt.y;
      const dist = Math.hypot(dx, dy);

      const effectiveDeadband = deadband * scale;

      // Deadband: within noise tolerance, keep strictly unchanged
      if (dist <= effectiveDeadband) {
        return { x: prevPt.x, y: prevPt.y };
      }

      // Large jump (e.g. face teleported or camera repositioned): snap immediately
      if (dist > 90 * scale) {
        return { ...rawPt };
      }

      // Adaptive alpha based on displacement beyond deadband
      const t = Math.min(1.0, (dist - effectiveDeadband) / (25 * scale));
      const alpha = minAlpha + t * (maxAlpha - minAlpha);

      return {
        x: prevPt.x + alpha * dx,
        y: prevPt.y + alpha * dy
      };
    }

    function stabilizeAngle(prevAngle, rawAngle, deadbandRad) {
      if (prevAngle === null || prevAngle === undefined) return rawAngle;
      let diff = rawAngle - prevAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      if (Math.abs(diff) <= deadbandRad) {
        return prevAngle;
      }

      const t = Math.min(1.0, (Math.abs(diff) - deadbandRad) / 0.18);
      const alpha = minAlpha + t * (maxAlpha - minAlpha);
      return prevAngle + alpha * diff;
    }

    function update(rawGeometry) {
      if (!rawGeometry) {
        reset();
        return null;
      }

      if (!prevGeometry) {
        prevGeometry = { ...rawGeometry };
        return rawGeometry;
      }

      const scale = Math.max(0.6, rawGeometry.eyeDist / 140.0);
      const angleDeadbandRad = (angleDeadbandDeg * Math.PI) / 180;

      // 1. Stabilize Eye Angle and Vector
      const rawEyeAngle = Math.atan2(rawGeometry.uEye.y, rawGeometry.uEye.x);
      const prevEyeAngle = Math.atan2(prevGeometry.uEye.y, prevGeometry.uEye.x);
      const stabEyeAngle = stabilizeAngle(prevEyeAngle, rawEyeAngle, angleDeadbandRad);
      const stabUEye = { x: Math.cos(stabEyeAngle), y: Math.sin(stabEyeAngle) };

      // 2. Stabilize Up Vector
      const rawUpAngle = Math.atan2(rawGeometry.uUp.y, rawGeometry.uUp.x);
      const prevUpAngle = Math.atan2(prevGeometry.uUp.y, prevGeometry.uUp.x);
      const stabUpAngle = stabilizeAngle(prevUpAngle, rawUpAngle, angleDeadbandRad);
      const stabUUp = { x: Math.cos(stabUpAngle), y: Math.sin(stabUpAngle) };

      // 3. Stabilize Anchor Points with Deadband
      const stabGlabella = stabilizePoint(prevGeometry.glabellaPt, rawGeometry.glabellaPt, deadbandPx * 0.8, scale);
      const stabMeshTop = stabilizePoint(prevGeometry.meshTopPt, rawGeometry.meshTopPt, deadbandPx * 1.0, scale);
      const stabMidEyes = stabilizePoint(prevGeometry.midEyesPt, rawGeometry.midEyesPt, deadbandPx * 0.8, scale);

      // 4. Stabilize Hairline Point (deadband ensures 1-2px jitter is held 100% still)
      const stabHairline = stabilizePoint(prevGeometry.hairlinePt, rawGeometry.hairlinePt, deadbandPx, scale);

      // 5. Stabilize Eye Distance smoothly
      const eyeDistDiff = Math.abs(rawGeometry.eyeDist - prevGeometry.eyeDist);
      let stabEyeDist = prevGeometry.eyeDist;
      if (eyeDistDiff > deadbandPx * scale) {
        stabEyeDist = prevGeometry.eyeDist + 0.25 * (rawGeometry.eyeDist - prevGeometry.eyeDist);
      }

      const stabilized = {
        ...rawGeometry,
        glabellaPt: stabGlabella,
        meshTopPt: stabMeshTop,
        midEyesPt: stabMidEyes,
        hairlinePt: stabHairline,
        uEye: stabUEye,
        uUp: stabUUp,
        eyeDist: stabEyeDist
      };

      prevGeometry = stabilized;
      return stabilized;
    }

    function stabilizeBox(winner, geometry) {
      if (!geometry) {
        // Fallback to legacy 2D pixel smoothing if geometry is omitted
        if (!winner) {
          prevBox = null;
          return null;
        }
        if (!prevBox) {
          prevBox = { ...winner };
          return winner;
        }
        const dist = Math.hypot(winner.x - prevBox.x, winner.y - prevBox.y);
        if (dist <= deadbandPx * 1.2) {
          return {
            ...winner,
            x: prevBox.x,
            y: prevBox.y,
            boxWidth: prevBox.boxWidth,
            boxHeight: prevBox.boxHeight,
            bottomY: prevBox.bottomY
          };
        }
        const alpha = dist > 40 ? 0.85 : 0.35;
        const stabBox = {
          ...winner,
          x: prevBox.x + alpha * (winner.x - prevBox.x),
          y: prevBox.y + alpha * (winner.y - prevBox.y),
          boxWidth: prevBox.boxWidth + alpha * (winner.boxWidth - prevBox.boxWidth),
          boxHeight: prevBox.boxHeight + alpha * (winner.boxHeight - prevBox.boxHeight),
          bottomY: prevBox.bottomY + alpha * (winner.bottomY - prevBox.bottomY)
        };
        prevBox = stabBox;
        return stabBox;
      }

      // HEAD-ANCHORED REAL-TIME TRACKING (Zero Lag on Head Movement)
      const anchor = geometry.glabellaPt;
      const eyeDist = Math.max(10, geometry.eyeDist);
      const uEye = geometry.uEye;
      const uUp = geometry.uUp;

      if (winner) {
        consecutiveMissCount = 0;
        const dx = winner.x - anchor.x;
        const dy = winner.y - anchor.y;

        // Project winner into Head Space coordinates:
        // rawRelX: offset along eye axis (positive towards left eye)
        const rawRelX = (dx * uEye.x + dy * uEye.y) / eyeDist;
        // rawRelY: offset along up axis (positive towards top of head)
        const rawRelY = (dx * uUp.x + dy * uUp.y) / eyeDist;
        const rawRelW = winner.boxWidth / eyeDist;
        const rawRelH = winner.boxHeight / eyeDist;

        if (!headRelBox) {
          headRelBox = {
            relX: rawRelX,
            relY: rawRelY,
            relW: rawRelW,
            relH: rawRelH,
            conf: winner.confidence || 0.8
          };
        } else {
          // Deadband on head-relative displacement (filters YOLO jitter without lagging behind head movement)
          const dRelX = rawRelX - headRelBox.relX;
          const dRelY = rawRelY - headRelBox.relY;
          const dDist = Math.hypot(dRelX, dRelY);

          // 0.018 * eyeDist is ~2px of movement on the forehead
          const relDeadband = 0.018;
          if (dDist > relDeadband) {
            // When user adjusts tefillin on their head, update relative position smoothly
            const alpha = dDist > 0.12 ? 0.85 : 0.45;
            headRelBox.relX += alpha * dRelX;
            headRelBox.relY += alpha * dRelY;
            headRelBox.relW += alpha * (rawRelW - headRelBox.relW);
            headRelBox.relH += alpha * (rawRelH - headRelBox.relH);
            headRelBox.conf = winner.confidence || headRelBox.conf;
          }
        }
      } else {
        // No tefillin detected by YOLO this frame
        consecutiveMissCount++;
        // If tefillin is absent for more than 8 consecutive frames, clear tracking
        if (consecutiveMissCount > 8) {
          headRelBox = null;
          return null;
        }
      }

      if (!headRelBox) return null;

      // Project Head-Relative box onto the CURRENT 30-60 FPS head position
      const currX = anchor.x + (headRelBox.relX * uEye.x + headRelBox.relY * uUp.x) * eyeDist;
      const currY = anchor.y + (headRelBox.relX * uEye.y + headRelBox.relY * uUp.y) * eyeDist;
      const currW = headRelBox.relW * eyeDist;
      const currH = headRelBox.relH * eyeDist;

      // Lowest edge in head space (pointing down the forehead, i.e., -uUp)
      const bottomY = currY - uUp.y * (currH / 2);

      return {
        x: currX,
        y: currY,
        boxWidth: currW,
        boxHeight: currH,
        leftX: currX - currW / 2,
        rightX: currX + currW / 2,
        topY: currY - currH / 2,
        bottomY: bottomY,
        confidence: headRelBox.conf
      };
    }

    return {
      update,
      stabilizeBox,
      reset,
      get lastVisualRatio() { return lastVisualRatio; },
      set lastVisualRatio(v) { lastVisualRatio = v; },
      get missingVisualCount() { return missingVisualCount; },
      set missingVisualCount(v) { missingVisualCount = v; }
    };
  }

  function analyzeFaceGeometry(landmarks, width, height, hairlineUserAdj = 0, ctx = null, options = {}) {
    if (!landmarks || landmarks.length === 0) return null;

    // Key Anthropometric Landmarks
    const glabella = landmarks[8] || landmarks[9] || landmarks[168]; // Glabella / Lower Forehead (Landmark #8)
    const midEyes = landmarks[168];                  // Inter-canthal midpoint (between eyes #168)
    const noseBridge = landmarks[6];                 // Upper nasal bridge / Nasion
    const meshTop = landmarks[10];                   // Top of forehead mesh
    const eyeLeft = landmarks[33];                   // Outer/inner left eye
    const eyeRight = landmarks[263];                 // Outer/inner right eye
    const subnasale = landmarks[2];                  // Subnasale (base of nose septum)
    const menton = landmarks[152];                   // Menton (bottom tip of chin)

    const eyeLeftPt = { x: eyeLeft.x * width, y: eyeLeft.y * height };
    const eyeRightPt = { x: eyeRight.x * width, y: eyeRight.y * height };
    const glabellaPt = { x: glabella.x * width, y: glabella.y * height };
    const midEyesPt = { x: midEyes.x * width, y: midEyes.y * height };
    const nosePt = { x: noseBridge.x * width, y: noseBridge.y * height };
    const meshTopPt = { x: meshTop.x * width, y: meshTop.y * height };

    const subnasalePt = subnasale ? { x: subnasale.x * width, y: subnasale.y * height } : null;
    const mentonPt = menton ? { x: menton.x * width, y: menton.y * height } : null;

    // Eye distance scale (invariant to camera distance)
    const eyeVector = { x: eyeRightPt.x - eyeLeftPt.x, y: eyeRightPt.y - eyeLeftPt.y };
    const eyeDist = Math.hypot(eyeVector.x, eyeVector.y);
    const uEye = { x: eyeVector.x / eyeDist, y: eyeVector.y / eyeDist };

    // UP vector along central facial symmetry axis
    const faceUpVector = { x: meshTopPt.x - nosePt.x, y: meshTopPt.y - nosePt.y };
    const faceLen = Math.hypot(faceUpVector.x, faceUpVector.y);
    const uUp = { x: faceUpVector.x / faceLen, y: faceUpVector.y / faceLen };

    // 3D Head Pitch Angle (perspective foreshortening compensation)
    const dz = (meshTop.z - noseBridge.z) * width;
    const dy = (meshTopPt.y - nosePt.y);
    const pitchAngle = Math.atan2(dz, Math.abs(dy));
    const pitchCompression = Math.max(0.7, Math.cos(pitchAngle));
    const pitchFactor = Math.max(0.60, Math.cos(25 * Math.PI / 180 + pitchAngle) / Math.cos(25 * Math.PI / 180));

    // Try adaptive visual hairline edge detection first
    let visualHairDist = detectVisualHairline(ctx, width, height, glabellaPt, uUp, eyeDist, pitchAngle);

    // Temporal visual consistency if stabilizer is provided
    const stabilizer = options.stabilizer || null;
    if (stabilizer) {
      if (visualHairDist !== null) {
        const rawRatio = visualHairDist / eyeDist;
        if (stabilizer.lastVisualRatio !== null) {
          stabilizer.lastVisualRatio = 0.80 * stabilizer.lastVisualRatio + 0.20 * rawRatio;
        } else {
          stabilizer.lastVisualRatio = rawRatio;
        }
        stabilizer.missingVisualCount = 0;
        visualHairDist = stabilizer.lastVisualRatio * eyeDist;
      } else if (stabilizer.lastVisualRatio !== null && stabilizer.missingVisualCount < 18) {
        stabilizer.missingVisualCount++;
        visualHairDist = stabilizer.lastVisualRatio * eyeDist;
      } else {
        stabilizer.lastVisualRatio = null;
      }
    }

    // Baseline anatomical prior for natural hairline (trichion ~0.82 * eyeDist with pitch foreshortening)
    const baseAnatomicalRatio = Math.max(0.40, 0.82 * pitchFactor);
    const distFromGlabella = visualHairDist !== null
      ? (visualHairDist + (hairlineUserAdj * 0.15 * eyeDist))
      : (eyeDist * (baseAnatomicalRatio + hairlineUserAdj * 0.20));

    const hairlinePt = {
      x: glabellaPt.x + uUp.x * distFromGlabella,
      y: glabellaPt.y + uUp.y * distFromGlabella
    };

    // Strict Eyebrow & Eyes Exclusion:
    // Tefillin is placed on the head/forehead, NEVER on or near the eyebrows, eyelids, or frames.
    const leftBrowTopY = landmarks[107] ? landmarks[107].y * height : (glabellaPt.y - eyeDist * 0.10);
    const rightBrowTopY = landmarks[336] ? landmarks[336].y * height : (glabellaPt.y - eyeDist * 0.10);
    const highestBrowY = Math.min(leftBrowTopY, rightBrowTopY);
    const strictForeheadLimitY = highestBrowY - Math.round(eyeDist * 0.15);
    const eyebrowLevelY = highestBrowY;

    // Search window for Ketzitzah box
    const searchW = Math.round(eyeDist * 1.10);
    const searchX = Math.round(Math.max(0, midEyesPt.x - searchW / 2));
    const searchY = Math.round(Math.max(0, hairlinePt.y - eyeDist * 2.5));
    const searchBottom = Math.min(strictForeheadLimitY, Math.round(hairlinePt.y + eyeDist * 0.35));
    const searchH = Math.round(Math.max(25, searchBottom - searchY));

    const rawGeometry = {
      glabellaPt,
      midEyesPt,
      nosePt,
      meshTopPt,
      subnasalePt,
      mentonPt,
      hairlinePt,
      eyeLeftPt,
      eyeRightPt,
      eyeDist,
      uEye,
      uUp,
      pitchAngle,
      pitchCompression,
      eyebrowLevelY,
      searchArea: { x: searchX, y: searchY, width: searchW, height: searchH }
    };

    if (stabilizer && typeof stabilizer.update === 'function') {
      return stabilizer.update(rawGeometry);
    }

    return rawGeometry;
  }

  /**
   * 2. Segment Dark Tefillin Blobs (Connected-Component Analysis with Glare Bridging)
   */
  function detectTefillinBlob(ctx, searchArea, eyeDist, midX, options = {}) {
    const { x, y, width, height } = searchArea;
    if (width <= 8 || height <= 8) return null;

    const brightnessThresh = options.brightnessThreshold !== undefined ? options.brightnessThreshold : 88;
    const saturationThresh = options.saturationThreshold !== undefined ? options.saturationThreshold : 32;
    const minSizePct = options.minSizePct || 0.12;

    try {
      const imgData = ctx.getImageData(x, y, width, height);
      const data = imgData.data;

      // --- STEP 1: Grayscale & Local Texture Variance Mapping ---
      const gray = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        gray[p] = (r * 77 + g * 150 + b * 29) >> 8;
      }

      // 3x3 Local Standard Deviation with dilated kernel (scale-aware for upscaled images)
      const scaleStep = Math.max(1, Math.round(eyeDist * 0.015));
      const textureVar = new Uint8Array(width * height);
      for (let py = scaleStep; py < height - scaleStep; py++) {
        const rowOffset = py * width;
        for (let px = scaleStep; px < width - scaleStep; px++) {
          const idx = rowOffset + px;
          let sum = 0, sumSq = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const rOff = (py + dy * scaleStep) * width;
            for (let dx = -1; dx <= 1; dx++) {
              const v = gray[rOff + px + dx * scaleStep];
              sum += v;
              sumSq += v * v;
            }
          }
          const mean = sum / 9;
          const v = Math.max(0, (sumSq / 9) - (mean * mean));
          textureVar[idx] = Math.min(255, Math.sqrt(v) | 0);
        }
      }

      // --- STEP 2: Dark Pixel Mask Generation ---
      const rawMask = new Uint8Array(width * height);
      let rawDarkCount = 0;

      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;
        const satDiff = Math.max(r, g, b) - Math.min(r, g, b);

        // Core black criteria: dark & low color saturation (rejects skin & colored garments)
        // We also enforce textureVar < 18 to reject fibrous hair while keeping leather (even with grooves).
        if (brightness < brightnessThresh && satDiff < saturationThresh && textureVar[p] < 18) {
          rawMask[p] = 1;
          rawDarkCount++;
        }
      }

      if (rawDarkCount < 10) {
        return { allBlobs: [], winner: null, maskData: rawMask, rawDarkCount };
      }

      // Morphological dilation (bridges scaled texture halos and compartment seams)
      const mask = new Uint8Array(width * height);
      const dilateR = Math.max(2, scaleStep + 1);
      
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          if (rawMask[py * width + px] === 1) {
            const startY = Math.max(0, py - dilateR);
            const endY = Math.min(height - 1, py + dilateR);
            const startX = Math.max(0, px - dilateR);
            const endX = Math.min(width - 1, px + dilateR);
            for (let ny = startY; ny <= endY; ny++) {
              const row = ny * width;
              for (let nx = startX; nx <= endX; nx++) {
                mask[row + nx] = 1;
              }
            }
          }
        }
      }

      // --- STEP 3: 1D Horizontal Density Profile & Valley Snapping ---
      const colDarkSum = new Int32Array(width);
      for (let py = 0; py < height; py++) {
        const rowOffset = py * width;
        for (let px = 0; px < width; px++) {
          if (mask[rowOffset + px] === 1) colDarkSum[px]++;
        }
      }

      const relMidX = midX - x;
      const corridorHalfW = Math.round(eyeDist * 0.26);
      const searchLeft = Math.max(0, Math.round(relMidX - corridorHalfW));
      const searchRight = Math.min(width - 1, Math.round(relMidX + corridorHalfW));

      let maxCentralCol = 0;
      for (let px = searchLeft; px <= searchRight; px++) {
        if (colDarkSum[px] > maxCentralCol) maxCentralCol = colDarkSum[px];
      }
      const valleyThreshold = Math.max(3, Math.round(maxCentralCol * 0.20));

      let snappedLeft = searchLeft;
      let snappedRight = searchRight;
      for (let px = Math.round(relMidX); px >= searchLeft; px--) {
        if (colDarkSum[px] < valleyThreshold) { snappedLeft = px + 1; break; }
      }
      for (let px = Math.round(relMidX); px <= searchRight; px++) {
        if (colDarkSum[px] < valleyThreshold) { snappedRight = px - 1; break; }
      }
      if (snappedLeft >= snappedRight) { snappedLeft = searchLeft; snappedRight = searchRight; }

      // --- STEP 4: Vertical Skin-to-Leather Contrast Step Profiling ---
      let skinTransitionY = -1;
      for (let py = height - 2; py >= 2; py--) {
        let rowDark = 0;
        for (let px = snappedLeft; px <= snappedRight; px++) {
          if (mask[py * width + px] === 1) rowDark++;
        }
        if (rowDark >= Math.max(4, Math.round((snappedRight - snappedLeft + 1) * 0.30))) {
          skinTransitionY = py;
          break;
        }
      }

      // --- STEP 5: BFS Connected-Component Clustering with Texture & Core Analysis ---
      const visited = new Uint8Array(width * height);
      const blobs = [];

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const idx = py * width + px;
          if (mask[idx] === 1 && !visited[idx]) {
            let count = 0;
            let minX = px, maxX = px, minY = py, maxY = py;
            let sumX = 0, sumY = 0;
            let sumVariance = 0;

            const queue = [idx];
            visited[idx] = 1;
            let qHead = 0;

            while (qHead < queue.length) {
              const curr = queue[qHead++];
              const cx = curr % width;
              const cy = (curr / width) | 0;

              count++;
              sumX += cx;
              sumY += cy;
              sumVariance += textureVar[curr];

              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;

              // 4-connected neighbors
              if (cy > 0) { const up = curr - width; if (mask[up] === 1 && !visited[up]) { visited[up] = 1; queue.push(up); } }
              if (cy < height - 1) { const down = curr + width; if (mask[down] === 1 && !visited[down]) { visited[down] = 1; queue.push(down); } }
              if (cx > 0) { const left = curr - 1; if (mask[left] === 1 && !visited[left]) { visited[left] = 1; queue.push(left); } }
              if (cx < width - 1) { const right = curr + 1; if (mask[right] === 1 && !visited[right]) { visited[right] = 1; queue.push(right); } }
            }

            const bW = maxX - minX + 1;
            const bH = maxY - minY + 1;
            const density = count / (bW * bH);
            const avgVariance = sumVariance / count;

            // Extract Central Sagittal Placement Core (Snapped Corridor)
            let cCount = 0;
            let cMinX = 9999, cMaxX = -1, cMinY = 9999, cMaxY = -1;
            let cSumX = 0, cSumY = 0;
            let cSumVar = 0;

            for (let q = 0; q < queue.length; q++) {
              const pIdx = queue[q];
              const pxCoord = pIdx % width;
              const pyCoord = (pIdx / width) | 0;

              if (pxCoord >= snappedLeft && pxCoord <= snappedRight) {
                cCount++;
                cSumX += pxCoord;
                cSumY += pyCoord;
                cSumVar += textureVar[pIdx];
                if (pxCoord < cMinX) cMinX = pxCoord;
                if (pxCoord > cMaxX) cMaxX = pxCoord;
                if (pyCoord < cMinY) cMinY = pyCoord;
                if (pyCoord > cMaxY) cMaxY = pyCoord;
              }
            }

            const hasCentralCore = cCount >= Math.max(12, Math.round(eyeDist * eyeDist * 0.008));
            const cBoxW = hasCentralCore ? (cMaxX - cMinX + 1) : bW;
            const cBoxH = hasCentralCore ? (cMaxY - cMinY + 1) : bH;
            const cDensity = hasCentralCore ? (cCount / (cBoxW * cBoxH)) : density;
            const cAvgVar = hasCentralCore ? (cSumVar / cCount) : avgVariance;

            blobs.push({
              minX, maxX, minY, maxY,
              width: bW,
              height: bH,
              count,
              density,
              avgVariance,
              avgX: sumX / count,
              avgY: sumY / count,
              // Central Ketzitzah Core Metrics (isolated from lateral hair & sideburns)
              hasCentralCore,
              centralCount: cCount,
              centralMinX: hasCentralCore ? cMinX : minX,
              centralMaxX: hasCentralCore ? cMaxX : maxX,
              centralMinY: hasCentralCore ? cMinY : minY,
              centralMaxY: hasCentralCore ? cMaxY : maxY,
              centralWidth: cBoxW,
              centralHeight: cBoxH,
              centralDensity: cDensity,
              centralAvgVariance: cAvgVar,
              centralAvgX: hasCentralCore ? (cSumX / cCount) : (sumX / count),
              centralAvgY: hasCentralCore ? (cSumY / cCount) : (sumY / count)
            });
          }
        }
      }

      // --- STEP 6: Multi-Factor Scoring & Winner Selection ---
      const minPhysicalDim = Math.max(8, Math.round(eyeDist * (minSizePct * 0.65)));
      const minPixelCount = Math.max(12, Math.round(eyeDist * eyeDist * 0.008));
      const maxPhysicalSize = Math.max(width, height) + 30;

      let bestBlob = null;
      let bestScore = -999;

      const scoredBlobs = blobs.map((blob, idx) => {
        const useCentral = blob.hasCentralCore && (blob.width > eyeDist * 0.45 || blob.height > eyeDist * 0.55);

        // Physical Ketzitzah + Titura Assembly Proportions (Top-Down Anchor)
        const maxBoxW = Math.max(16, Math.round(eyeDist * 0.48));
        const maxBoxH = Math.max(16, Math.round(eyeDist * 0.50));

        let finalWidth = useCentral ? blob.centralWidth : blob.width;
        let finalMinX = useCentral ? blob.centralMinX : blob.minX;
        let finalMaxX = useCentral ? blob.centralMaxX : blob.maxX;
        let finalMinY = useCentral ? blob.centralMinY : blob.minY; // Top Apex of Ketzitzah
        let finalMaxY = useCentral ? blob.centralMaxY : blob.maxY;
        let finalCount = useCentral ? blob.centralCount : blob.count;
        let finalDensity = useCentral ? blob.centralDensity : blob.density;
        let finalAvgX = useCentral ? blob.centralAvgX : blob.avgX;
        let finalVar = useCentral ? blob.centralAvgVariance : blob.avgVariance;

        // Horizontally bound width to physical Ketzitzah width:
        if (finalWidth > maxBoxW) {
          finalWidth = maxBoxW;
          finalMinX = Math.round(finalAvgX - finalWidth / 2);
          finalMaxX = Math.round(finalAvgX + finalWidth / 2);
        }

        // Refine vertical bounds using sharp gradient edge detection to separate from Kippah/Hair
        const vPad = 6;
        const scanMinY = Math.max(0, finalMinY - vPad);
        const scanMaxY = Math.min(height - 1, finalMaxY + vPad);
        
        const vProfile = new Int32Array(height);
        for (let py = scanMinY; py <= scanMaxY; py++) {
          let count = 0;
          for (let px = finalMinX; px <= finalMaxX; px++) {
            if (rawMask[py * width + px] === 1) count++;
          }
          vProfile[py] = count;
        }

        const edgeThresh = Math.max(3, finalWidth * 0.3); // Minimum delta to be a real edge

        let maxTopDelta = -1;
        let refinedMinY = finalMinY;
        // Search top-down, mostly in the upper half to find the Ketzitzah top
        const searchLimitTop = Math.min(scanMaxY - 2, finalMinY + Math.round(maxBoxH * 0.8));
        for (let py = scanMinY + 2; py <= searchLimitTop; py++) {
          let above = vProfile[py - 1] + vProfile[py - 2];
          let below = vProfile[py + 1] + vProfile[py + 2];
          if (below - above > maxTopDelta && vProfile[py + 1] > finalWidth * 0.4) {
            maxTopDelta = below - above;
            refinedMinY = py;
          }
        }

        let maxBottomDelta = -1;
        let refinedMaxY = finalMaxY;
        // Search bottom-up, mostly in the lower half to find the Titura base
        const searchLimitBottom = Math.max(scanMinY + 2, finalMaxY - Math.round(maxBoxH * 0.8));
        for (let py = scanMaxY - 2; py >= searchLimitBottom; py--) {
          let above = vProfile[py - 1] + vProfile[py - 2];
          let below = vProfile[py + 1] + vProfile[py + 2];
          if (above - below > maxBottomDelta && vProfile[py - 1] > finalWidth * 0.4) {
            maxBottomDelta = above - below;
            refinedMaxY = py;
          }
        }

        if (maxTopDelta > edgeThresh) finalMinY = refinedMinY;
        if (maxBottomDelta > edgeThresh) finalMaxY = refinedMaxY;

        let finalHeight = finalMaxY - finalMinY + 1;
        
        // Safety fallback if height is wildly large
        if (finalHeight > maxBoxH * 1.35) {
          finalHeight = Math.round(maxBoxH);
          finalMaxY = finalMinY + finalHeight;
        }

        const finalAvgY = finalMinY + finalHeight / 2;

        const absCenterX = x + finalAvgX;
        const distFromMidline = Math.abs(absCenterX - midX);
        const aspectRatio = finalWidth / finalHeight;

        let rejectReason = null;
        if (finalCount < minPixelCount) rejectReason = `מעט פיקסלים (<${minPixelCount})`;
        else if (finalWidth < minPhysicalDim || finalHeight < minPhysicalDim) rejectReason = `מימד קטן (<${minPhysicalDim}px)`;
        else if (finalWidth > maxPhysicalSize || finalHeight > maxPhysicalSize) rejectReason = 'גדול מדי';
        else if (aspectRatio < 0.20 || aspectRatio > 3.5) rejectReason = `יחס חריג (${aspectRatio.toFixed(2)})`;
        else if (finalDensity < 0.15) rejectReason = `צפיפות נמוכה (${(finalDensity * 100).toFixed(0)}%)`;
        else if (distFromMidline > eyeDist * 0.48) rejectReason = `רחוק מאמצע (${Math.round(distFromMidline)}px)`;

        // Score Components:
        // 1. Aspect Ratio / Squareness (1.0 = square)
        const shapeScore = 1.0 - Math.min(1.0, Math.abs(1.0 - aspectRatio) * 0.45);
        // 2. Solidity / Density (Leather is solid 70-95%)
        const densityScore = finalDensity;
        // 3. Sagittal Midline Centering (Tefillin is worn strictly between the eyes)
        const centerScore = Math.max(0, 1.0 - (distFromMidline / (eyeDist * 0.40)));
        // 4. Texture Uniformity (Smooth leather rewards low variance, fibrous hair is penalized)
        const textureScore = Math.max(0, 1.0 - (finalVar / 26.0));
        // 5. Volume score
        const countScore = Math.min(1.0, finalCount / (eyeDist * eyeDist * 0.08));

        const totalScore = (densityScore * 3.0) + (shapeScore * 2.2) + (centerScore * 4.5) + (textureScore * 1.5) + countScore;

        const evaluated = {
          id: idx + 1,
          ...blob,
          x: x + finalAvgX,
          y: y + finalAvgY,
          topY: y + finalMinY,
          bottomY: y + finalMaxY,
          leftX: x + finalMinX,
          rightX: x + finalMaxX,
          boxWidth: finalWidth,
          boxHeight: finalHeight,
          density: finalDensity,
          count: finalCount,
          avgVariance: finalVar.toFixed(1),
          distFromMidline,
          totalScore: totalScore.toFixed(2),
          rejectReason
        };

        if (!rejectReason && totalScore > bestScore) {
          bestScore = totalScore;
          bestBlob = evaluated;
        }

        return evaluated;
      });

      if (options.debug || options.verbose) {
        console.log(`[TefillinEngine] Search: (${x},${y},${width}x${height}) | DarkPx: ${rawDarkCount} | Candidates: ${blobs.length} | SnappedCorridor: [${snappedLeft}, ${snappedRight}]`);
        scoredBlobs.forEach(b => {
          console.log(`  Blob #${b.id}: ${b.boxWidth}x${b.boxHeight} (${b.count}px), pos=(${Math.round(b.x)},${Math.round(b.y)}), midOffset=${Math.round(b.distFromMidline)}px, density=${(b.density * 100).toFixed(0)}%, var=${b.avgVariance}, score=${b.totalScore} ${b.rejectReason ? `[REJECT: ${b.rejectReason}]` : '[VALID]'}`);
        });
        if (bestBlob) {
          console.log(`  ⭐ WINNER: Blob #${bestBlob.id} at (${Math.round(bestBlob.x)}, ${Math.round(bestBlob.y)}) score=${bestBlob.totalScore}`);
        } else {
          console.log(`  ❌ NO WINNER found.`);
        }
      }

      return { allBlobs: scoredBlobs, winner: bestBlob, maskData: mask, rawDarkCount };
    } catch (err) {
      console.error("detectTefillinBlob error:", err);
      return null;
    }
  }

  /**
   * 3. Evaluate Halachic Alignment (Distance from Hairline & Horizontal Symmetry)
   */
  function evaluateAlignment(winner, geometry) {
    if (!winner || !geometry) return { status: 'NO_TEFILLIN', isKosher: false };

    const { hairlinePt, midEyesPt, uUp, uEye, eyeDist } = geometry;

    // Lowest edge vector from hairline point
    const lowestEdgeX = winner.x;
    const lowestEdgeY = winner.bottomY;
    const lowestEdgeVector = { x: lowestEdgeX - hairlinePt.x, y: lowestEdgeY - hairlinePt.y };

    // Positive = Lowest edge is ABOVE hairline on scalp (Kosher).
    // Negative = Lowest edge is BELOW hairline on forehead skin (Passul).
    
    // We remove the artificial tolerance so the app is 100% mathematically strict.
    // If it is even 1 pixel below the FaceMesh hairline, it fails.
    const distAboveHairline = (lowestEdgeVector.x * uUp.x + lowestEdgeVector.y * uUp.y);
    const isEntirelyOnScalp = distAboveHairline >= 0;

    // Horizontal offset from middle of eyes
    // FIX: Using the vector from Glabella to MeshTop (which lies on the forehead surface) 
    // is much more robust to 3D Head Yaw than the MidEyes point (which is deep in the skull).
    const A = geometry.glabellaPt;
    const B = geometry.meshTopPt;
    const P = { x: winner.x, y: winner.y };
    // Perpendicular distance from point P to line AB
    const lineLen = Math.hypot(B.x - A.x, B.y - A.y);
    let horizOffsetLocal = 0;
    if (lineLen > 0.1) {
      // Cross product gives perpendicular distance. 
      // Sign indicates left/right. 
      horizOffsetLocal = ((B.x - A.x) * (A.y - P.y) - (B.y - A.y) * (A.x - P.x)) / lineLen;
    }
    const isCentered = Math.abs(horizOffsetLocal) < (eyeDist * 0.18);

    // Camera Pose / Angle Limits:
    // If the camera angle is too steep, perspective distortion degrades detection reliability.
    const pitchDeg = (geometry.pitchAngle * 180) / Math.PI;
    const isCameraTooLow = pitchDeg > 35;
    const isCameraTooHigh = pitchDeg < -20;

    let status = 'ALIGNED';
    let warning = false;
    let direction = '';

    if (isCameraTooLow) {
      status = 'CAMERA_TOO_LOW';
      warning = true;
      direction = '📐 מצלמה נמוכה מדי - יש להחזיק את המכשיר מול הפנים בגובה העיניים';
    } else if (isCameraTooHigh) {
      status = 'CAMERA_TOO_HIGH';
      warning = true;
      direction = '📐 מצלמה גבוהה מדי - יש להחזיק את המכשיר מול הפנים בגובה העיניים';
    } else if (!isEntirelyOnScalp) {
      status = 'FOREHEAD_ERROR';
      direction = '⬆️ הרימו למעלה'; // Move UP onto hair
    } else if (!isCentered) {
      status = 'OFF_CENTER';
      if (horizOffsetLocal > 0) {
        direction = '⬅️ הזיזו שמאלה'; // Move to User's Left
      } else {
        direction = '➡️ הזיזו ימינה'; // Move to User's Right
      }
    } else {
      status = 'ALIGNED';
      // If it's kosher but very close to the edge (less than eyeDist * 0.04)
      if (distAboveHairline < (eyeDist * 0.04)) {
        warning = true;
        direction = '⚠️ גבולי (קרוב למצח)';
      } else {
        direction = '✅ מצוין';
      }
    }

    return {
      status,
      warning,
      direction,
      isKosher: isEntirelyOnScalp && !isCameraTooLow && !isCameraTooHigh,
      isCentered,
      distAboveHairline: Math.round(distAboveHairline),
      horizOffset: Math.round(horizOffsetLocal),
      winner
    };
  }

  /**
   * 4. Draw Graphical Overlays (Guidelines, Bounding Box, Lowest Edge Indicator)
   */
  function renderOverlays(ctx, geometry, alignmentResult, options = {}) {
    if (!ctx || !geometry) return;

    const { midEyesPt, hairlinePt, uUp, uEye, eyeDist, searchArea, glabellaPt, meshTopPt } = geometry;
    const { status, winner } = alignmentResult || {};

    // Search bounding box
    if (options.showSearchBox && searchArea) {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(searchArea.x, searchArea.y, searchArea.width, searchArea.height);
    }

    // Gold symmetry centerline
    if (options.showGuides !== false) {
      ctx.beginPath();
      // Draw true surface midline (Glabella to MeshTop)
      const midlineVec = { x: meshTopPt.x - glabellaPt.x, y: meshTopPt.y - glabellaPt.y };
      ctx.moveTo(glabellaPt.x - midlineVec.x * 2, glabellaPt.y - midlineVec.y * 2);
      ctx.lineTo(meshTopPt.x + midlineVec.x * 0.5, meshTopPt.y + midlineVec.y * 0.5);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Green hairline boundary
      ctx.beginPath();
      ctx.moveTo(hairlinePt.x - uEye.x * eyeDist * 1.3, hairlinePt.y - uEye.y * eyeDist * 1.3);
      ctx.lineTo(hairlinePt.x + uEye.x * eyeDist * 1.3, hairlinePt.y + uEye.y * eyeDist * 1.3);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Draw detected Tefillin box & lowest edge indicator
    if (winner && options.showGuides !== false) {
      const strokeColor = (status === 'FOREHEAD_ERROR') ? '#ef4444' : '#22c55e';
      
      // Calculate roll angle for rotated bounding box
      const rollAngle = Math.atan2(uEye.y, uEye.x);

      ctx.save();
      ctx.translate(winner.x, winner.y);
      ctx.rotate(rollAngle);

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      // Draw box centered at 0,0 
      ctx.strokeRect(-winner.boxWidth / 2, -winner.boxHeight / 2, winner.boxWidth, winner.boxHeight);

      // Prominent lowest edge line
      ctx.beginPath();
      ctx.moveTo(-winner.boxWidth / 2 - 4, winner.boxHeight / 2);
      ctx.lineTo(winner.boxWidth / 2 + 4, winner.boxHeight / 2);
      ctx.lineWidth = 4;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      
      ctx.restore();
    }
  }

  /**
   * 5. Preprocess/Scale Image for Optimal MediaPipe Landmark Detection
   */
  function prepareCanvasForImage(img, targetCanvas, minDimension = 540) {
    const rawW = img.naturalWidth || img.width;
    const rawH = img.naturalHeight || img.height;
    let targetW = rawW;
    let targetH = rawH;

    if (rawW < minDimension || rawH < minDimension) {
      const scale = Math.max(minDimension / rawW, minDimension / rawH);
      targetW = Math.round(rawW * scale);
      targetH = Math.round(rawH * scale);
    }

    targetCanvas.width = targetW;
    targetCanvas.height = targetH;
    const ctx = targetCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    return targetCanvas;
  }

  return {
    analyzeFaceGeometry,
    createGeometryStabilizer,
    detectTefillinBlob,
    evaluateAlignment,
    renderOverlays,
    prepareCanvasForImage
  };
})();

// Export for node or browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TefillinEngine;
}

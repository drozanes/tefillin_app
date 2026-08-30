/**
 * TefillinEngine - Shared Computer Vision & Halachic Alignment Engine
 * Used by both the live app (index.html) and the benchmark test studio (test.html).
 */

const TefillinEngine = (function () {
  'use strict';

  /**
   * 1. Extract 3D Facial Geometry & Halachic Reference Points from MediaPipe 468/478 Landmarks
   */
  function analyzeFaceGeometry(landmarks, width, height, hairlineUserAdj = 0) {
    if (!landmarks || landmarks.length === 0) return null;

    const midEyes = landmarks[168];      // Mid-point between eyes / glabella
    const noseBridge = landmarks[6];     // Upper nasal bridge
    const meshTop = landmarks[10];       // Top of forehead mesh
    const eyeLeft = landmarks[33];       // Outer/inner left eye
    const eyeRight = landmarks[263];     // Outer/inner right eye

    const eyeLeftPt = { x: eyeLeft.x * width, y: eyeLeft.y * height };
    const eyeRightPt = { x: eyeRight.x * width, y: eyeRight.y * height };
    const midEyesPt = { x: midEyes.x * width, y: midEyes.y * height };
    const nosePt = { x: noseBridge.x * width, y: noseBridge.y * height };
    const meshTopPt = { x: meshTop.x * width, y: meshTop.y * height };

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

    // Hairline root boundary (starts at natural hair roots above forehead)
    const baseHairlineRatio = (0.26 + hairlineUserAdj) * pitchCompression;
    const hairlineOffset = eyeDist * baseHairlineRatio;
    const hairlinePt = {
      x: meshTopPt.x + uUp.x * hairlineOffset,
      y: meshTopPt.y + uUp.y * hairlineOffset
    };

    // Eyebrow Level Y (cutoff strictly above glasses frames & eyes)
    const eyebrowLevelY = Math.min(eyeLeftPt.y, eyeRightPt.y);

    // Search window for Ketzitzah box
    const searchW = Math.round(eyeDist * 1.35);
    const searchX = Math.round(Math.max(0, midEyesPt.x - searchW / 2));
    const searchY = Math.round(Math.max(0, hairlinePt.y - eyeDist * 2.2));
    const searchBottom = Math.min(height, Math.max(hairlinePt.y + eyeDist * 0.40, eyebrowLevelY - 5));
    const searchH = Math.round(Math.max(35, searchBottom - searchY));

    return {
      midEyesPt,
      nosePt,
      meshTopPt,
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
  }

  /**
   * 2. Segment Dark Tefillin Blobs (Connected-Component Analysis with Glare Bridging)
   */
  function detectTefillinBlob(ctx, searchArea, eyeDist, midX, options = {}) {
    const { x, y, width, height } = searchArea;
    if (width <= 8 || height <= 8) return null;

    const brightnessThresh = options.brightnessThreshold || 88;
    const saturationThresh = options.saturationThreshold || 32;
    const minSizePct = options.minSizePct || 0.14;

    try {
      const imgData = ctx.getImageData(x, y, width, height);
      const data = imgData.data;

      const rawMask = new Uint8Array(width * height);
      let rawDarkCount = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;
        const satDiff = Math.max(r, g, b) - Math.min(r, g, b);

        // Core black criteria: dark & low color saturation (rejects skin & colored headbands)
        if (brightness < brightnessThresh && satDiff < saturationThresh) {
          rawMask[i >> 2] = 1;
          rawDarkCount++;
        }
      }

      if (rawDarkCount < 12) {
        return { allBlobs: [], winner: null, maskData: rawMask, rawDarkCount };
      }

      // 2px morphological dilation (bridges leather specular glints and block seams)
      const mask = new Uint8Array(width * height);
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const idx = py * width + px;
          if (rawMask[idx] === 1) {
            mask[idx] = 1;
            if (px > 0) mask[idx - 1] = 1;
            if (px < width - 1) mask[idx + 1] = 1;
            if (py > 0) mask[idx - width] = 1;
            if (py < height - 1) mask[idx + width] = 1;
            if (px > 1) mask[idx - 2] = 1;
            if (px < width - 2) mask[idx + 2] = 1;
            if (py > 1) mask[idx - width * 2] = 1;
            if (py < height - 2) mask[idx + width * 2] = 1;
          }
        }
      }

      // BFS Connected-Component Clustering
      const visited = new Uint8Array(width * height);
      const blobs = [];

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const idx = py * width + px;
          if (mask[idx] === 1 && !visited[idx]) {
            let count = 0;
            let minX = px, maxX = px, minY = py, maxY = py;
            let sumX = 0, sumY = 0;

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

            blobs.push({
              minX, maxX, minY, maxY,
              width: bW,
              height: bH,
              count,
              density,
              avgX: sumX / count,
              avgY: sumY / count
            });
          }
        }
      }

      const minPhysicalDim = Math.max(8, Math.round(eyeDist * (minSizePct * 0.70)));
      const minPixelCount = Math.max(16, Math.round(eyeDist * eyeDist * 0.010));
      const maxPhysicalSize = Math.round(eyeDist * 0.95);

      let bestBlob = null;
      let bestScore = -999;

      const scoredBlobs = blobs.map((blob, idx) => {
        const absCenterX = x + blob.avgX;
        const distFromMidline = Math.abs(absCenterX - midX);
        const aspectRatio = blob.width / blob.height;

        let rejectReason = null;
        if (blob.count < minPixelCount) rejectReason = `מעט פיקסלים (<${minPixelCount})`;
        else if (blob.width < minPhysicalDim || blob.height < minPhysicalDim) rejectReason = `מימד קטן (<${minPhysicalDim}px)`;
        else if (blob.width > maxPhysicalSize || blob.height > maxPhysicalSize) rejectReason = 'גדול מדי';
        else if (aspectRatio < 0.28 || aspectRatio > 2.8) rejectReason = `יחס חריג (${aspectRatio.toFixed(2)})`;
        else if (blob.density < 0.20) rejectReason = `צפיפות נמוכה (${(blob.density * 100).toFixed(0)}%)`;
        else if (distFromMidline > eyeDist * 0.42) rejectReason = `רחוק מאמצע (${Math.round(distFromMidline)}px)`;

        const shapeScore = 1.0 - Math.min(1.0, Math.abs(1.0 - aspectRatio) * 0.5);
        const densityScore = blob.density;
        const centerScore = Math.max(0, 1.0 - (distFromMidline / (eyeDist * 0.42)));
        const countScore = Math.min(1.0, blob.count / (eyeDist * eyeDist * 0.08));
        const totalScore = (densityScore * 3.5) + (shapeScore * 2.5) + (centerScore * 3.5) + countScore;

        const evaluated = {
          id: idx + 1,
          ...blob,
          x: x + blob.avgX,
          y: y + blob.avgY,
          topY: y + blob.minY,
          bottomY: y + blob.maxY,
          leftX: x + blob.minX,
          rightX: x + blob.maxX,
          boxWidth: blob.width,
          boxHeight: blob.height,
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

      return { allBlobs: scoredBlobs, winner: bestBlob, maskData: mask };
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
    const distAboveHairline = (lowestEdgeVector.x * uUp.x + lowestEdgeVector.y * uUp.y);
    const foreheadTolerance = Math.max(5, Math.round(eyeDist * 0.04));
    const isEntirelyOnScalp = distAboveHairline >= -foreheadTolerance;

    // Horizontal offset from middle of eyes
    const tefillinVec = { x: winner.x - midEyesPt.x, y: winner.y - midEyesPt.y };
    const horizOffsetLocal = (tefillinVec.x * uEye.x + tefillinVec.y * uEye.y);
    const isCentered = Math.abs(horizOffsetLocal) < (eyeDist * 0.18);

    let status = 'ALIGNED';
    if (!isEntirelyOnScalp) {
      status = 'FOREHEAD_ERROR';
    } else if (!isCentered) {
      status = 'OFF_CENTER';
    } else {
      status = 'ALIGNED';
    }

    return {
      status,
      isKosher: isEntirelyOnScalp,
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

    const { midEyesPt, hairlinePt, uUp, uEye, eyeDist, searchArea } = geometry;
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
      ctx.moveTo(midEyesPt.x - uUp.x * 300, midEyesPt.y - uUp.y * 300);
      ctx.lineTo(midEyesPt.x + uUp.x * 300, midEyesPt.y + uUp.y * 300);
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
    if (winner) {
      const strokeColor = (status === 'FOREHEAD_ERROR') ? '#ef4444' : '#22c55e';

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(winner.leftX, winner.topY, winner.boxWidth, winner.boxHeight);

      // Prominent lowest edge line
      ctx.beginPath();
      ctx.moveTo(winner.leftX - 4, winner.bottomY);
      ctx.lineTo(winner.rightX + 4, winner.bottomY);
      ctx.lineWidth = 4;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(winner.x, winner.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
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

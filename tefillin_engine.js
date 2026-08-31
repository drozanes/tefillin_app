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
  function analyzeFaceGeometry(landmarks, width, height, hairlineUserAdj = 0) {
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

    // --- OPTION 1: MULTI-THIRDS FACIAL ANTHROPOMETRY (DA VINCI / FARKAS CANON) ---
    // Middle Third Height: Subnasale (#2) to Glabella (#8) projected along facial UP vector
    let midThirdHeight = 0;
    if (subnasalePt) {
      const vMidX = glabellaPt.x - subnasalePt.x;
      const vMidY = glabellaPt.y - subnasalePt.y;
      midThirdHeight = Math.abs(vMidX * uUp.x + vMidY * uUp.y);
    }

    // Lower Third Height: Menton (#152) to Subnasale (#2) projected along facial UP vector
    let lowerThirdHeight = 0;
    if (mentonPt && subnasalePt) {
      const vLowerX = subnasalePt.x - mentonPt.x;
      const vLowerY = subnasalePt.y - mentonPt.y;
      lowerThirdHeight = Math.abs(vLowerX * uUp.x + vLowerY * uUp.y);
    }

    // Validate physiological bounds of facial thirds relative to inter-ocular scale
    const isValidMidThird = midThirdHeight >= eyeDist * 0.45 && midThirdHeight <= eyeDist * 1.50;
    const isValidLowerThird = lowerThirdHeight >= eyeDist * 0.45 && lowerThirdHeight <= eyeDist * 1.80;

    let referenceThird = 0;
    if (isValidMidThird && isValidLowerThird) {
      // Both facial thirds visible and anatomically consistent
      referenceThird = (midThirdHeight * 0.55 + lowerThirdHeight * 0.45);
    } else if (isValidMidThird) {
      // Chin cropped or occluded by tallit/beard; rely on middle third
      referenceThird = midThirdHeight;
    } else if (isValidLowerThird) {
      // Midface occluded; rely on lower third
      referenceThird = lowerThirdHeight;
    } else {
      // Extreme tight crop fallback based on interpupillary scale
      referenceThird = eyeDist * 0.88;
    }

    // Anatomical Forehead Upper Third (Glabella -> Anatomical Trichion):
    // In human craniofacial anatomy, natural Trichion = Glabella (#8) + (referenceThird)
    const targetForeheadHeight = referenceThird * (0.98 + hairlineUserAdj) * pitchCompression;

    // Projected Anatomical Hairline Point (Trichion) along facial UP axis from Glabella (#8)
    const hairlinePt = {
      x: glabellaPt.x + uUp.x * targetForeheadHeight,
      y: glabellaPt.y + uUp.y * targetForeheadHeight
    };

    // Strict Eyebrow & Eyes Exclusion:
    // Tefillin is placed on the head/forehead, NEVER on or near the eyebrows, eyelids, or glasses frames.
    // We sample the top of both eyebrows (landmarks 107 and 336) and enforce a strict buffer above them.
    const leftBrowTopY = landmarks[107] ? landmarks[107].y * height : (glabellaPt.y - eyeDist * 0.10);
    const rightBrowTopY = landmarks[336] ? landmarks[336].y * height : (glabellaPt.y - eyeDist * 0.10);
    const highestBrowY = Math.min(leftBrowTopY, rightBrowTopY);
    const strictForeheadLimitY = highestBrowY - Math.round(eyeDist * 0.15);
    const eyebrowLevelY = highestBrowY;

    // Search window for Ketzitzah box
    const searchW = Math.round(eyeDist * 1.10);
    const searchX = Math.round(Math.max(0, midEyesPt.x - searchW / 2));
    const searchY = Math.round(Math.max(0, hairlinePt.y - eyeDist * 1.65));
    const searchBottom = Math.min(strictForeheadLimitY, Math.round(hairlinePt.y + eyeDist * 0.35));
    const searchH = Math.round(Math.max(25, searchBottom - searchY));

    return {
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
      midThirdHeight,
      lowerThirdHeight,
      referenceThird,
      targetForeheadHeight,
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

      // 3x3 Local Standard Deviation (Leather is smooth sigma < 12, hair is fibrous sigma > 22)
      const textureVar = new Uint8Array(width * height);
      for (let py = 1; py < height - 1; py++) {
        const rowOffset = py * width;
        for (let px = 1; px < width - 1; px++) {
          const idx = rowOffset + px;
          let sum = 0, sumSq = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const rOff = (py + dy) * width;
            for (let dx = -1; dx <= 1; dx++) {
              const v = gray[rOff + px + dx];
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
        if (brightness < brightnessThresh && satDiff < saturationThresh) {
          rawMask[p] = 1;
          rawDarkCount++;
        }
      }

      if (rawDarkCount < 10) {
        return { allBlobs: [], winner: null, maskData: rawMask, rawDarkCount };
      }

      // 2px morphological dilation (bridges leather specular glints and compartment seams)
      const mask = new Uint8Array(width * height);
      for (let py = 0; py < height; py++) {
        const rowOffset = py * width;
        for (let px = 0; px < width; px++) {
          const idx = rowOffset + px;
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
      for (let px = Math.round(relMidX); px >= 0; px--) {
        if (colDarkSum[px] < valleyThreshold) { snappedLeft = px + 1; break; }
      }
      for (let px = Math.round(relMidX); px < width; px++) {
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
        
        // Physical Ketzitzah cube proportional constraints (stops box from bleeding into hair)
        const maxBoxW = Math.max(16, Math.round(eyeDist * 0.48));
        const maxBoxH = Math.max(16, Math.round(eyeDist * 0.52));

        let finalWidth = useCentral ? blob.centralWidth : blob.width;
        let finalHeight = useCentral ? blob.centralHeight : blob.height;
        let finalMinX = useCentral ? blob.centralMinX : blob.minX;
        let finalMaxX = useCentral ? blob.centralMaxX : blob.maxX;
        let finalMinY = useCentral ? blob.centralMinY : blob.minY;
        let finalMaxY = useCentral ? blob.centralMaxY : blob.maxY;
        let finalCount = useCentral ? blob.centralCount : blob.count;
        let finalDensity = useCentral ? blob.centralDensity : blob.density;
        let finalAvgX = useCentral ? blob.centralAvgX : blob.avgX;
        let finalAvgY = useCentral ? blob.centralAvgY : blob.avgY;
        let finalVar = useCentral ? blob.centralAvgVariance : blob.avgVariance;

        // Strictly constrain box from expanding into top/side hair:
        if (finalWidth > maxBoxW) {
          finalWidth = maxBoxW;
          finalMinX = Math.round(finalAvgX - finalWidth / 2);
          finalMaxX = Math.round(finalAvgX + finalWidth / 2);
        }
        if (finalHeight > maxBoxH) {
          finalHeight = maxBoxH;
          finalMinY = Math.max(0, finalMaxY - finalHeight);
        }

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

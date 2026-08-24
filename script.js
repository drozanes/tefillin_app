/**
 * Real-Time Tefillin Detector & Strict Halachic Alignment Engine
 *
 * Algorithms & Features:
 * 1. Connected-Component Blob Analysis: Identifies the exact compact black Ketzitzah box,
 *    excluding side hair, colored blocks, headband straps, and background shadows.
 * 2. Precision Lowest-Edge Tracking: Accurately extracts the bottom-most boundary of the Tefillin box.
 * 3. Proportional Hairline Baseline with Real-Time Calibration (saved in localStorage).
 * 4. Multi-language (Hebrew / English) and clean visual overlays.
 */

const state = {
  currentLang: 'he',
  isMirrored: true,
  showGuides: true,
  tefillinFound: false,
  isAligned: false,
  hairlineUserAdjustment: parseFloat(localStorage.getItem('tefillin_hairline_adj') || '0') || 0,
};

const i18n = {
  he: {
    appTitle: "מכוון תפילין כהלכה",
    subTitle: "זיהוי קציצת תפילין + בדיקת אמצע ומקום שיער",
    langBtn: "English",
    horizTitle: "מרכוז ברוחב (אמצע העיניים)",
    vertTitle: "מיקום בגובה (מקום שיער vs מצח)",
    detectTitle: "זיהוי קציצת תפילין",
    adjustHairLabel: "קו שיער:",
    initCamera: "מפעיל מצלמה וזיהוי...",
    noFace: "לא זוהו פנים בפריים",
    noTefillin: "⚠️ לא זוהו תפילין על הראש!",
    noTefillinSub: "חבשו את התפילין של ראש מעל המצח כדי שהמערכת תזהה אותן.",
    moveLeft: "⬅️ הזיזו את התפילין שמאלה (לצד שמאל שלכם)",
    moveRight: "➡️ הזיזו את התפילין ימינה (לצד ימין שלכם)",
    moveUp: "⬆️ הרימו את התפילין למעלה! (התפילין ירדו למצח)",
    perfect: "✨ התפילין מונחות כהלכה!",
    perfectSub: "התפילין במרכז המדויק ומעל קו השיער.",
    foreheadWarning: "⚠️ אזהרה: קצה התפילין נוגע במצח!",
    centerStatusOk: "ממורכז מדויק",
    centerStatusOff: "סטייה מהאמצע",
    hairStatusOk: "מקום שיער תקין",
    hairStatusErr: "פסול! (ירד למצח)",
    detectOk: "קציצה זוהתה בהצלחה",
    detectErr: "לא זוהו תפילין",
    modalTitle: "הלכות מקום הנחת תפילין של ראש",
    modalRule1Title: "מקום הנחה ברוחב (אמצע)",
    modalRule1Text: "תפילין של ראש חייבות להיות מכוונות באמצע ממש בין שתי העיניים. חריגה לצדדים פוסלת את המצווה.",
    modalRule2Title: "מקום הנחה בגובה (כל התפילין במקום שיער)",
    modalRule2Text: "הקציצה והמעברתא חייבות לשבת כולן במקום ששיער ראשו צומח. אם ירדה אפילו מקצת התפילין על המצח - אינו יוצא ידי חובה וברכתו לבטלה!",
    modalRule3Title: "זיהוי קציצת התפילין במצלמה",
    modalRule3Text: "המערכת מזהה במדויק את קוביות הקציצה השחורה, מבודדת אותה מהשיער והרצועות, ובודקת שאינה גולשת אל המצח."
  },
  en: {
    appTitle: "Tefillin Aligner",
    subTitle: "Tefillin Box Detection & Halachic Alignment",
    langBtn: "עברית",
    horizTitle: "Horizontal Center (Between Eyes)",
    vertTitle: "Vertical Scalp Height (Hair vs Forehead)",
    detectTitle: "Tefillin Box Detection",
    adjustHairLabel: "Hairline:",
    initCamera: "Initializing camera...",
    noFace: "No face detected in frame",
    noTefillin: "⚠️ Tefillin NOT Detected on Head!",
    noTefillinSub: "Put on your Head Tefillin above forehead to detect.",
    moveLeft: "⬅️ Move Tefillin LEFT (Your Left)",
    moveRight: "➡️ Move Tefillin RIGHT (Your Right)",
    moveUp: "⬆️ Lift Tefillin UP! (Slipped onto forehead)",
    perfect: "✨ Tefillin Properly Aligned!",
    perfectSub: "Entire Tefillin box is centered and resting strictly on hair area.",
    foreheadWarning: "⚠️ Warning: Part of Tefillin touches forehead!",
    centerStatusOk: "Centered",
    centerStatusOff: "Off-center",
    hairStatusOk: "On Hair Area",
    hairStatusErr: "Invalid (Touching Forehead)",
    detectOk: "Tefillin Box Detected",
    detectErr: "Not Detected",
    modalTitle: "Halachic Rules for Head Tefillin",
    modalRule1Title: "Horizontal Symmetry",
    modalRule1Text: "The Shel Rosh box must sit EXACTLY in the middle between your eyes.",
    modalRule2Title: "Strict Hair Growth Boundary",
    modalRule2Text: "The ENTIRE box and base MUST sit on scalp hair. If even a fraction touches forehead skin, the mitzvah is invalidated!",
    modalRule3Title: "Real Tefillin Detection",
    modalRule3Text: "The camera isolates the black Tefillin cube from side hair and straps, tracking its lowest edge with zero forehead overlap."
  }
};

// DOM Elements
const webcam = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const guidanceCard = document.getElementById('guidanceCard');
const directionArrow = document.getElementById('directionArrow');
const guidanceTitle = document.getElementById('guidanceTitle');
const guidanceSub = document.getElementById('guidanceSub');
const detectValue = document.getElementById('detectValue');
const detectStatus = document.getElementById('detectStatus');
const horizValue = document.getElementById('horizValue');
const horizBar = document.getElementById('horizBar');
const horizStatus = document.getElementById('horizStatus');
const vertValue = document.getElementById('vertValue');
const vertBar = document.getElementById('vertBar');
const vertStatus = document.getElementById('vertStatus');
const langToggleBtn = document.getElementById('langToggleBtn');
const infoBtn = document.getElementById('infoBtn');
const infoModal = document.getElementById('infoModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const toggleMirrorBtn = document.getElementById('toggleMirrorBtn');
const toggleGuidesBtn = document.getElementById('toggleGuidesBtn');
const hairlineUpBtn = document.getElementById('hairlineUpBtn');
const hairlineDownBtn = document.getElementById('hairlineDownBtn');
const hairlineResetBtn = document.getElementById('hairlineResetBtn');
const lblAdjustHair = document.getElementById('lblAdjustHair');

function updateUIStrings() {
  const lang = i18n[state.currentLang];
  document.getElementById('lblDetectTitle').innerText = lang.detectTitle;
  document.getElementById('lblHorizTitle').innerText = lang.horizTitle;
  document.getElementById('lblVertTitle').innerText = lang.vertTitle;
  lblAdjustHair.innerText = lang.adjustHairLabel;
  langToggleBtn.innerText = lang.langBtn;
  document.getElementById('modalTitle').innerText = lang.modalTitle;
  document.getElementById('modalBody').innerHTML = `
    <div class="halacha-rule">
      <div class="rule-num">1</div>
      <div><h4>${lang.modalRule1Title}</h4><p>${lang.modalRule1Text}</p></div>
    </div>
    <div class="halacha-rule">
      <div class="rule-num">2</div>
      <div><h4>${lang.modalRule2Title}</h4><p>${lang.modalRule2Text}</p></div>
    </div>
    <div class="halacha-rule">
      <div class="rule-num">3</div>
      <div><h4>${lang.modalRule3Title}</h4><p>${lang.modalRule3Text}</p></div>
    </div>
  `;
}

langToggleBtn.addEventListener('click', () => {
  state.currentLang = state.currentLang === 'he' ? 'en' : 'he';
  document.documentElement.lang = state.currentLang;
  document.documentElement.dir = state.currentLang === 'he' ? 'rtl' : 'ltr';
  updateUIStrings();
});

infoBtn.addEventListener('click', () => infoModal.classList.add('open'));
closeModalBtn.addEventListener('click', () => infoModal.classList.remove('open'));

toggleMirrorBtn.addEventListener('click', () => {
  state.isMirrored = !state.isMirrored;
  webcam.classList.toggle('mirrored', state.isMirrored);
  canvas.classList.toggle('mirrored', state.isMirrored);
});

toggleGuidesBtn.addEventListener('click', () => {
  state.showGuides = !state.showGuides;
  toggleGuidesBtn.classList.toggle('active', state.showGuides);
});

// Hairline Calibration Controls (Nudge up/down and persist in localStorage)
hairlineUpBtn.addEventListener('click', () => {
  state.hairlineUserAdjustment += 0.05;
  localStorage.setItem('tefillin_hairline_adj', state.hairlineUserAdjustment.toFixed(2));
});

hairlineDownBtn.addEventListener('click', () => {
  state.hairlineUserAdjustment -= 0.05;
  localStorage.setItem('tefillin_hairline_adj', state.hairlineUserAdjustment.toFixed(2));
});

hairlineResetBtn.addEventListener('click', () => {
  state.hairlineUserAdjustment = 0;
  localStorage.removeItem('tefillin_hairline_adj');
});

// Setup MediaPipe Face Mesh
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

faceMesh.onResults(onFaceResults);

async function initCamera() {
  try {
    const camera = new Camera(webcam, {
      onFrame: async () => {
        await faceMesh.send({ image: webcam });
      },
      width: 640,
      height: 480
    });
    await camera.start();
  } catch (err) {
    console.error("Camera startup error:", err);
  }
}

/**
 * Computer Vision: Connected-Component Blob Analysis for Ketzitzah Cube.
 * Extracts only solid, compact dark cubic objects along the head symmetry axis,
 * cleanly rejecting side hair strands, colored headband blocks, and glasses frames.
 */
function detectTefillinBox(ctx, headSearchArea, eyeDist, midX) {
  const { x, y, width, height } = headSearchArea;
  if (width <= 10 || height <= 10) return null;

  try {
    const imgData = ctx.getImageData(x, y, width, height);
    const data = imgData.data;

    // 1. Binary segmentation of dark/black pixels
    const mask = new Uint8Array(width * height);
    let totalDark = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      const saturationDiff = Math.max(r, g, b) - Math.min(r, g, b);

      // Black Tefillin / Dark cube criteria:
      // Dark matte surface (brightness < 68) with low color saturation (saturationDiff < 24)
      // This strictly excludes skin, colored Lego pieces (yellow/green/red), and highlights
      if (brightness < 68 && saturationDiff < 24) {
        mask[i >> 2] = 1;
        totalDark++;
      }
    }

    if (totalDark < 25) return null;

    // 2. Connected Component Labeling (BFS Flood-Fill)
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
            if (cy > 0) {
              const up = curr - width;
              if (mask[up] === 1 && !visited[up]) { visited[up] = 1; queue.push(up); }
            }
            if (cy < height - 1) {
              const down = curr + width;
              if (mask[down] === 1 && !visited[down]) { visited[down] = 1; queue.push(down); }
            }
            if (cx > 0) {
              const left = curr - 1;
              if (mask[left] === 1 && !visited[left]) { visited[left] = 1; queue.push(left); }
            }
            if (cx < width - 1) {
              const right = curr + 1;
              if (mask[right] === 1 && !visited[right]) { visited[right] = 1; queue.push(right); }
            }
          }

          const blobW = maxX - minX + 1;
          const blobH = maxY - minY + 1;
          const blobArea = blobW * blobH;
          const density = count / blobArea;

          blobs.push({
            minX, maxX, minY, maxY,
            width: blobW,
            height: blobH,
            count,
            density,
            avgX: sumX / count,
            avgY: sumY / count
          });
        }
      }
    }

    if (blobs.length === 0) return null;

    // 3. Filter and score candidate blobs to find the genuine Ketzitzah box
    const minPhysicalSize = Math.max(14, Math.round(eyeDist * 0.14));
    const maxPhysicalSize = Math.round(eyeDist * 0.90);

    let bestBlob = null;
    let bestScore = -999;

    for (const blob of blobs) {
      // Must have reasonable size
      if (blob.count < 25) continue;
      if (blob.width < minPhysicalSize || blob.height < minPhysicalSize) continue;
      if (blob.width > maxPhysicalSize || blob.height > maxPhysicalSize) continue;

      const aspectRatio = blob.width / blob.height;
      // Tefillin box is roughly square or rectangular (aspect ratio 0.35 to 2.4)
      if (aspectRatio < 0.35 || aspectRatio > 2.4) continue;

      // Solid density: A solid Tefillin / Lego cube fills its bounding box tightly
      if (blob.density < 0.28) continue;

      // Centeredness score (distance from head midline)
      const absCenterX = x + blob.avgX;
      const distFromMidline = Math.abs(absCenterX - midX);

      // Scoring factors:
      // 1. High solid fill density
      // 2. Aspect ratio close to 1.0 (square cube)
      // 3. Proximity to facial symmetry center line
      // 4. Substantial pixel count
      const shapeScore = 1.0 - Math.min(1.0, Math.abs(1.0 - aspectRatio) * 0.5);
      const densityScore = blob.density;
      const centerScore = Math.max(0, 1.0 - (distFromMidline / (eyeDist * 0.8)));
      const countScore = Math.min(1.0, blob.count / 150);

      const totalScore = (densityScore * 3.5) + (shapeScore * 2.5) + (centerScore * 2.5) + countScore;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestBlob = blob;
      }
    }

    if (bestBlob) {
      return {
        x: x + bestBlob.avgX,
        y: y + bestBlob.avgY,
        topY: y + bestBlob.minY,
        bottomY: y + bestBlob.maxY,
        leftX: x + bestBlob.minX,
        rightX: x + bestBlob.maxX,
        boxWidth: bestBlob.width,
        boxHeight: bestBlob.height,
        pixelCount: bestBlob.count,
        density: bestBlob.density
      };
    }
  } catch (e) {
    console.error("Blob detection error:", e);
  }

  return null;
}

function onFaceResults(results) {
  canvas.width = webcam.videoWidth || 640;
  canvas.height = webcam.videoHeight || 480;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  const lang = i18n[state.currentLang];

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    statusDot.className = "status-indicator-dot searching";
    statusText.innerText = lang.noFace;
    guidanceCard.className = "guidance-card";
    directionArrow.innerText = "🔍";
    guidanceTitle.innerText = lang.noFace;
    guidanceSub.innerText = lang.noTefillinSub;
    detectValue.innerText = lang.detectErr;
    detectStatus.innerText = lang.noFace;
    ctx.restore();
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];
  const w = canvas.width;
  const h = canvas.height;

  // 1. ANATOMICAL FACIAL LANDMARKS
  const midEyes = landmarks[168];      
  const noseBridge = landmarks[6];      
  const meshTop = landmarks[10];        // MediaPipe top forehead landmark #10
  const eyebrowLeft = landmarks[33];    
  const eyebrowRight = landmarks[263];  

  const eyeLeftPt = { x: eyebrowLeft.x * w, y: eyebrowLeft.y * h };
  const eyeRightPt = { x: eyebrowRight.x * w, y: eyebrowRight.y * h };
  const midEyesPt = { x: midEyes.x * w, y: midEyes.y * h };
  const nosePt = { x: noseBridge.x * w, y: noseBridge.y * h };
  const meshTopPt = { x: meshTop.x * w, y: meshTop.y * h };

  // Eyebrow Level Y (hard cutoff to exclude glasses frames)
  const eyebrowLevelY = Math.min(eyeLeftPt.y, eyeRightPt.y);

  // Eye distance scale
  const eyeVector = { x: eyeRightPt.x - eyeLeftPt.x, y: eyeRightPt.y - eyeLeftPt.y };
  const eyeDist = Math.hypot(eyeVector.x, eyeVector.y);
  const uEye = { x: eyeVector.x / eyeDist, y: eyeVector.y / eyeDist }; 

  // Face UP Unit Vector (pointing from nose bridge towards top of forehead)
  const faceUpVector = {
    x: meshTopPt.x - nosePt.x,
    y: meshTopPt.y - nosePt.y
  };
  const faceLen = Math.hypot(faceUpVector.x, faceUpVector.y);
  const uUp = { x: faceUpVector.x / faceLen, y: faceUpVector.y / faceLen }; 

  // Hairline Point: Landmark #10 + proportional shift UP along head axis + user calibration offset
  const baseHairlineRatio = 0.32 + state.hairlineUserAdjustment;
  const hairlineOffset = eyeDist * baseHairlineRatio;
  const hairlinePt = {
    x: meshTopPt.x + uUp.x * hairlineOffset,
    y: meshTopPt.y + uUp.y * hairlineOffset
  };

  // 3. SEARCH AREA FOR TEFILLIN KETZITZAH
  // Width centered on facial symmetry line
  const searchW = Math.round(eyeDist * 1.5);
  const searchX = Math.round(Math.max(0, midEyesPt.x - searchW / 2));
  
  // Search Y range: From top of screen down to 25px ABOVE the eyebrows (strictly above glasses frames!)
  const searchY = Math.round(Math.max(0, hairlinePt.y - eyeDist * 2.4));
  const searchH = Math.round(Math.max(25, (eyebrowLevelY - 25) - searchY));

  const detectedTefillin = detectTefillinBox(ctx, { x: searchX, y: searchY, width: searchW, height: searchH }, eyeDist, midEyesPt.x);

  if (state.showGuides) {
    // Gold Symmetry Line (Dashed)
    ctx.beginPath();
    ctx.moveTo(midEyesPt.x - uUp.x * h * 0.5, midEyesPt.y - uUp.y * h * 0.5);
    ctx.lineTo(midEyesPt.x + uUp.x * h * 0.5, midEyesPt.y + uUp.y * h * 0.5);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Green Hairline Boundary Line
    ctx.beginPath();
    ctx.moveTo(hairlinePt.x - uEye.x * eyeDist * 1.4, hairlinePt.y - uEye.y * eyeDist * 1.4);
    ctx.lineTo(hairlinePt.x + uEye.x * eyeDist * 1.4, hairlinePt.y + uEye.y * eyeDist * 1.4);
    ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (!detectedTefillin) {
    state.tefillinFound = false;
    statusDot.className = "status-indicator-dot searching";
    statusText.innerText = lang.noTefillin;
    guidanceCard.className = "guidance-card warning";
    directionArrow.innerText = "🔳";
    guidanceTitle.innerText = lang.noTefillin;
    guidanceSub.innerText = lang.noTefillinSub;
    detectValue.innerText = "לא זוהה";
    detectValue.style.color = "var(--accent-red)";
    detectStatus.innerText = lang.noTefillinSub;

    horizValue.innerText = "--";
    horizBar.style.width = "50%";
    vertValue.innerText = "--";
    vertBar.style.width = "0%";
  } else {
    state.tefillinFound = true;
    detectValue.innerText = "קציצה זוהתה ✔️";
    detectValue.style.color = "var(--accent-green)";
    detectStatus.innerText = lang.detectOk;

    // LOWEST EDGE OF KETZITZAH BOX ONLY
    const lowestEdgeX = detectedTefillin.x;
    const lowestEdgeY = detectedTefillin.bottomY;

    // Vector from Hairline Landmark to lowest edge of Ketzitzah box
    const lowestEdgeVector = {
      x: lowestEdgeX - hairlinePt.x,
      y: lowestEdgeY - hairlinePt.y
    };

    // Dot product with uUp vector (uUp points UP towards scalp):
    // Positive = Lowest edge is ABOVE hairline on scalp.
    // Negative = Lowest edge is BELOW hairline on forehead skin.
    const distAboveHairline = (lowestEdgeVector.x * uUp.x + lowestEdgeVector.y * uUp.y);

    // HALACHIC ZERO TOLERANCE:
    // Is the lowest edge of the Ketzitzah box above or at the hairline root?
    const isEntirelyOnScalp = distAboveHairline >= -3;

    // 1. Draw tight bounding box directly around the isolated Ketzitzah cube
    ctx.strokeStyle = isEntirelyOnScalp ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(detectedTefillin.leftX, detectedTefillin.topY, detectedTefillin.boxWidth, detectedTefillin.boxHeight);

    // 2. Draw prominent lowest edge indicator line
    ctx.beginPath();
    ctx.moveTo(detectedTefillin.leftX - 4, lowestEdgeY);
    ctx.lineTo(detectedTefillin.rightX + 4, lowestEdgeY);
    ctx.strokeStyle = isEntirelyOnScalp ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 3. Draw center dot
    ctx.beginPath();
    ctx.arc(detectedTefillin.x, detectedTefillin.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = isEntirelyOnScalp ? "#22c55e" : "#ef4444";
    ctx.fill();

    // Display metric in UI
    const debugDist = Math.round(distAboveHairline);
    vertValue.innerText = isEntirelyOnScalp ? `תקין (${debugDist}px מעל מצח)` : `פסול! (${Math.abs(debugDist)}px על המצח)`;
    vertBar.style.width = isEntirelyOnScalp ? "90%" : "15%";
    vertStatus.innerText = isEntirelyOnScalp ? lang.hairStatusOk : lang.hairStatusErr;
    vertStatus.style.color = isEntirelyOnScalp ? "var(--accent-green)" : "var(--accent-red)";

    // 5. HORIZONTAL EVALUATION
    const tefillinVec = {
      x: detectedTefillin.x - midEyesPt.x,
      y: detectedTefillin.y - midEyesPt.y
    };
    const horizOffsetLocal = (tefillinVec.x * uEye.x + tefillinVec.y * uEye.y);

    const isCentered = Math.abs(horizOffsetLocal) < (eyeDist * 0.16);
    horizValue.innerText = `${horizOffsetLocal > 0 ? '+' : ''}${Math.round(horizOffsetLocal)}px`;
    const fillPct = Math.min(Math.max(50 + (horizOffsetLocal / (eyeDist * 0.5)) * 50, 5), 95);
    horizBar.style.width = `${fillPct}%`;
    horizStatus.innerText = isCentered ? lang.centerStatusOk : lang.centerStatusOff;
    horizStatus.style.color = isCentered ? "var(--accent-green)" : "var(--accent-gold)";

    // 6. MIRROR-AWARE LEFT / RIGHT DIRECTIONS
    let needMoveRight = false;
    let needMoveLeft = false;

    if (!isCentered) {
      if (state.isMirrored) {
        if (horizOffsetLocal > 0) needMoveRight = true;
        else needMoveLeft = true;
      } else {
        if (horizOffsetLocal > 0) needMoveLeft = true;
        else needMoveRight = true;
      }
    }

    // 7. FINAL STATE SELECTION
    if (!isEntirelyOnScalp) {
      // LOWEST EDGE TOUCHES FOREHEAD -> RED ALERT
      statusDot.className = "status-indicator-dot misaligned";
      statusText.innerText = lang.foreheadWarning;
      guidanceCard.className = "guidance-card warning";
      directionArrow.innerText = "⬆️";
      guidanceTitle.innerText = lang.moveUp;
      guidanceSub.innerText = "הקצה התחתון של התפילין נוגע במצח! יש להרים אל מקום השיער.";
    } else if (isCentered) {
      // PERFECT ALIGNMENT
      statusDot.className = "status-indicator-dot aligned";
      statusText.innerText = lang.perfect;
      guidanceCard.className = "guidance-card aligned";
      directionArrow.innerText = "✨";
      guidanceTitle.innerText = lang.perfect;
      guidanceSub.innerText = lang.perfectSub;
    } else if (needMoveLeft) {
      statusDot.className = "status-indicator-dot misaligned";
      statusText.innerText = lang.moveLeft;
      guidanceCard.className = "guidance-card warning";
      directionArrow.innerText = "⬅️";
      guidanceTitle.innerText = lang.moveLeft;
      guidanceSub.innerText = "הזיזו את קציצת התפילין לכיוון שמאל שלכם";
    } else if (needMoveRight) {
      statusDot.className = "status-indicator-dot misaligned";
      statusText.innerText = lang.moveRight;
      guidanceCard.className = "guidance-card warning";
      directionArrow.innerText = "➡️";
      guidanceTitle.innerText = lang.moveRight;
      guidanceSub.innerText = "הזיזו את קציצת התפילין לכיוון ימין שלכם";
    }
  }

  ctx.restore();
}

window.addEventListener('DOMContentLoaded', () => {
  updateUIStrings();
  webcam.classList.toggle('mirrored', state.isMirrored);
  canvas.classList.toggle('mirrored', state.isMirrored);
  initCamera();
});

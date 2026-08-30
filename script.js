/**
 * Real-Time Tefillin Detector & Strict Halachic Alignment Engine
 *
 * Upgraded Features (v2.1):
 * 1. Morphological Dilation & CCA: Bridges specular highlights, seams, and studs so black boxes form unified solid components.
 * 2. Tight Midline Centering: Constrains search width (1.0 * eyeDist) and strictly rejects off-center side blocks / temple objects.
 * 3. Enforced Physical Size: Tefillin cube must be at least 22px / 22% of eye distance.
 * 4. 3D Head-Pose Pitch Correction: Prevents hairline guide line distortion when tilting head up/down.
 * 5. Hairline Calibration Storage: Remembers custom hairline height in localStorage.
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
    appTitle: "מראת תפילין כהלכה",
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
    modalRule3Text: "המערכת מבודדת את קוביית הקציצה השחורה במרכז המצח, ומוודאת שכל שטח התפילין מונח מעל שורשי השיער."
  },
  en: {
    appTitle: "Tefillin Mirror",
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
    modalRule3Text: "The camera isolates the black Tefillin cube along the center midline and verifies zero forehead overlap."
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

// Hairline Calibration Controls
hairlineUpBtn.addEventListener('click', () => {
  state.hairlineUserAdjustment += 0.04;
  localStorage.setItem('tefillin_hairline_adj', state.hairlineUserAdjustment.toFixed(2));
});

hairlineDownBtn.addEventListener('click', () => {
  state.hairlineUserAdjustment -= 0.04;
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
  minDetectionConfidence: 0.35,
  minTrackingConfidence: 0.35
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

  // 1. Extract 3D Geometry from Shared TefillinEngine
  const geometry = TefillinEngine.analyzeFaceGeometry(landmarks, w, h, state.hairlineUserAdjustment);
  if (!geometry) { ctx.restore(); return; }

  // 2. Segment Dark Tefillin Ketzitzah Blob via TefillinEngine
  const detectionResult = TefillinEngine.detectTefillinBlob(ctx, geometry.searchArea, geometry.eyeDist, geometry.midEyesPt.x);
  const winner = detectionResult ? detectionResult.winner : null;

  // 3. Evaluate Halachic Alignment Status
  const alignment = TefillinEngine.evaluateAlignment(winner, geometry);

  // 4. Render Overlays (Guides, Bounding Box, Lowest Edge Indicator)
  TefillinEngine.renderOverlays(ctx, geometry, alignment, { showGuides: state.showGuides, showSearchBox: false });

  if (!winner) {
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

    const { isKosher, isCentered, distAboveHairline, horizOffset } = alignment;

    // Vertical Scalp Metric
    vertValue.innerText = isKosher ? `תקין (${distAboveHairline}px מעל מצח)` : `פסול! (${Math.abs(distAboveHairline)}px על המצח)`;
    vertBar.style.width = isKosher ? "90%" : "15%";
    vertStatus.innerText = isKosher ? lang.hairStatusOk : lang.hairStatusErr;
    vertStatus.style.color = isKosher ? "var(--accent-green)" : "var(--accent-red)";

    // Horizontal Alignment Metric
    horizValue.innerText = `${horizOffset > 0 ? '+' : ''}${horizOffset}px`;
    const fillPct = Math.min(Math.max(50 + (horizOffset / (geometry.eyeDist * 0.5)) * 50, 5), 95);
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

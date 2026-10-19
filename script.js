/**
 * Real-Time Tefillin Detector & Strict Halachic Alignment Engine
 */

// Diagnostic Logging: Keeps permanent startup logs from app boot + rolling recent buffer
const startupLogs = [];
const MAX_STARTUP_LOGS = 50;
const recentLogs = [];
const MAX_RECENT_LOGS = 150;

function logDiagnostic(level, ...args) {
  const timestamp = new Date().toISOString().substring(11, 23);
  const msg = args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack}`;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch (_) { return String(a); }
    }
    return String(a);
  }).join(' ');
  const formatted = `[${timestamp}] [${level}] ${msg}`;

  if (startupLogs.length < MAX_STARTUP_LOGS) {
    startupLogs.push(formatted);
  }
  recentLogs.push(formatted);
  if (recentLogs.length > MAX_RECENT_LOGS) recentLogs.shift();
}

const origConsoleLog = console.log;
const origConsoleWarn = console.warn;
const origConsoleError = console.error;
console.log = (...args) => { origConsoleLog(...args); logDiagnostic('INFO', ...args); };
console.warn = (...args) => { origConsoleWarn(...args); logDiagnostic('WARN', ...args); };
console.error = (...args) => { origConsoleError(...args); logDiagnostic('ERROR', ...args); };

// Capture unhandled errors and promise rejections
window.addEventListener('error', (event) => {
  logDiagnostic('UNCAUGHT', event.message, `at ${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  logDiagnostic('UNHANDLED_REJECTION', event.reason ? (event.reason.message || event.reason) : 'Unknown promise rejection');
});

const savedLang = localStorage.getItem('tefillin_lang');
const state = {
  currentLang: savedLang || 'he',
  isMirrored: true, // Always mirrored (behaves like standard selfie camera)
  showGuides: true,
  tefillinFound: false,
  isAligned: false,
  selectedModel: localStorage.getItem('tefillin_model') || (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.defaultModel : 'uint8')
};

// Access external translation dictionaries loaded via i18n/he.js, i18n/en.js
function getI18n() {
  if (typeof window !== 'undefined' && window.I18N) {
    return window.I18N[state.currentLang] || window.I18N.he || {};
  }
  return {};
}

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
const langToggleBtn = document.getElementById('langToggleBtn');
const modelSelect = document.getElementById('modelSelect');
const infoBtn = document.getElementById('infoBtn');
const infoModal = document.getElementById('infoModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const toggleGuidesBtn = document.getElementById('toggleGuidesBtn');
const appTitle = document.getElementById('appTitle');
const appSubTitle = document.getElementById('appSubTitle');

// Bug Report Modal Elements
const bugReportBtn = document.getElementById('bugReportBtn');
const bugModal = document.getElementById('bugModal');
const closeBugModalBtn = document.getElementById('closeBugModalBtn');
const recordBugVideoBtn = document.getElementById('recordBugVideoBtn');
const recordBugBtnText = document.getElementById('recordBugBtnText');
const recordingProgress = document.getElementById('recordingProgress');
const recordingProgressBar = document.getElementById('recordingProgressBar');
const captureBugSnapshotBtn = document.getElementById('captureBugSnapshotBtn');
const snapshotBugBtnText = document.getElementById('snapshotBugBtnText');
const bugNotesInput = document.getElementById('bugNotesInput');
const bugStatusMsg = document.getElementById('bugStatusMsg');
const bugExportActions = document.getElementById('bugExportActions');
const shareBugBtn = document.getElementById('shareBugBtn');
const downloadBugBtn = document.getElementById('downloadBugBtn');

let isCameraRunning = false;
let hasFirstFaceResult = false;

function updateUIStrings() {
  const t = getI18n();

  document.documentElement.lang = state.currentLang;
  document.documentElement.dir = t.dir || (state.currentLang === 'he' ? 'rtl' : 'ltr');
  document.title = state.currentLang === 'he' ? "מראת תפילין | Tefillin Mirror" : "Tefillin Mirror | מראת תפילין";

  if (appTitle) appTitle.innerText = t.appTitle;
  if (appSubTitle) appSubTitle.innerText = t.appSubTitle;
  if (langToggleBtn) langToggleBtn.innerText = t.langToggleLabel;

  if (modelSelect) modelSelect.title = t.modelSelectTitle || "";
  const optUint8 = document.getElementById('optModelUint8');
  if (optUint8) optUint8.innerText = t.modelInt8;
  const optFp16 = document.getElementById('optModelFp16');
  if (optFp16) optFp16.innerText = t.modelFp16;

  if (bugReportBtn) bugReportBtn.title = t.bugReportBtnTitle || "";
  if (infoBtn) infoBtn.title = t.infoBtnTitle || "";

  if (toggleGuidesBtn) {
    toggleGuidesBtn.innerText = t.toggleGuides;
    toggleGuidesBtn.title = t.toggleGuidesTitle || "";
  }

  // Initial guidance / status if not tracking yet
  if (!hasFirstFaceResult) {
    statusText.innerText = isCameraRunning ? t.searchingFace : t.cameraStarting;
    guidanceTitle.innerText = t.initialGuideTitle;
    guidanceSub.innerText = t.initialGuideSub;
  }

  // Halachic Guide Modal
  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) modalTitle.innerText = t.modalTitle;
  const modalBody = document.getElementById('modalBody');
  if (modalBody) {
    modalBody.innerHTML = `
      <div class="halacha-rule">
        <div class="rule-num">1</div>
        <div><h4>${t.modalRule1Title}</h4><p>${t.modalRule1Text}</p></div>
      </div>
      <div class="halacha-rule">
        <div class="rule-num">2</div>
        <div><h4>${t.modalRule2Title}</h4><p>${t.modalRule2Text}</p></div>
      </div>
      <div class="halacha-rule">
        <div class="rule-num">3</div>
        <div><h4>${t.modalRule3Title}</h4><p>${t.modalRule3Text}</p></div>
      </div>
    `;
  }

  // Bug Report Modal Strings
  const bugModalTitle = document.getElementById('bugModalTitle');
  if (bugModalTitle) bugModalTitle.innerText = t.bugModalTitle;
  const bugIntroText = document.getElementById('bugIntroText');
  if (bugIntroText) bugIntroText.innerText = t.bugIntro;
  if (recordBugBtnText) recordBugBtnText.innerText = t.recordVideoBtn;
  if (snapshotBugBtnText) snapshotBugBtnText.innerText = t.snapshotBtn;
  const lblBugNotes = document.getElementById('lblBugNotes');
  if (lblBugNotes) lblBugNotes.innerText = t.bugNotesLabel;
  if (bugNotesInput) bugNotesInput.placeholder = t.bugNotesPlaceholder;
  const lblShareBug = document.getElementById('lblShareBug');
  if (lblShareBug) lblShareBug.innerText = t.shareBtn;
  const lblDownloadBug = document.getElementById('lblDownloadBug');
  if (lblDownloadBug) lblDownloadBug.innerText = t.downloadBtn;

  // Footer
  const appFooterText = document.getElementById('appFooterText');
  if (appFooterText) appFooterText.innerText = t.footerText;
}

langToggleBtn.addEventListener('click', () => {
  state.currentLang = state.currentLang === 'he' ? 'en' : 'he';
  localStorage.setItem('tefillin_lang', state.currentLang);
  updateUIStrings();
});

// Model Selection & Persistence
if (modelSelect) {
  modelSelect.value = state.selectedModel;
  modelSelect.addEventListener('change', async (e) => {
    const chosen = e.target.value;
    state.selectedModel = chosen;
    localStorage.setItem('tefillin_model', chosen);
    const t = getI18n();
    statusText.innerText = typeof t.modelSwitching === 'function' ? t.modelSwitching(chosen) : `Loading ${chosen}...`;
    statusDot.className = "status-indicator-dot searching";
    try {
      await YoloEngine.loadModel(chosen);
      statusText.innerText = typeof t.modelActive === 'function' ? t.modelActive(chosen) : `Model ${chosen} ready`;
      console.log(`[App] Model switched to: ${chosen}`);
    } catch (err) {
      console.error("[App] Failed to load model:", err);
    }
  });
}

infoBtn.addEventListener('click', () => infoModal.classList.add('open'));
closeModalBtn.addEventListener('click', () => infoModal.classList.remove('open'));

// Bug Report Modal Controls
bugReportBtn.addEventListener('click', () => {
  bugStatusMsg.style.display = 'none';
  bugExportActions.style.display = 'none';
  recordingProgress.style.display = 'none';
  recordingProgressBar.style.width = '0%';
  bugModal.classList.add('open');
});
closeBugModalBtn.addEventListener('click', () => bugModal.classList.remove('open'));

// Video Stream Geometry & Overlay Stabilizer (eliminates 1-2px jitter on mobile cameras)
const videoStabilizer = TefillinEngine.createGeometryStabilizer({
  deadbandPx: 2.0,
  angleDeadbandDeg: 0.6,
  minAlpha: 0.18,
  maxAlpha: 0.85
});

toggleGuidesBtn.addEventListener('click', () => {
  state.showGuides = !state.showGuides;
  toggleGuidesBtn.classList.toggle('active', state.showGuides);
});

// Bug Reporting Diagnostic System
let recordedBugMediaBlob = null;
let recordedBugMediaType = 'video';
let generatedLogContent = '';

function buildDiagnosticLog(notes = '') {
  return [
    '================================================================',
    '                 TEFILLIN MIRROR BUG REPORT',
    '================================================================',
    `Timestamp: ${new Date().toISOString()}`,
    `User Notes: ${notes || 'None provided'}`,
    `Active Model: ${state.selectedModel}`,
    `Language: ${state.currentLang}`,
    `Mirrored: ${state.isMirrored}`,
    `Guides Enabled: ${state.showGuides}`,
    `Canvas Viewport: ${canvas.width}x${canvas.height}`,
    `Device Pixel Ratio: ${window.devicePixelRatio}`,
    `User Agent: ${navigator.userAgent}`,
    '',
    '----------------------- STARTUP LOGS (FROM APP BOOT) -----------------------',
    ...startupLogs,
    '',
    '----------------------- RECENT LOGS (LAST 150 EVENTS) -----------------------',
    ...recentLogs,
    '================================================================'
  ].join('\n');
}

recordBugVideoBtn.addEventListener('click', async () => {
  if (!canvas) return;
  recordBugVideoBtn.disabled = true;
  captureBugSnapshotBtn.disabled = true;
  recordingProgress.style.display = 'block';
  recordingProgressBar.style.width = '0%';

  const t = getI18n();
  let secondsLeft = 5;
  recordBugBtnText.innerText = `${t.recordingText} (${secondsLeft}s)`;

  try {
    const stream = canvas.captureStream ? canvas.captureStream(25) : null;
    let recorder = null;
    let chunks = [];

    if (stream && typeof MediaRecorder !== 'undefined') {
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.start();
    }

    const interval = setInterval(() => {
      secondsLeft--;
      recordingProgressBar.style.width = `${((5 - secondsLeft) / 5) * 100}%`;
      if (secondsLeft > 0) {
        recordBugBtnText.innerText = `${t.recordingText} (${secondsLeft}s)`;
      } else {
        clearInterval(interval);
        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = () => {
            recordedBugMediaBlob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
            recordedBugMediaType = 'video';
            generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
            finishBugRecording(t);
          };
          recorder.stop();
        } else {
          // Fallback snapshot if MediaRecorder is unsupported
          canvas.toBlob((blob) => {
            recordedBugMediaBlob = blob;
            recordedBugMediaType = 'image';
            generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
            finishBugRecording(t);
          }, 'image/jpeg', 0.9);
        }
      }
    }, 1000);
  } catch (err) {
    console.error("Bug recording error:", err);
    recordBugVideoBtn.disabled = false;
    captureBugSnapshotBtn.disabled = false;
    recordBugBtnText.innerText = t.recordVideoBtn;
  }
});

captureBugSnapshotBtn.addEventListener('click', () => {
  const t = getI18n();
  canvas.toBlob((blob) => {
    recordedBugMediaBlob = blob;
    recordedBugMediaType = 'image';
    generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
    finishBugRecording(t);
  }, 'image/jpeg', 0.92);
});

function finishBugRecording(t) {
  recordBugVideoBtn.disabled = false;
  captureBugSnapshotBtn.disabled = false;
  recordBugBtnText.innerText = t.recordVideoBtn;
  bugStatusMsg.innerText = t.bugSuccess;
  bugStatusMsg.style.display = 'block';
  bugExportActions.style.display = 'flex';
}

// Share Bug Report
shareBugBtn.addEventListener('click', async () => {
  if (!recordedBugMediaBlob) return;
  const ext = recordedBugMediaType === 'video' ? 'webm' : 'jpg';
  const mime = recordedBugMediaType === 'video' ? 'video/webm' : 'image/jpeg';
  const mediaFile = new File([recordedBugMediaBlob], `tefillin_mirror_bug.${ext}`, { type: mime });
  const logFile = new File([generatedLogContent], 'tefillin_mirror_logs.txt', { type: 'text/plain' });

  if (navigator.canShare && navigator.canShare({ files: [mediaFile, logFile] })) {
    try {
      await navigator.share({
        title: 'Tefillin Mirror Bug Report',
        text: 'Tefillin Mirror Diagnostic Logs & Video',
        files: [mediaFile, logFile]
      });
      return;
    } catch (_) {}
  }

  // Fallback: trigger download and open mailto
  triggerDownload(mediaFile, `tefillin_mirror_bug.${ext}`);
  triggerDownload(logFile, 'tefillin_mirror_logs.txt');
  const mailSubject = encodeURIComponent("Tefillin Mirror Bug Report");
  const mailBody = encodeURIComponent("Please find attached the downloaded video and logs.\n\n" + generatedLogContent.substring(0, 1500));
  window.open(`mailto:drozanes@gmail.com?subject=${mailSubject}&body=${mailBody}`, '_blank');
});

// Download Bug Report Files
downloadBugBtn.addEventListener('click', () => {
  if (!recordedBugMediaBlob) return;
  const ext = recordedBugMediaType === 'video' ? 'webm' : 'jpg';
  const mediaFile = new File([recordedBugMediaBlob], `tefillin_mirror_bug.${ext}`);
  const logFile = new File([generatedLogContent], 'tefillin_mirror_logs.txt', { type: 'text/plain' });
  triggerDownload(mediaFile, `tefillin_mirror_bug.${ext}`);
  triggerDownload(logFile, 'tefillin_mirror_logs.txt');
});

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const isLocalApp = (typeof window !== 'undefined' && 
    (window.location.protocol === 'capacitor:' || 
     window.location.protocol === 'file:' || 
     window.Capacitor !== undefined ||
     window.location.hostname === 'localhost'));

// Setup MediaPipe Face Mesh
const faceMesh = new FaceMesh({
  locateFile: (file) => {
    if (isLocalApp) {
      return `vendor/mediapipe/${file}`;
    }
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.35,
  minTrackingConfidence: 0.35
});

faceMesh.onResults(onFaceResults);

async function initCamera() {
  const t = getI18n();
  statusText.innerText = t.cameraStarting;
  statusDot.className = "status-indicator-dot searching";

  const onCameraFeedActive = () => {
    isCameraRunning = true;
    if (!hasFirstFaceResult) {
      statusText.innerText = getI18n().searchingFace;
      statusDot.className = "status-indicator-dot searching";
    }
  };

  webcam.addEventListener('loadeddata', onCameraFeedActive, { once: true });
  webcam.addEventListener('playing', onCameraFeedActive, { once: true });

  try {
    const camera = new Camera(webcam, {
      onFrame: async () => {
        await faceMesh.send({ image: webcam });
      },
      width: 640,
      height: 480
    });
    await camera.start();
    onCameraFeedActive();
  } catch (err) {
    console.error("Camera startup error:", err);
  }
}

// Reusable offscreen canvas for YOLO inference (eliminates per-frame DOM allocation & GC lag)
let yoloCanvas = null;
let yoloCtx = null;

async function onFaceResults(results) {
  hasFirstFaceResult = true;
  canvas.width = webcam.videoWidth || 640;
  canvas.height = webcam.videoHeight || 480;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  const t = getI18n();

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    videoStabilizer.reset();
    statusDot.className = "status-indicator-dot searching";
    statusText.innerText = t.noFace;
    guidanceCard.className = "guidance-card";
    directionArrow.innerText = "🔍";
    guidanceTitle.innerText = t.noFace;
    guidanceSub.innerText = t.noTefillinSub;
    ctx.restore();
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];
  const w = canvas.width;
  const h = canvas.height;

  // 1. Extract 3D Geometry from Shared TefillinEngine with temporal stabilization
  const geometry = TefillinEngine.analyzeFaceGeometry(landmarks, w, h, 0, ctx, { stabilizer: videoStabilizer });
  if (!geometry) { ctx.restore(); return; }

  // 2. AI Detect Tefillin via YOLO ONNX Model (DECOUPLED FOR SILKY SMOOTH FPS)
  if (!window.isYoloRunning) {
    window.isYoloRunning = true;
    
    // Reuse static canvas across frames to eliminate memory churn
    if (!yoloCanvas) {
      yoloCanvas = document.createElement('canvas');
      yoloCanvas.width = w;
      yoloCanvas.height = h;
      yoloCtx = yoloCanvas.getContext('2d', { willReadFrequently: true });
    } else if (yoloCanvas.width !== w || yoloCanvas.height !== h) {
      yoloCanvas.width = w;
      yoloCanvas.height = h;
    }
    yoloCtx.drawImage(canvas, 0, 0, w, h);

    YoloEngine.detect(yoloCanvas).then(box => {
      window.lastYoloBox = box;
      window.isYoloRunning = false;
    }).catch(err => {
      console.error("YOLO Error:", err);
      window.isYoloRunning = false;
    });
  }
  const rawWinner = window.lastYoloBox || null;
  // Head-Anchored Real-Time Tracking: projects box synchronously with live head landmarks at 30-60 FPS
  const winner = videoStabilizer.stabilizeBox(rawWinner, geometry);

  // 3. Evaluate Halachic Alignment Status
  const alignment = TefillinEngine.evaluateAlignment(winner, geometry);

  // 4. Render Overlays (Guides, Bounding Box, Lowest Edge Indicator)
  TefillinEngine.renderOverlays(ctx, geometry, alignment, { showGuides: state.showGuides, showSearchBox: false });

  if (!winner) {
    state.tefillinFound = false;
    statusDot.className = "status-indicator-dot searching";
    statusText.innerText = t.noTefillin;
    guidanceCard.className = "guidance-card warning";
    directionArrow.innerText = "🔳";
    guidanceTitle.innerText = t.noTefillin;
    guidanceSub.innerText = t.noTefillinSub;
  } else {
    state.tefillinFound = true;
    const { isKosher, isCentered, distAboveHairline, horizOffset } = alignment;

    // 5. Directional Halachic State Guidance with Explicit Movement Arrows
    if (alignment.status === 'CAMERA_TOO_LOW') {
      statusDot.className = "status-indicator-dot caution";
      statusText.innerText = t.cameraTooLow;
      guidanceCard.className = "guidance-card caution";
      directionArrow.innerText = "📐";
      guidanceTitle.innerText = t.cameraAngleTitle;
      guidanceSub.innerText = t.cameraTooLowSub;
    } else if (alignment.status === 'CAMERA_TOO_HIGH') {
      statusDot.className = "status-indicator-dot caution";
      statusText.innerText = t.cameraTooHigh;
      guidanceCard.className = "guidance-card caution";
      directionArrow.innerText = "📐";
      guidanceTitle.innerText = t.cameraAngleTitle;
      guidanceSub.innerText = t.cameraTooHighSub;
    } else if (!isKosher) {
      // LOWEST EDGE TOUCHES FOREHEAD -> RED ALERT
      statusDot.className = "status-indicator-dot misaligned";
      statusText.innerText = t.touchesForeheadAlert;
      guidanceCard.className = "guidance-card warning";
      directionArrow.innerText = "⬆️";
      guidanceTitle.innerText = t.moveUpTitle;
      guidanceSub.innerHTML = `${t.moveUpSub} <br><a href="https://www.youtube.com/watch?v=4BEhw4g_OJI" target="_blank" style="color: #ffbba6; text-decoration: underline; margin-top: 6px; display: inline-block;">${t.adjustKnotGuide}</a>`;
    } else if (alignment.status === 'OFF_CENTER') {
      // OFF CENTER -> YELLOW ALERT WITH CLEAR DIRECTION ARROWS
      statusDot.className = "status-indicator-dot caution";
      statusText.innerText = t.offCenterAlert;
      guidanceCard.className = "guidance-card caution";
      
      const isMoveLeft = horizOffset > 0;
      const arrow = isMoveLeft ? "⬅️" : "➡️";
      directionArrow.innerText = arrow;
      guidanceTitle.innerText = isMoveLeft ? t.moveLeftTitle : t.moveRightTitle;
      guidanceSub.innerText = isMoveLeft ? t.moveLeftSub : t.moveRightSub;
    } else if (alignment.warning) {
      statusDot.className = "status-indicator-dot caution";
      statusText.innerText = t.borderlineAlert;
      guidanceCard.className = "guidance-card caution";
      directionArrow.innerText = "⚠️";
      guidanceTitle.innerText = t.borderlineTitle;
      guidanceSub.innerText = t.borderlineSub;
    } else {
      // PERFECT ALIGNMENT -> GREEN
      statusDot.className = "status-indicator-dot aligned";
      statusText.innerText = t.perfectAlert;
      guidanceCard.className = "guidance-card aligned";
      directionArrow.innerText = "✨";
      guidanceTitle.innerText = t.perfectTitle;
      guidanceSub.innerText = t.perfectSub;
    }
  }

  ctx.restore();
}

window.addEventListener('DOMContentLoaded', () => {
  updateUIStrings();
  
  // 1. Launch camera and face tracking immediately for instant responsiveness
  initCamera();

  // 2. Load saved YOLO ONNX neural network in background
  YoloEngine.loadModel(state.selectedModel).catch(err => {
    console.error("YOLO model load error:", err);
  });
});

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
  const lblBugPreview = document.getElementById('lblBugPreview');
  if (lblBugPreview) lblBugPreview.innerText = t.bugPreviewLabel;
  const lblShareBug = document.getElementById('lblShareBug');
  if (lblShareBug) lblShareBug.innerText = t.shareBtn;
  const lblWhatsappBug = document.getElementById('lblWhatsappBug');
  if (lblWhatsappBug) lblWhatsappBug.innerText = t.whatsappBtn;
  const lblCopyLogsBug = document.getElementById('lblCopyLogsBug');
  if (lblCopyLogsBug) lblCopyLogsBug.innerText = t.copyLogsBtn;
  const lblEmailBug = document.getElementById('lblEmailBug');
  if (lblEmailBug) lblEmailBug.innerText = t.emailBtn;
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
const bugMediaPreviewContainer = document.getElementById('bugMediaPreviewContainer');
const bugPreviewImg = document.getElementById('bugPreviewImg');
const bugPreviewVideo = document.getElementById('bugPreviewVideo');
const whatsappBugBtn = document.getElementById('whatsappBugBtn');
const copyLogsBugBtn = document.getElementById('copyLogsBugBtn');
const emailBugBtn = document.getElementById('emailBugBtn');

bugReportBtn.addEventListener('click', () => {
  bugStatusMsg.style.display = 'none';
  bugExportActions.style.display = 'none';
  if (bugMediaPreviewContainer) bugMediaPreviewContainer.style.display = 'none';
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
    `Webcam Resolution: ${webcam ? webcam.videoWidth : 0}x${webcam ? webcam.videoHeight : 0}`,
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

function showBugMediaPreview(blob, type) {
  if (!bugMediaPreviewContainer || !bugPreviewImg || !bugPreviewVideo) return;
  bugMediaPreviewContainer.style.display = 'block';
  const url = URL.createObjectURL(blob);

  if (type === 'video') {
    bugPreviewImg.style.display = 'none';
    bugPreviewVideo.style.display = 'block';
    bugPreviewVideo.src = url;
    bugPreviewVideo.load();
  } else {
    bugPreviewVideo.style.display = 'none';
    bugPreviewImg.style.display = 'block';
    bugPreviewImg.src = url;
  }
}

function ensureCanvasHasFrame() {
  if (webcam && webcam.videoWidth > 0) {
    if (canvas.width <= 300 || canvas.height <= 150) {
      canvas.width = webcam.videoWidth;
      canvas.height = webcam.videoHeight;
    }
    if (!hasFirstFaceResult) {
      ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
    }
  }
}

recordBugVideoBtn.addEventListener('click', async () => {
  if (!canvas) return;
  ensureCanvasHasFrame();
  recordBugVideoBtn.disabled = true;
  captureBugSnapshotBtn.disabled = true;
  recordingProgress.style.display = 'block';
  recordingProgressBar.style.width = '0%';

  const t = getI18n();
  let secondsLeft = 5;
  recordBugBtnText.innerText = `${t.recordingText} (${secondsLeft}s)`;

  // Continuously paint webcam frames during recording if FaceMesh results are pending
  let liveRenderTimer = null;
  if (!hasFirstFaceResult) {
    liveRenderTimer = setInterval(() => {
      ensureCanvasHasFrame();
    }, 40);
  }

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
        if (liveRenderTimer) clearInterval(liveRenderTimer);

        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = () => {
            recordedBugMediaBlob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
            recordedBugMediaType = 'video';
            generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
            showBugMediaPreview(recordedBugMediaBlob, 'video');
            finishBugRecording(t);
          };
          recorder.stop();
        } else {
          // Fallback snapshot if MediaRecorder is unsupported
          canvas.toBlob((blob) => {
            recordedBugMediaBlob = blob;
            recordedBugMediaType = 'image';
            generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
            showBugMediaPreview(recordedBugMediaBlob, 'image');
            finishBugRecording(t);
          }, 'image/jpeg', 0.9);
        }
      }
    }, 1000);
  } catch (err) {
    console.error("Bug recording error:", err);
    if (liveRenderTimer) clearInterval(liveRenderTimer);
    recordBugVideoBtn.disabled = false;
    captureBugSnapshotBtn.disabled = false;
    recordBugBtnText.innerText = t.recordVideoBtn;
  }
});

captureBugSnapshotBtn.addEventListener('click', () => {
  const t = getI18n();
  ensureCanvasHasFrame();
  canvas.toBlob((blob) => {
    recordedBugMediaBlob = blob;
    recordedBugMediaType = 'image';
    generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
    showBugMediaPreview(recordedBugMediaBlob, 'image');
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 1. Share via Native Share Sheet (WhatsApp, Gmail, etc.)
shareBugBtn.addEventListener('click', async () => {
  if (!recordedBugMediaBlob) return;
  const ext = recordedBugMediaType === 'video' ? 'webm' : 'jpg';
  const mime = recordedBugMediaType === 'video' ? 'video/webm' : 'image/jpeg';
  const mediaFilename = `tefillin_mirror_bug.${ext}`;
  const logFilename = 'tefillin_mirror_logs.txt';

  // Capacitor Native Share
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share && window.Capacitor.Plugins.Filesystem) {
    try {
      const { Share, Filesystem } = window.Capacitor.Plugins;
      const mediaB64 = await blobToBase64(recordedBugMediaBlob);
      const mediaRes = await Filesystem.writeFile({
        path: mediaFilename,
        data: mediaB64,
        directory: 'CACHE'
      });

      const logB64 = btoa(unescape(encodeURIComponent(generatedLogContent)));
      const logRes = await Filesystem.writeFile({
        path: logFilename,
        data: logB64,
        directory: 'CACHE'
      });

      await Share.share({
        title: 'Tefillin Mirror Bug Report',
        text: 'Tefillin Mirror Diagnostic Logs & Media',
        files: [mediaRes.uri, logRes.uri],
        dialogTitle: 'Share Bug Report via WhatsApp, Gmail...'
      });
      return;
    } catch (capErr) {
      console.warn("Capacitor Share error, trying Web Share fallback:", capErr);
    }
  }

  // Web Share API fallback
  const mediaFile = new File([recordedBugMediaBlob], mediaFilename, { type: mime });
  const logFile = new File([generatedLogContent], logFilename, { type: 'text/plain' });
  if (navigator.canShare && navigator.canShare({ files: [mediaFile, logFile] })) {
    try {
      await navigator.share({
        title: 'Tefillin Mirror Bug Report',
        text: 'Tefillin Mirror Diagnostic Logs & Media',
        files: [mediaFile, logFile]
      });
      return;
    } catch (_) {}
  }

  // Final fallback: open WhatsApp directly
  openWhatsAppReport();
});

// 2. Direct WhatsApp Share
function openWhatsAppReport() {
  const notes = bugNotesInput.value || "None provided";
  const firstError = startupLogs.find(l => l.includes('[ERROR]')) || "No explicit crash in logs";
  const summaryMsg = `*Tefillin Mirror Bug Report*\n` +
    `• Model: ${state.selectedModel}\n` +
    `• Lang: ${state.currentLang}\n` +
    `• Notes: ${notes}\n` +
    `• Diagnostic: ${firstError.substring(0, 250)}\n` +
    `• Time: ${new Date().toISOString()}`;
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryMsg)}`;
  window.open(waUrl, '_blank');
}
if (whatsappBugBtn) whatsappBugBtn.addEventListener('click', openWhatsAppReport);

// 3. Copy Logs to Clipboard
if (copyLogsBugBtn) {
  copyLogsBugBtn.addEventListener('click', async () => {
    const t = getI18n();
    try {
      await navigator.clipboard.writeText(generatedLogContent);
      bugStatusMsg.innerText = t.logsCopied;
      bugStatusMsg.style.display = 'block';
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = generatedLogContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      bugStatusMsg.innerText = t.logsCopied;
      bugStatusMsg.style.display = 'block';
    }
  });
}

// 4. Email Report
if (emailBugBtn) {
  emailBugBtn.addEventListener('click', () => {
    const notes = bugNotesInput.value || "None provided";
    const mailSubject = encodeURIComponent("Tefillin Mirror Bug Report");
    const firstError = startupLogs.find(l => l.includes('[ERROR]')) || "";
    const mailBody = encodeURIComponent(
      `Tefillin Mirror Bug Report\n\n` +
      `Notes: ${notes}\n` +
      `Active Model: ${state.selectedModel}\n` +
      `Language: ${state.currentLang}\n` +
      `Viewport: ${canvas.width}x${canvas.height}\n` +
      `Timestamp: ${new Date().toISOString()}\n\n` +
      (firstError ? `Error: ${firstError}\n\n` : '') +
      `Please find attached files or copied logs.`
    );
    window.open(`mailto:drozanes@gmail.com?subject=${mailSubject}&body=${mailBody}`, '_blank');
  });
}

// 5. Download Bug Report Files
downloadBugBtn.addEventListener('click', async () => {
  if (!recordedBugMediaBlob) return;
  const t = getI18n();
  const ext = recordedBugMediaType === 'video' ? 'webm' : 'jpg';
  const mediaFilename = `tefillin_mirror_bug.${ext}`;
  const logFilename = 'tefillin_mirror_logs.txt';

  // Capacitor Native File Saving
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
    try {
      const { Filesystem } = window.Capacitor.Plugins;
      const mediaB64 = await blobToBase64(recordedBugMediaBlob);
      await Filesystem.writeFile({
        path: mediaFilename,
        data: mediaB64,
        directory: 'DOCUMENTS',
        recursive: true
      });
      const logB64 = btoa(unescape(encodeURIComponent(generatedLogContent)));
      await Filesystem.writeFile({
        path: logFilename,
        data: logB64,
        directory: 'DOCUMENTS',
        recursive: true
      });
      bugStatusMsg.innerText = t.downloadSuccess;
      bugStatusMsg.style.display = 'block';
      return;
    } catch (fsErr) {
      console.warn("Capacitor Filesystem download error:", fsErr);
    }
  }

  // Web Browser Download
  const mediaFile = new File([recordedBugMediaBlob], mediaFilename);
  const logFile = new File([generatedLogContent], logFilename, { type: 'text/plain' });
  triggerDownload(mediaFile, mediaFilename);
  triggerDownload(logFile, logFilename);
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

// Setup MediaPipe Face Mesh using the verified official CDN distribution
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: false, // Disabled iris tracking models: saves 40% CPU/GPU overhead on mobile
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

  let isFrameProcessing = false;

  try {
    const camera = new Camera(webcam, {
      onFrame: async () => {
        if (isFrameProcessing) return;
        if (webcam.readyState < 2 || !webcam.videoWidth || !webcam.videoHeight) {
          return;
        }
        isFrameProcessing = true;
        try {
          await faceMesh.send({ image: webcam });
        } catch (frameErr) {
          console.error("[FaceMesh Frame Error]:", frameErr);
        } finally {
          isFrameProcessing = false;
        }
      },
      width: 640,
      height: 480
    });
    await camera.start();
    onCameraFeedActive();
  } catch (err) {
    console.error("Camera startup error:", err);
    statusText.innerText = "שגיאה במצלמה: " + (err.message || err);
    statusDot.className = "status-indicator-dot misaligned";
  }
}

// Reusable offscreen canvas for YOLO inference (eliminates per-frame DOM allocation & GC lag)
let yoloCanvas = null;
let yoloCtx = null;

async function onFaceResults(results) {
  hasFirstFaceResult = true;
  const vw = webcam.videoWidth || 640;
  const vh = webcam.videoHeight || 480;
  if (canvas.width !== vw || canvas.height !== vh) {
    canvas.width = vw;
    canvas.height = vh;
  }

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

  // 2. AI Detect Tefillin via YOLO ONNX Model (throttled to 4Hz; Head-anchored tracking handles 60FPS)
  const now = performance.now();
  if (!window.lastYoloTime) window.lastYoloTime = 0;
  
  if (!window.isYoloRunning && (now - window.lastYoloTime >= 250)) {
    window.isYoloRunning = true;
    window.lastYoloTime = now;

    YoloEngine.detect(canvas).then(box => {
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

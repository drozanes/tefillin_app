/**
 * Real-Time Tefillin Detector & Strict Halachic Alignment Engine
 */

// Diagnostic Logging Ring Buffer (records up to 150 recent events for bug reporting)
const diagnosticLogs = [];
const MAX_DIAGNOSTIC_LOGS = 150;
function logDiagnostic(level, ...args) {
  const timestamp = new Date().toISOString().substring(11, 23);
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  diagnosticLogs.push(`[${timestamp}] [${level}] ${msg}`);
  if (diagnosticLogs.length > MAX_DIAGNOSTIC_LOGS) diagnosticLogs.shift();
}
const origConsoleLog = console.log;
const origConsoleWarn = console.warn;
const origConsoleError = console.error;
console.log = (...args) => { origConsoleLog(...args); logDiagnostic('INFO', ...args); };
console.warn = (...args) => { origConsoleWarn(...args); logDiagnostic('WARN', ...args); };
console.error = (...args) => { origConsoleError(...args); logDiagnostic('ERROR', ...args); };

const state = {
  currentLang: 'he',
  isMirrored: true, // Always mirrored (behaves like standard selfie camera)
  showGuides: true,
  tefillinFound: false,
  isAligned: false,
  selectedModel: localStorage.getItem('tefillin_model') || (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.defaultModel : 'uint8')
};

const i18n = {
  he: {
    appTitle: "מראת תפילין",
    subTitle: "זיהוי תפילין + בדיקת אמצע ומקום שיער",
    langBtn: "English",
    initCamera: "מפעיל מצלמה וזיהוי...",
    noFace: "לא זוהו פנים בפריים",
    noTefillin: "⚠️ לא זוהו תפילין על הראש!",
    noTefillinSub: "חבשו את התפילין של ראש מעל המצח כדי שהמערכת תזהה אותן.",
    moveLeft: "⬅️ הזיזו את התפילין שמאלה (לצד שמאל שלכם)",
    moveRight: "➡️ הזיזו את התפילין ימינה (לצד ימין שלכם)",
    moveUp: "⬆️ הרימו את התפילין למעלה! (התפילין ירדו למצח)",
    perfect: "✨ התפילין מונחות כהלכה!",
    perfectSub: "התפילין במרכז המדויק ומעל קו השיער.",
    foreheadWarning: "⬆️ אזהרה: התפילין נוגעות במצח!",
    modalTitle: "הלכות מקום הנחת תפילין של ראש",
    modalRule1Title: "מקום הנחה ברוחב (אמצע)",
    modalRule1Text: "תפילין של ראש חייבות להיות מכוונות באמצע ממש בין שתי העיניים. חריגה לצדדים פוסלת את המצווה.",
    modalRule2Title: "מקום הנחה בגובה (כל התפילין במקום שיער)",
    modalRule2Text: "התפילין והמעברתא חייבות לשבת כולן במקום ששיער ראשו צומח. אם ירדה אפילו מקצת התפילין על המצח - אינו יוצא ידי חובה וברכתו לבטלה!",
    modalRule3Title: "זיהוי התפילין במצלמה",
    modalRule3Text: "המערכת מזהה את התפילין במרכז המצח, ומוודאת שכל שטח התפילין מונח מעל שורשי השיער.",
    bugModalTitle: "🐞 דיווח על בעיה",
    bugIntro: "נתקלתם בבעיה בזיהוי התפילין או ביציבות? באפשרותכם להקליט סרטון קצר (5 שניות) ולשלוח לוגים טכניים כדי שנוכל לתקן זאת בהקדם.",
    recordVideoBtn: "הקלט 5 שניות וידאו ושתף לוגים",
    recordingText: "מקליט וידאו... ",
    snapshotBtn: "צלם תמונת מסך ולוגים בלבד",
    shareBtn: "שתף (WhatsApp / Gmail)",
    downloadBtn: "הורד קובץ",
    bugSuccess: "הדוח מוכן! ניתן לשתף או להוריד כעת."
  },
  en: {
    appTitle: "Tefillin Mirror",
    subTitle: "Tefillin Detection & Halachic Alignment",
    langBtn: "עברית",
    initCamera: "Initializing camera...",
    noFace: "No face detected in frame",
    noTefillin: "⚠️ Tefillin NOT Detected on Head!",
    noTefillinSub: "Put on your Head Tefillin above forehead to detect.",
    moveLeft: "⬅️ Move Tefillin LEFT (Your Left)",
    moveRight: "➡️ Move Tefillin RIGHT (Your Right)",
    moveUp: "⬆️ Lift Tefillin UP! (Slipped onto forehead)",
    perfect: "✨ Tefillin Properly Aligned!",
    perfectSub: "Entire Tefillin box is centered and resting strictly on hair area.",
    foreheadWarning: "⬆️ Warning: Tefillin touches forehead!",
    modalTitle: "Halachic Rules for Head Tefillin",
    modalRule1Title: "Horizontal Symmetry",
    modalRule1Text: "The Shel Rosh Tefillin must sit EXACTLY in the middle between your eyes.",
    modalRule2Title: "Strict Hair Growth Boundary",
    modalRule2Text: "The ENTIRE Tefillin and base MUST sit on scalp hair. If even a fraction touches forehead skin, the mitzvah is invalidated!",
    modalRule3Title: "Tefillin Detection in Camera",
    modalRule3Text: "The camera detects the Head Tefillin and verifies that all parts rest strictly on the hair growth area.",
    bugModalTitle: "🐞 Report an Issue",
    bugIntro: "Having trouble with detection or stability? You can record a quick 5-second video clip and send technical logs so we can fix it quickly.",
    recordVideoBtn: "Record 5s Video & Share Logs",
    recordingText: "Recording clip... ",
    snapshotBtn: "Capture Snapshot & Logs Only",
    shareBtn: "Share (WhatsApp / Gmail)",
    downloadBtn: "Download File",
    bugSuccess: "Report package ready! You can now share or download."
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
const langToggleBtn = document.getElementById('langToggleBtn');
const modelSelect = document.getElementById('modelSelect');
const infoBtn = document.getElementById('infoBtn');
const infoModal = document.getElementById('infoModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const toggleGuidesBtn = document.getElementById('toggleGuidesBtn');
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

function updateUIStrings() {
  const lang = i18n[state.currentLang];
  if (appSubTitle) appSubTitle.innerText = lang.subTitle;
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

  // Bug Modal Strings
  document.getElementById('bugModalTitle').innerText = lang.bugModalTitle;
  document.getElementById('bugIntroText').innerText = lang.bugIntro;
  recordBugBtnText.innerText = lang.recordVideoBtn;
  snapshotBugBtnText.innerText = lang.snapshotBtn;
  document.getElementById('lblShareBug').innerText = lang.shareBtn;
  document.getElementById('lblDownloadBug').innerText = lang.downloadBtn;
}

langToggleBtn.addEventListener('click', () => {
  state.currentLang = state.currentLang === 'he' ? 'en' : 'he';
  document.documentElement.lang = state.currentLang;
  document.documentElement.dir = state.currentLang === 'he' ? 'rtl' : 'ltr';
  updateUIStrings();
});

// Model Selection & Persistence
if (modelSelect) {
  modelSelect.value = state.selectedModel;
  modelSelect.addEventListener('change', async (e) => {
    const chosen = e.target.value;
    state.selectedModel = chosen;
    localStorage.setItem('tefillin_model', chosen);
    statusText.innerText = state.currentLang === 'he' ? `טוען מודל ${chosen}...` : `Loading ${chosen} model...`;
    statusDot.className = "status-indicator-dot searching";
    try {
      await YoloEngine.loadModel(chosen);
      statusText.innerText = state.currentLang === 'he' ? `מודל ${chosen} מוכן` : `Model ${chosen} active`;
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
    '----------------------- RECENT LOGS -----------------------',
    ...diagnosticLogs,
    '================================================================'
  ].join('\n');
}

recordBugVideoBtn.addEventListener('click', async () => {
  if (!canvas) return;
  recordBugVideoBtn.disabled = true;
  captureBugSnapshotBtn.disabled = true;
  recordingProgress.style.display = 'block';
  recordingProgressBar.style.width = '0%';

  const lang = i18n[state.currentLang];
  let secondsLeft = 5;
  recordBugBtnText.innerText = `${lang.recordingText} (${secondsLeft}s)`;

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
        recordBugBtnText.innerText = `${lang.recordingText} (${secondsLeft}s)`;
      } else {
        clearInterval(interval);
        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = () => {
            recordedBugMediaBlob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
            recordedBugMediaType = 'video';
            generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
            finishBugRecording(lang);
          };
          recorder.stop();
        } else {
          // Fallback snapshot if MediaRecorder is unsupported
          canvas.toBlob((blob) => {
            recordedBugMediaBlob = blob;
            recordedBugMediaType = 'image';
            generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
            finishBugRecording(lang);
          }, 'image/jpeg', 0.9);
        }
      }
    }, 1000);
  } catch (err) {
    console.error("Bug recording error:", err);
    recordBugVideoBtn.disabled = false;
    captureBugSnapshotBtn.disabled = false;
    recordBugBtnText.innerText = lang.recordVideoBtn;
  }
});

captureBugSnapshotBtn.addEventListener('click', () => {
  canvas.toBlob((blob) => {
    recordedBugMediaBlob = blob;
    recordedBugMediaType = 'image';
    generatedLogContent = buildDiagnosticLog(bugNotesInput.value);
    finishBugRecording(i18n[state.currentLang]);
  }, 'image/jpeg', 0.92);
});

function finishBugRecording(lang) {
  recordBugVideoBtn.disabled = false;
  captureBugSnapshotBtn.disabled = false;
  recordBugBtnText.innerText = lang.recordVideoBtn;
  bugStatusMsg.innerText = lang.bugSuccess;
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

// Reusable offscreen canvas for YOLO inference (eliminates per-frame DOM allocation & GC lag)
let yoloCanvas = null;
let yoloCtx = null;

async function onFaceResults(results) {
  canvas.width = webcam.videoWidth || 640;
  canvas.height = webcam.videoHeight || 480;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  const lang = i18n[state.currentLang];

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    videoStabilizer.reset();
    statusDot.className = "status-indicator-dot searching";
    statusText.innerText = lang.noFace;
    guidanceCard.className = "guidance-card";
    directionArrow.innerText = "🔍";
    guidanceTitle.innerText = lang.noFace;
    guidanceSub.innerText = lang.noTefillinSub;
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
    statusText.innerText = lang.noTefillin;
    guidanceCard.className = "guidance-card warning";
    directionArrow.innerText = "🔳";
    guidanceTitle.innerText = lang.noTefillin;
    guidanceSub.innerText = lang.noTefillinSub;
  } else {
    state.tefillinFound = true;
    const { isKosher, isCentered, distAboveHairline, horizOffset } = alignment;

    // 5. Directional Halachic State Guidance with Explicit Movement Arrows
    if (alignment.status === 'CAMERA_TOO_LOW' || alignment.status === 'CAMERA_TOO_HIGH') {
      statusDot.className = "status-indicator-dot caution";
      statusText.innerText = alignment.status === 'CAMERA_TOO_LOW' 
        ? (state.currentLang === 'he' ? "מצלמה נמוכה מדי" : "Camera Too Low") 
        : (state.currentLang === 'he' ? "מצלמה גבוהה מדי" : "Camera Too High");
      guidanceCard.className = "guidance-card caution";
      directionArrow.innerText = "📐";
      guidanceTitle.innerText = state.currentLang === 'he' ? "📐 כווננו את גובה המצלמה" : "📐 Adjust Camera Height";
      guidanceSub.innerText = alignment.direction;
    } else if (!isKosher) {
      // LOWEST EDGE TOUCHES FOREHEAD -> RED ALERT
      statusDot.className = "status-indicator-dot misaligned";
      statusText.innerText = state.currentLang === 'he' ? "⬆️ נוגע במצח" : "⬆️ Touches Forehead";
      guidanceCard.className = "guidance-card warning";
      directionArrow.innerText = "⬆️";
      guidanceTitle.innerText = state.currentLang === 'he' ? "⬆️ הרימו את התפילין למעלה!" : "⬆️ Move Tefillin UP!";
      guidanceSub.innerHTML = state.currentLang === 'he' 
        ? `התפילין נוגעות במצח! יש להרים אל מקום השיער. <br><a href="https://www.youtube.com/watch?v=4BEhw4g_OJI" target="_blank" style="color: #ffbba6; text-decoration: underline; margin-top: 6px; display: inline-block;">🎥 מדריך: איך להקטין את הקשר</a>`
        : `Tefillin touches forehead! Move up onto hair area.`;
    } else if (alignment.status === 'OFF_CENTER') {
      // OFF CENTER -> YELLOW ALERT WITH CLEAR DIRECTION ARROWS
      statusDot.className = "status-indicator-dot caution";
      statusText.innerText = state.currentLang === 'he' ? "לא ממורכז" : "Off-center";
      guidanceCard.className = "guidance-card caution";
      
      const isMoveLeft = horizOffset > 0;
      const arrow = isMoveLeft ? "⬅️" : "➡️";
      directionArrow.innerText = arrow;
      guidanceTitle.innerText = `${arrow} ${isMoveLeft ? (state.currentLang === 'he' ? "הזיזו את התפילין שמאלה" : "Move Tefillin LEFT") : (state.currentLang === 'he' ? "הזיזו את התפילין ימינה" : "Move Tefillin RIGHT")}`;
      guidanceSub.innerText = isMoveLeft 
        ? (state.currentLang === 'he' ? "הזיזו את התפילין שמאלה (לצד שמאל שלכם)" : "Move Tefillin to your left") 
        : (state.currentLang === 'he' ? "הזיזו את התפילין ימינה (לצד ימין שלכם)" : "Move Tefillin to your right");
    } else if (alignment.warning) {
      statusDot.className = "status-indicator-dot caution";
      statusText.innerText = state.currentLang === 'he' ? "גבולי" : "Borderline";
      guidanceCard.className = "guidance-card caution";
      directionArrow.innerText = "⚠️";
      guidanceTitle.innerText = state.currentLang === 'he' ? "⚠️ קרוב מאוד למצח" : "⚠️ Very Close to Forehead";
      guidanceSub.innerText = state.currentLang === 'he' ? "התפילין במקום שיער אך קרובות מאוד לגבול." : "Tefillin rests on hair but very close to border.";
    } else {
      // PERFECT ALIGNMENT -> GREEN
      statusDot.className = "status-indicator-dot aligned";
      statusText.innerText = lang.perfect;
      guidanceCard.className = "guidance-card aligned";
      directionArrow.innerText = "✨";
      guidanceTitle.innerText = lang.perfect;
      guidanceSub.innerText = lang.perfectSub;
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

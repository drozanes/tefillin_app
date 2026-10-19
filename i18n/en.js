/**
 * English Translations for Tefillin Mirror
 */
window.I18N = window.I18N || {};
window.I18N.en = {
  dir: "ltr",
  langName: "English",
  langToggleLabel: "עברית",
  appTitle: "Tefillin Mirror",
  appSubTitle: "Tefillin Detection & Halachic Alignment",
  modelSelectTitle: "Select AI Model",
  modelInt8: "⚡ INT8 (Fast)",
  modelFp16: "🎯 FP16 (Accurate)",
  modelSwitching: (m) => `Loading ${m} model...`,
  modelActive: (m) => `Model ${m} ready`,

  // Camera & Detection States
  cameraStarting: "Starting camera...",
  searchingFace: "Looking for face...",
  noFace: "No face detected in frame",
  noTefillin: "⚠️ Tefillin NOT Detected on Head!",
  noTefillinSub: "Put on your Head Tefillin above forehead to detect.",
  initialGuideTitle: "Please put on Head Tefillin",
  initialGuideSub: "System is detecting Tefillin above forehead...",

  // Directional Halachic Guidance with Arrows
  moveUpTitle: "⬆️ Move Tefillin UP!",
  moveUpSub: "Tefillin touches forehead! Move up onto hair area.",
  adjustKnotGuide: "🎥 Guide: How to adjust the knot",
  moveLeftTitle: "⬅️ Move Tefillin LEFT",
  moveLeftSub: "Move Tefillin to your left side",
  moveRightTitle: "➡️ Move Tefillin RIGHT",
  moveRightSub: "Move Tefillin to your right side",
  borderlineTitle: "⚠️ Very Close to Forehead",
  borderlineSub: "Tefillin rests on hair area, but very close to the hairline.",
  perfectTitle: "✨ Tefillin Properly Aligned!",
  perfectSub: "Entire Tefillin is centered and resting strictly on hair area.",
  cameraAngleTitle: "📐 Adjust Camera Height",
  cameraTooLow: "📐 Camera Too Low",
  cameraTooLowSub: "📐 Camera too low - please hold device at eye level",
  cameraTooHigh: "📐 Camera Too High",
  cameraTooHighSub: "📐 Camera too high - please hold device at eye level",

  // Status Badge Alerts
  touchesForeheadAlert: "⬆️ Touches Forehead",
  offCenterAlert: "Off-center",
  borderlineAlert: "Borderline",
  perfectAlert: "Properly Aligned",

  // Camera Controls
  toggleGuides: "🎯 Guidelines",
  toggleGuidesTitle: "Show/Hide Guidelines",
  infoBtnTitle: "Halachic Guide",
  bugReportBtnTitle: "Report Bug",

  // Halachic Guide Modal
  modalTitle: "Halachic Rules for Head Tefillin",
  modalRule1Title: "Horizontal Symmetry",
  modalRule1Text: "The Shel Rosh Tefillin must sit EXACTLY in the middle between your eyes. Lateral deviation invalidates the mitzvah.",
  modalRule2Title: "Strict Hair Growth Boundary",
  modalRule2Text: "The ENTIRE Tefillin and base MUST sit on scalp hair. If even a fraction touches forehead skin, the mitzvah is invalidated!",
  modalRule3Title: "Real-Time Camera Verification",
  modalRule3Text: "The system identifies the Head Tefillin and verifies that all parts rest strictly on the hair growth area.",

  // Bug Report Modal
  bugModalTitle: "🐞 Report an Issue",
  bugIntro: "Having trouble with detection or stability? Record a quick 5-second video clip or capture a snapshot, and share diagnostic logs directly to WhatsApp or Email.",
  recordVideoBtn: "Record 5s Video & Share",
  recordingText: "Recording clip... ",
  snapshotBtn: "Capture Snapshot & Logs",
  bugNotesLabel: "Brief description (optional):",
  bugNotesPlaceholder: "e.g., Tefillin is placed correctly but marked invalid",
  bugPreviewLabel: "Preview of captured media:",
  shareBtn: "Share (WhatsApp / Apps)",
  whatsappBtn: "WhatsApp",
  copyLogsBtn: "Copy Logs",
  emailBtn: "Email",
  downloadBtn: "Download File",
  bugSuccess: "Report package ready! Choose how to share:",
  logsCopied: "✅ Logs copied to clipboard successfully!",
  downloadSuccess: "✅ Files saved to device successfully!",

  // Footer
  footerText: "Tefillin Mirror • Real-Time Halachic Tefillin Alignment"
};

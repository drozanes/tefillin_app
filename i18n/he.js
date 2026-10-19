/**
 * Hebrew Translations for Tefillin Mirror
 */
window.I18N = window.I18N || {};
window.I18N.he = {
  dir: "rtl",
  langName: "עברית",
  langToggleLabel: "English",
  appTitle: "מראת תפילין",
  appSubTitle: "זיהוי תפילין + בדיקת אמצע ומקום שיער",
  modelSelectTitle: "בחר מודל זיהוי",
  modelInt8: "⚡ INT8 (מהיר)",
  modelFp16: "🎯 FP16 (מדויק)",
  modelSwitching: (m) => `טוען מודל ${m}...`,
  modelActive: (m) => `מודל ${m} מוכן`,

  // Camera & Detection States
  cameraStarting: "מפעיל מצלמה...",
  searchingFace: "מחפש פנים...",
  noFace: "לא זוהו פנים בפריים",
  noTefillin: "⚠️ לא זוהו תפילין על הראש!",
  noTefillinSub: "חבשו את התפילין של ראש מעל המצח כדי שהמערכת תזהה אותן.",
  initialGuideTitle: "אנא הניחו את התפילין של ראש",
  initialGuideSub: "המערכת מזהה את התפילין מעל המצח...",

  // Directional Halachic Guidance with Arrows
  moveUpTitle: "⬆️ הרימו את התפילין למעלה!",
  moveUpSub: "התפילין נוגעות במצח! יש להרים אל מקום השיער.",
  adjustKnotGuide: "🎥 מדריך: איך להקטין את הקשר",
  moveLeftTitle: "⬅️ הזיזו את התפילין שמאלה",
  moveLeftSub: "הזיזו את התפילין שמאלה (לצד שמאל שלכם)",
  moveRightTitle: "➡️ הזיזו את התפילין ימינה",
  moveRightSub: "הזיזו את התפילין ימינה (לצד ימין שלכם)",
  borderlineTitle: "⚠️ קרוב מאוד למצח",
  borderlineSub: "התפילין במקום שיער אך קרובות מאוד לגבול.",
  perfectTitle: "✨ התפילין מונחות כהלכה!",
  perfectSub: "התפילין במרכז המדויק ומעל קו השיער.",
  cameraAngleTitle: "📐 כווננו את גובה המצלמה",
  cameraTooLow: "📐 מצלמה נמוכה מדי",
  cameraTooLowSub: "📐 מצלמה נמוכה מדי - יש להחזיק את המכשיר מול הפנים בגובה העיניים",
  cameraTooHigh: "📐 מצלמה גבוהה מדי",
  cameraTooHighSub: "📐 מצלמה גבוהה מדי - יש להחזיק את המכשיר מול הפנים בגובה העיניים",

  // Status Badge Alerts
  touchesForeheadAlert: "⬆️ נוגע במצח",
  offCenterAlert: "לא ממורכז",
  borderlineAlert: "גבולי",
  perfectAlert: "מונח כהלכה",

  // Camera Controls
  toggleGuides: "🎯 קווי עזר",
  toggleGuidesTitle: "הצג/הסתר קווי עזר",
  infoBtnTitle: "הלכות תפילין",
  bugReportBtnTitle: "דיווח על בעיה",

  // Halachic Guide Modal
  modalTitle: "הלכות מקום הנחת תפילין של ראש",
  modalRule1Title: "מקום הנחה ברוחב (אמצע)",
  modalRule1Text: "תפילין של ראש חייבות להיות מכוונות באמצע ממש בין שתי העיניים. חריגה לצדדים פוסלת את המצווה.",
  modalRule2Title: "מקום הנחה בגובה (כל התפילין במקום שיער)",
  modalRule2Text: "התפילין והמעברתא חייבות לשבת כולן במקום ששיער ראשו צומח. אם ירדה אפילו מקצת התפילין על המצח - אינו יוצא ידי חובה וברכתו לבטלה!",
  modalRule3Title: "זיהוי התפילין במצלמה",
  modalRule3Text: "המערכת מזהה את התפילין במרכז המצח, ומוודאת שכל שטח התפילין מונח מעל שורשי השיער.",

  // Bug Report Modal
  bugModalTitle: "🐞 דיווח על בעיה",
  bugIntro: "נתקלתם בבעיה בזיהוי התפילין או ביציבות? באפשרותכם להקליט סרטון קצר (5 שניות) או לצלם תמונה, ולשתף לוגים טכניים ישירות ל-WhatsApp או במייל.",
  recordVideoBtn: "הקלט 5 שניות וידאו ושתף",
  recordingText: "מקליט וידאו... ",
  snapshotBtn: "צלם תמונת מסך ולוגים",
  bugNotesLabel: "תיאור קצר (לא חובה):",
  bugNotesPlaceholder: "למשל: התפילין במקום הנכון אך זוהו כפסולות",
  bugPreviewLabel: "תצוגה מקדימה של מה שהוקלט:",
  shareBtn: "שתף (WhatsApp / אפליקציות)",
  whatsappBtn: "WhatsApp",
  copyLogsBtn: "העתק לוגים",
  emailBtn: "דוא\"ל",
  downloadBtn: "הורד קובץ",
  bugSuccess: "הדוח מוכן! בחרו כיצד לשתף:",
  logsCopied: "✅ הלוגים הועתקו ללוח בהצלחה!",
  downloadSuccess: "✅ הקבצים נשמרו בהצלחה במכשיר!",

  // Footer
  footerText: "מראת תפילין • זיהוי תפילין מדויק בזמן אמת"
};

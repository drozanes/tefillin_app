/**
 * Tefillin Mirror - Global Application Configuration
 * Define available YOLO models, defaults, and runtime settings.
 */
const APP_CONFIG = {
  // Default model to load if not specified by env var, URL param, or localStorage
  defaultModel: 'fp16',

  // Available models mapped by identifier
  models: {
    'fp16': {
      id: 'fp16',
      name: 'FP16 (Half Precision)',
      label: 'FP16 (5.9 MB) - מומלץ למובייל',
      path: 'models/best_fp16.onnx',
      size: '5.9 MB',
      description: 'הכי מאוזן: מהיר במיוחד במאיצי מובייל (WebGPU/WebGL) עם דיוק מלא'
    },
    'uint8': {
      id: 'uint8',
      name: 'INT8 / uint8 (Dynamic Quantized)',
      label: 'INT8 / uint8 (3.2 MB) - המהיר ביותר',
      path: 'models/best_uint8.onnx',
      size: '3.2 MB',
      description: 'הכי קל ומהיר: צריכת זיכרון מינימלית, אידיאלי למכשירים חלשים'
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_CONFIG;
}

const YoloEngine = (function() {
    let worker = null;
    let isWorkerReady = false;
    let isBusy = false;
    let activeModelPath = null;
    let activeModelKey = null;
    let pendingDetectResolver = null;
    let pendingLoadResolver = null;
    let useFallback = false;

    // Fallback main-thread session if worker is unavailable
    let mainThreadSession = null;
    let _prepCanvas = null;
    let _prepCtx = null;
    let _floatBuf = null;

    const modelWidth = 640;
    const modelHeight = 640;

    const DEFAULT_MODELS = {
        'fp16': { id: 'fp16', name: 'FP16 (Half Precision)', path: 'models/best_fp16.onnx', size: '5.9 MB' },
        'uint8': { id: 'uint8', name: 'INT8 / uint8 (Quantized)', path: 'models/best_uint8.onnx', size: '3.2 MB' },
        'int8': { id: 'uint8', name: 'INT8 / uint8 (Quantized)', path: 'models/best_uint8.onnx', size: '3.2 MB' },
        'default': { id: 'default', name: 'Default Model', path: 'models/best.onnx', size: '5.9 MB' }
    };

    function getRegistry() {
        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.models) {
            return APP_CONFIG.models;
        }
        return DEFAULT_MODELS;
    }

    async function resolveSelectedModel(requestedKeyOrPath) {
        if (requestedKeyOrPath) {
            const reg = getRegistry();
            if (reg[requestedKeyOrPath]) {
                return { key: reg[requestedKeyOrPath].id || requestedKeyOrPath, path: reg[requestedKeyOrPath].path };
            }
            return { key: 'custom', path: requestedKeyOrPath };
        }

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const urlModel = urlParams.get('model');
            if (urlModel) {
                const reg = getRegistry();
                const key = urlModel.toLowerCase();
                if (reg[key]) return { key: reg[key].id || key, path: reg[key].path };
                if (DEFAULT_MODELS[key]) return { key: DEFAULT_MODELS[key].id || key, path: DEFAULT_MODELS[key].path };
            }
        } catch (_) {}

        try {
            const storedModel = localStorage.getItem('tefillin_model');
            if (storedModel) {
                const reg = getRegistry();
                const key = storedModel.toLowerCase();
                if (reg[key]) return { key: reg[key].id || key, path: reg[key].path };
            }
        } catch (_) {}

        const isStaticHost = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
        if (!isStaticHost) {
            try {
                const resp = await fetch('api/config', { cache: 'no-store' });
                if (resp.ok) {
                    const serverCfg = await resp.json();
                    if (serverCfg && serverCfg.serverEnvModel) {
                        const key = serverCfg.serverEnvModel.toLowerCase();
                        const reg = getRegistry();
                        if (reg[key]) return { key: reg[key].id || key, path: reg[key].path };
                        if (serverCfg.serverModelPath) return { key, path: serverCfg.serverModelPath };
                    }
                }
            } catch (_) {}
        }

        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.defaultModel) {
            const defKey = APP_CONFIG.defaultModel;
            const reg = getRegistry();
            if (reg[defKey]) return { key: reg[defKey].id || defKey, path: reg[defKey].path };
        }

        return { key: 'uint8', path: 'models/best_uint8.onnx' };
    }

    function initWorker() {
        if (worker || useFallback) return;

        try {
            if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
                useFallback = true;
                return;
            }

            worker = new Worker('yolo_worker.js');
            worker.onmessage = (e) => {
                const data = e.data;
                if (!data) return;

                if (data.type === 'loaded') {
                    isWorkerReady = true;
                    isBusy = false;
                    console.log(`[YOLO Engine] Worker model ready: ${data.key}`);
                    if (pendingLoadResolver) {
                        pendingLoadResolver.resolve(data.key);
                        pendingLoadResolver = null;
                    }
                } else if (data.type === 'load_error') {
                    isWorkerReady = false;
                    isBusy = false;
                    console.error("[YOLO Engine] Worker load failed:", data.error);
                    if (pendingLoadResolver) {
                        pendingLoadResolver.reject(new Error(data.error));
                        pendingLoadResolver = null;
                    }
                } else if (data.type === 'detected') {
                    isBusy = false;
                    if (data.infTime && Math.random() < 0.05) {
                        console.log(`[YOLO Worker] [${data.modelKey}] Inference: ${data.infTime}ms (0ms Main Thread Impact)`);
                    }
                    if (pendingDetectResolver) {
                        pendingDetectResolver(data.box);
                        pendingDetectResolver = null;
                    }
                } else if (data.type === 'detect_error') {
                    isBusy = false;
                    console.warn("[YOLO Worker] Detection error:", data.error);
                    if (pendingDetectResolver) {
                        pendingDetectResolver(null);
                        pendingDetectResolver = null;
                    }
                }
            };

            worker.onerror = (err) => {
                console.warn("[YOLO Engine] Worker error, falling back to main-thread runtime:", err);
                useFallback = true;
                isBusy = false;
                if (pendingLoadResolver) {
                    pendingLoadResolver.reject(err);
                    pendingLoadResolver = null;
                }
                if (pendingDetectResolver) {
                    pendingDetectResolver(null);
                    pendingDetectResolver = null;
                }
            };
        } catch (err) {
            console.warn("[YOLO Engine] Cannot construct Web Worker, using main-thread fallback:", err);
            useFallback = true;
        }
    }

    async function loadModel(preferredModel) {
        const resolved = await resolveSelectedModel(preferredModel);

        if (activeModelPath === resolved.path && (isWorkerReady || mainThreadSession)) {
            return resolved.key;
        }

        activeModelPath = resolved.path;
        activeModelKey = resolved.key;
        console.log(`[YOLO Engine] Loading model '${resolved.key}' from: ${resolved.path}`);

        initWorker();

        if (!useFallback && worker) {
            isWorkerReady = false;
            isBusy = true;
            const absolutePath = new URL(resolved.path, window.location.href).href;
            return new Promise((resolve, reject) => {
                pendingLoadResolver = { resolve, reject };
                worker.postMessage({ type: 'load', path: absolutePath, key: resolved.key });
            });
        }

        // Fallback: Main thread ONNX session
        if (typeof ort !== 'undefined' && ort.env && ort.env.wasm) {
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
            ort.env.wasm.numThreads = 1;
            ort.env.wasm.simd = true;
        }

        let sessionInstance = null;
        try {
            sessionInstance = await ort.InferenceSession.create(resolved.path, { executionProviders: ['webgpu'] });
        } catch (_) {
            try {
                sessionInstance = await ort.InferenceSession.create(resolved.path, { executionProviders: ['wasm'] });
            } catch (__) {
                sessionInstance = await ort.InferenceSession.create(resolved.path);
            }
        }
        mainThreadSession = sessionInstance;
        return resolved.key;
    }

    async function detect(sourceCanvasOrVideo) {
        if (!sourceCanvasOrVideo) return null;

        // If worker is active, delegate entirely to background thread with 0ms UI lockup
        if (!useFallback && worker && isWorkerReady) {
            if (isBusy) {
                // If previous inference is still crunching in background, do not backlog the worker
                return null;
            }

            try {
                isBusy = true;
                const bmp = await createImageBitmap(sourceCanvasOrVideo);
                const w = sourceCanvasOrVideo.videoWidth || sourceCanvasOrVideo.width || 640;
                const h = sourceCanvasOrVideo.videoHeight || sourceCanvasOrVideo.height || 480;

                return new Promise((resolve) => {
                    pendingDetectResolver = resolve;
                    worker.postMessage({ type: 'detect', bitmap: bmp, w, h }, [bmp]);
                });
            } catch (bmpErr) {
                isBusy = false;
                console.warn("[YOLO Engine] Failed to create ImageBitmap:", bmpErr);
                return null;
            }
        }

        // Main thread fallback execution
        if (!mainThreadSession || isBusy) return null;
        isBusy = true;
        try {
            const w = sourceCanvasOrVideo.width || 640;
            const h = sourceCanvasOrVideo.height || 480;
            const scale = Math.min(modelWidth / w, modelHeight / h);
            const scaledW = w * scale;
            const scaledH = h * scale;
            const padX = (modelWidth - scaledW) / 2;
            const padY = (modelHeight - scaledH) / 2;

            if (!_prepCanvas) {
                _prepCanvas = document.createElement('canvas');
                _prepCanvas.width = modelWidth;
                _prepCanvas.height = modelHeight;
                _prepCtx = _prepCanvas.getContext('2d', { willReadFrequently: true });
            }
            if (!_floatBuf) _floatBuf = new Float32Array(3 * modelWidth * modelHeight);

            _prepCtx.fillStyle = 'rgb(114, 114, 114)';
            _prepCtx.fillRect(0, 0, modelWidth, modelHeight);
            _prepCtx.drawImage(sourceCanvasOrVideo, 0, 0, w, h, padX, padY, scaledW, scaledH);

            const imgData = _prepCtx.getImageData(0, 0, modelWidth, modelHeight).data;
            const totalPixels = modelWidth * modelHeight;
            const inv255 = 1.0 / 255.0;
            for (let i = 0; i < totalPixels; i++) {
                const base = i * 4;
                _floatBuf[i] = imgData[base] * inv255;
                _floatBuf[totalPixels + i] = imgData[base + 1] * inv255;
                _floatBuf[totalPixels * 2 + i] = imgData[base + 2] * inv255;
            }

            const tensor = new ort.Tensor('float32', _floatBuf, [1, 3, modelHeight, modelWidth]);
            const feeds = {};
            feeds[mainThreadSession.inputNames[0]] = tensor;
            const results = await mainThreadSession.run(feeds);

            const out = results[mainThreadSession.outputNames[0]];
            const data = out.data;
            let bestConf = 0;
            let bestBox = null;
            const confOffset = 4 * 8400;
            for (let i = 0; i < 8400; i++) {
                const conf = data[confOffset + i];
                if (conf > bestConf && conf > 0.40) {
                    bestConf = conf;
                    bestBox = { cx: data[i], cy: data[8400 + i], w: data[16800 + i], h: data[25200 + i], conf };
                }
            }

            tensor.dispose();
            for (const k in results) {
                if (results[k] && typeof results[k].dispose === 'function') results[k].dispose();
            }

            if (!bestBox) return null;
            const origCx = (bestBox.cx - padX) / scale;
            const origCy = (bestBox.cy - padY) / scale;
            const origW = bestBox.w / scale;
            const origH = bestBox.h / scale;
            return {
                x: origCx, y: origCy,
                leftX: origCx - origW / 2, rightX: origCx + origW / 2,
                topY: origCy - origH / 2, bottomY: origCy + origH / 2,
                boxWidth: origW, boxHeight: origH,
                confidence: bestBox.conf
            };
        } catch (err) {
            console.warn("[YOLO Fallback] Detection error:", err);
            return null;
        } finally {
            isBusy = false;
        }
    }

    function isRunning() {
        return isBusy;
    }

    function getActiveModel() {
        return {
            key: activeModelKey,
            path: activeModelPath
        };
    }

    function getAvailableModels() {
        return getRegistry();
    }

    return {
        loadModel,
        detect,
        isRunning,
        getActiveModel,
        getAvailableModels
    };
})();

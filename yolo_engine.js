const YoloEngine = (function() {
    let session = null;
    let activeModelPath = null;
    let activeModelKey = null;

    const modelWidth = 640;
    const modelHeight = 640;

    // Default model registry if config.js is not loaded
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
        // 1. Explicit parameter passed to loadModel
        if (requestedKeyOrPath) {
            const reg = getRegistry();
            if (reg[requestedKeyOrPath]) {
                return { key: reg[requestedKeyOrPath].id || requestedKeyOrPath, path: reg[requestedKeyOrPath].path };
            }
            return { key: 'custom', path: requestedKeyOrPath };
        }

        // 2. URL Query Parameter (?model=uint8, ?model=fp16)
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const urlModel = urlParams.get('model');
            if (urlModel) {
                const reg = getRegistry();
                const key = urlModel.toLowerCase();
                if (reg[key]) {
                    return { key: reg[key].id || key, path: reg[key].path };
                }
                if (DEFAULT_MODELS[key]) {
                    return { key: DEFAULT_MODELS[key].id || key, path: DEFAULT_MODELS[key].path };
                }
            }
        } catch (_) {}

        // 3. LocalStorage override (e.g. user toggled in test runner)
        try {
            const storedModel = localStorage.getItem('tefillin_model');
            if (storedModel) {
                const reg = getRegistry();
                const key = storedModel.toLowerCase();
                if (reg[key]) {
                    return { key: reg[key].id || key, path: reg[key].path };
                }
            }
        } catch (_) {}

        // 4. Server environment variable (from server.py /api/config if on local/custom server)
        const isStaticHost = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
        if (!isStaticHost) {
            try {
                const resp = await fetch('api/config', { cache: 'no-store' });
                if (resp.ok) {
                    const serverCfg = await resp.json();
                    if (serverCfg && serverCfg.serverEnvModel) {
                        const key = serverCfg.serverEnvModel.toLowerCase();
                        const reg = getRegistry();
                        if (reg[key]) {
                            return { key: reg[key].id || key, path: reg[key].path };
                        }
                        if (serverCfg.serverModelPath) {
                            return { key, path: serverCfg.serverModelPath };
                        }
                    }
                }
            } catch (_) {}
        }

        // 5. Global APP_CONFIG default
        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.defaultModel) {
            const defKey = APP_CONFIG.defaultModel;
            const reg = getRegistry();
            if (reg[defKey]) {
                return { key: reg[defKey].id || defKey, path: reg[defKey].path };
            }
        }

        // 6. Fallback default
        return { key: 'fp16', path: 'models/best_fp16.onnx' };
    }

    // Reusable preprocessing resources (avoid GC pressure on every frame)
    let _prepCanvas = null;
    let _prepCtx = null;
    let _floatBuf = null;

    // Concurrency queue / mutex lock to guarantee that session.run is never invoked concurrently.
    // ONNX Runtime Web (WASM/WebGL/WebGPU) is strictly non-reentrant on a single session.
    let inferenceQueue = Promise.resolve();

    async function loadModel(preferredModel) {
        const resolved = await resolveSelectedModel(preferredModel);

        // If session is already loaded with the requested model, return it
        if (session && activeModelPath === resolved.path) {
            return session;
        }

        // Wait for any active inference to finish before replacing session
        try {
            await inferenceQueue;
        } catch (_) {}

        console.log(`[YOLO Engine] Loading model '${resolved.key}' from: ${resolved.path}`);
        activeModelPath = resolved.path;
        activeModelKey = resolved.key;

        // Use hardware acceleration (WebGPU / WebGL) with WASM fallback
        session = await ort.InferenceSession.create(resolved.path, { 
            executionProviders: ['webgpu', 'webgl', 'wasm'] 
        });
        
        console.log(`[YOLO Engine] Model loaded successfully: ${resolved.key} (${resolved.path})`);
        return session;
    }

    function preprocess(canvas) {
        const w = canvas.width;
        const h = canvas.height;
        const scale = Math.min(modelWidth / w, modelHeight / h);
        const scaledW = w * scale;
        const scaledH = h * scale;
        const padX = (modelWidth - scaledW) / 2;
        const padY = (modelHeight - scaledH) / 2;

        // Reuse canvas and buffer across frames to avoid allocation + GC pauses
        if (!_prepCanvas) {
            _prepCanvas = document.createElement('canvas');
            _prepCanvas.width = modelWidth;
            _prepCanvas.height = modelHeight;
            _prepCtx = _prepCanvas.getContext('2d', { willReadFrequently: true });
        }
        if (!_floatBuf) {
            _floatBuf = new Float32Array(3 * modelWidth * modelHeight);
        }

        const ctx = _prepCtx;
        
        // Fill with grey padding
        ctx.fillStyle = 'rgb(114, 114, 114)';
        ctx.fillRect(0, 0, modelWidth, modelHeight);
        
        // Draw scaled image centered
        ctx.drawImage(canvas, 0, 0, w, h, padX, padY, scaledW, scaledH);
        
        const imgData = ctx.getImageData(0, 0, modelWidth, modelHeight).data;
        
        // Convert to NCHW float32 array — single pass with cached offsets
        const totalPixels = modelWidth * modelHeight;
        const float32Data = _floatBuf;
        const gOffset = totalPixels;
        const bOffset = totalPixels * 2;
        const inv255 = 1.0 / 255.0;
        for (let i = 0; i < totalPixels; i++) {
            const base = i * 4;
            float32Data[i] = imgData[base] * inv255;             // R
            float32Data[gOffset + i] = imgData[base + 1] * inv255; // G
            float32Data[bOffset + i] = imgData[base + 2] * inv255; // B
        }
        
        const tensor = new ort.Tensor('float32', float32Data, [1, 3, modelHeight, modelWidth]);
        return { tensor, scale, padX, padY };
    }

    function postprocess(outputTensor, scale, padX, padY) {
        const data = outputTensor.data; 
        let bestConf = 0;
        let bestBox = null;
        
        // Simple NMS: find the single max confidence box (we only expect 1 tefillin per face)
        const confOffset = 4 * 8400;
        for (let i = 0; i < 8400; i++) {
            const conf = data[confOffset + i];
            if (conf > bestConf && conf > 0.40) {
                bestConf = conf;
                const cx = data[i];             // row 0
                const cy = data[8400 + i];      // row 1
                const w = data[16800 + i];      // row 2
                const h = data[25200 + i];      // row 3
                bestBox = { cx, cy, w, h, conf };
            }
        }
        
        if (!bestBox) return null;
        
        // Convert back to original image coordinates
        const origCx = (bestBox.cx - padX) / scale;
        const origCy = (bestBox.cy - padY) / scale;
        const origW = bestBox.w / scale;
        const origH = bestBox.h / scale;
        
        return {
            x: origCx,
            y: origCy,
            leftX: origCx - origW / 2,
            rightX: origCx + origW / 2,
            topY: origCy - origH / 2,
            bottomY: origCy + origH / 2,
            boxWidth: origW,
            boxHeight: origH,
            confidence: bestBox.conf
        };
    }

    async function detect(canvas) {
        if (!session) return null;
        
        // Mutex queue: Ensure preprocess, session.run, and postprocess execute sequentially
        const queuedTask = inferenceQueue.then(async () => {
            try {
                const startPre = performance.now();
                const { tensor, scale, padX, padY } = preprocess(canvas);
                const endPre = performance.now();
                
                const feeds = {};
                feeds[session.inputNames[0]] = tensor;
                
                const startInf = performance.now();
                const results = await session.run(feeds);
                const endInf = performance.now();
                
                const outputTensor = results[session.outputNames[0]];
                const finalBox = postprocess(outputTensor, scale, padX, padY);
                
                // Throttle debug logging to avoid console spam
                if (Math.random() < 0.05) {
                    const provider = (session.executionProviders && session.executionProviders[0]) ? (session.executionProviders[0].name || session.executionProviders[0]) : 'unknown';
                    console.log(`[YOLO Profiler] [${activeModelKey}] Pre: ${(endPre - startPre).toFixed(1)}ms | Inf: ${(endInf - startInf).toFixed(1)}ms | Provider: ${provider}`);
                }
                
                return finalBox;
            } catch (err) {
                console.warn("[YOLO Engine] Inference execution failed:", err);
                return null;
            }
        });

        // Always update inferenceQueue to resolve so any error never jams the queue
        inferenceQueue = queuedTask.catch(() => null);

        return queuedTask;
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
        getActiveModel,
        getAvailableModels
    };
})();

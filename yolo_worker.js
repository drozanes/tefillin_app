/**
 * Dedicated Web Worker for YOLOv8 ONNX Neural Network Inference.
 * 
 * Offloading inference to this background thread guarantees that:
 * 1. The main UI thread never freezes or drops frames (smooth 60 FPS).
 * 2. Android WebView never triggers ANR (Application Not Responding) crashes.
 * 3. Mobile touch inputs and modals remain 100% responsive.
 */

/* global ort */
try {
    importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
} catch (e) {
    console.error("[YOLO Worker] Failed to importScripts for ONNX Runtime:", e);
}

if (typeof ort !== 'undefined' && ort.env && ort.env.wasm) {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
}

const MODEL_WIDTH = 640;
const MODEL_HEIGHT = 640;

let session = null;
let activeModelKey = null;
let activeModelPath = null;

let offscreenCanvas = null;
let offscreenCtx = null;
let floatBuf = null;

async function initSession(modelPath, modelKey) {
    if (session && activeModelPath === modelPath) {
        return { success: true, key: activeModelKey };
    }

    if (!offscreenCanvas && typeof OffscreenCanvas !== 'undefined') {
        offscreenCanvas = new OffscreenCanvas(MODEL_WIDTH, MODEL_HEIGHT);
        offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!floatBuf) {
        floatBuf = new Float32Array(3 * MODEL_WIDTH * MODEL_HEIGHT);
    }

    activeModelPath = modelPath;
    activeModelKey = modelKey;

    let sessionInstance = null;

    // Try WebGPU first, then WASM SIMD, then default
    try {
        sessionInstance = await ort.InferenceSession.create(modelPath, { executionProviders: ['webgpu'] });
    } catch (_) {
        try {
            sessionInstance = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
        } catch (__) {
            sessionInstance = await ort.InferenceSession.create(modelPath);
        }
    }

    session = sessionInstance;

    // Model warmup to compile JIT shaders / WASM kernels
    try {
        const dummy = new ort.Tensor('float32', new Float32Array(3 * MODEL_WIDTH * MODEL_HEIGHT), [1, 3, MODEL_HEIGHT, MODEL_WIDTH]);
        const feeds = {};
        feeds[session.inputNames[0]] = dummy;
        const warmupRes = await session.run(feeds);
        dummy.dispose();
        for (const k in warmupRes) {
            if (warmupRes[k] && typeof warmupRes[k].dispose === 'function') warmupRes[k].dispose();
        }
    } catch (wErr) {
        console.warn("[YOLO Worker] Warmup warning:", wErr);
    }

    return { success: true, key: activeModelKey };
}

function preprocess(bitmap, w, h) {
    const scale = Math.min(MODEL_WIDTH / w, MODEL_HEIGHT / h);
    const scaledW = w * scale;
    const scaledH = h * scale;
    const padX = (MODEL_WIDTH - scaledW) / 2;
    const padY = (MODEL_HEIGHT - scaledH) / 2;

    const ctx = offscreenCtx;
    ctx.fillStyle = 'rgb(114, 114, 114)';
    ctx.fillRect(0, 0, MODEL_WIDTH, MODEL_HEIGHT);
    ctx.drawImage(bitmap, 0, 0, w, h, padX, padY, scaledW, scaledH);

    const imgData = ctx.getImageData(0, 0, MODEL_WIDTH, MODEL_HEIGHT).data;
    const totalPixels = MODEL_WIDTH * MODEL_HEIGHT;
    const gOffset = totalPixels;
    const bOffset = totalPixels * 2;
    const inv255 = 1.0 / 255.0;

    for (let i = 0; i < totalPixels; i++) {
        const base = i * 4;
        floatBuf[i] = imgData[base] * inv255;
        floatBuf[gOffset + i] = imgData[base + 1] * inv255;
        floatBuf[bOffset + i] = imgData[base + 2] * inv255;
    }

    const tensor = new ort.Tensor('float32', floatBuf, [1, 3, MODEL_HEIGHT, MODEL_WIDTH]);
    return { tensor, scale, padX, padY };
}

function postprocess(outputTensor, scale, padX, padY) {
    const data = outputTensor.data;
    let bestConf = 0;
    let bestBox = null;

    const confOffset = 4 * 8400;
    for (let i = 0; i < 8400; i++) {
        const conf = data[confOffset + i];
        if (conf > bestConf && conf > 0.40) {
            bestConf = conf;
            bestBox = {
                cx: data[i],
                cy: data[8400 + i],
                w: data[16800 + i],
                h: data[25200 + i],
                conf
            };
        }
    }

    if (!bestBox) return null;

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

self.onmessage = async (e) => {
    const msg = e.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'load') {
        try {
            const res = await initSession(msg.path, msg.key);
            self.postMessage({ type: 'loaded', key: res.key });
        } catch (err) {
            self.postMessage({ type: 'load_error', error: err.message || String(err) });
        }
    } else if (msg.type === 'detect') {
        const { bitmap, w, h } = msg;
        if (!session) {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            self.postMessage({ type: 'detected', box: null });
            return;
        }

        let tensor = null;
        let results = null;
        const t0 = performance.now();
        try {
            const prep = preprocess(bitmap, w, h);
            tensor = prep.tensor;
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();

            const feeds = {};
            feeds[session.inputNames[0]] = tensor;

            results = await session.run(feeds);
            const outputTensor = results[session.outputNames[0]];
            const box = postprocess(outputTensor, prep.scale, prep.padX, prep.padY);
            const t1 = performance.now();

            self.postMessage({
                type: 'detected',
                box,
                infTime: (t1 - t0).toFixed(1),
                modelKey: activeModelKey
            });
        } catch (err) {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            self.postMessage({ type: 'detect_error', error: err.message || String(err) });
        } finally {
            if (tensor && typeof tensor.dispose === 'function') {
                try { tensor.dispose(); } catch (_) {}
            }
            if (results) {
                for (const k in results) {
                    if (results[k] && typeof results[k].dispose === 'function') {
                        try { results[k].dispose(); } catch (_) {}
                    }
                }
            }
        }
    }
};

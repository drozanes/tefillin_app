const YoloEngine = (function() {
    let session = null;
    const modelWidth = 640;
    const modelHeight = 640;

    async function loadModel() {
        if (!session) {
            console.log("Loading YOLO ONNX model...");
            // Use hardware acceleration (WebGPU / WebGL) for massive speedup on mobile
            session = await ort.InferenceSession.create('models/best.onnx', { 
                executionProviders: ['webgpu', 'webgl', 'wasm'] 
            });
            console.log("YOLO model loaded!");
        }
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

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = modelWidth;
        tmpCanvas.height = modelHeight;
        const ctx = tmpCanvas.getContext('2d', { willReadFrequently: true });
        
        // Fill with grey padding
        ctx.fillStyle = 'rgb(114, 114, 114)';
        ctx.fillRect(0, 0, modelWidth, modelHeight);
        
        // Draw scaled image centered
        ctx.drawImage(canvas, 0, 0, w, h, padX, padY, scaledW, scaledH);
        
        const imgData = ctx.getImageData(0, 0, modelWidth, modelHeight).data;
        
        // Convert to NCHW float32 array
        const float32Data = new Float32Array(3 * modelWidth * modelHeight);
        for (let i = 0; i < modelWidth * modelHeight; i++) {
            float32Data[i] = imgData[i * 4] / 255.0; // R
            float32Data[i + modelWidth * modelHeight] = imgData[i * 4 + 1] / 255.0; // G
            float32Data[i + 2 * modelWidth * modelHeight] = imgData[i * 4 + 2] / 255.0; // B
        }
        
        const tensor = new ort.Tensor('float32', float32Data, [1, 3, modelHeight, modelWidth]);
        return { tensor, scale, padX, padY };
    }

    function postprocess(outputTensor, scale, padX, padY) {
        const data = outputTensor.data; 
        let bestConf = 0;
        let bestBox = null;
        
        // Simple NMS: find the single max confidence box (we only expect 1 tefillin per face)
        for (let i = 0; i < 8400; i++) {
            const conf = data[4 * 8400 + i];
            if (conf > bestConf && conf > 0.40) {
                bestConf = conf;
                const cx = data[0 * 8400 + i];
                const cy = data[1 * 8400 + i];
                const w = data[2 * 8400 + i];
                const h = data[3 * 8400 + i];
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
        
        // Log to console so user can verify speed and GPU usage via USB debugging
        // We throttle the log to avoid console spam
        if (Math.random() < 0.05) {
            console.log(`[YOLO Profiler] Preprocess: ${(endPre - startPre).toFixed(1)}ms | Inference: ${(endInf - startInf).toFixed(1)}ms | Provider: ${session.executionProviders[0].name || 'unknown'}`);
        }
        
        return finalBox;
    }

    return {
        loadModel,
        detect
    };
})();

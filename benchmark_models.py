#!/usr/bin/env python3
"""
Model Comparison Benchmark for Tefillin Detection
Compares best_fp16.onnx and best_uint8.onnx across all sample images.
"""
import os
import glob
import time
import json
import numpy as np
from PIL import Image
import onnxruntime as ort

MODEL_PATHS = {
    'FP16': 'models/best_fp16.onnx',
    'UINT8': 'models/best_uint8.onnx'
}

CONF_THRESHOLD = 0.40
MODEL_SIZE = 640

def find_all_images(samples_dir='samples'):
    extensions = ('*.jpg', '*.jpeg', '*.png', '*.webp', '*.JPG', '*.JPEG', '*.PNG')
    images = []
    for ext in extensions:
        images.extend(glob.glob(os.path.join(samples_dir, '**', ext), recursive=True))
    images = sorted(list(set(images)))
    return images

def preprocess_image(img_path):
    orig_img = Image.open(img_path).convert('RGB')
    orig_w, orig_h = orig_img.size

    scale = min(MODEL_SIZE / orig_w, MODEL_SIZE / orig_h)
    scaled_w = int(round(orig_w * scale))
    scaled_h = int(round(orig_h * scale))
    pad_x = (MODEL_SIZE - scaled_w) / 2.0
    pad_y = (MODEL_SIZE - scaled_h) / 2.0

    resized_img = orig_img.resize((scaled_w, scaled_h), Image.Resampling.BILINEAR)

    canvas = Image.new('RGB', (MODEL_SIZE, MODEL_SIZE), (114, 114, 114))
    canvas.paste(resized_img, (int(round(pad_x)), int(round(pad_y))))

    img_data = np.array(canvas, dtype=np.float32) / 255.0
    tensor = np.transpose(img_data, (2, 0, 1))
    tensor = np.expand_dims(tensor, axis=0)

    return tensor, scale, pad_x, pad_y, orig_w, orig_h

def postprocess_output(output, scale, pad_x, pad_y, conf_thresh=CONF_THRESHOLD):
    data = output[0]
    confs = data[4, :]
    valid_indices = np.where(confs > conf_thresh)[0]
    
    if len(valid_indices) == 0:
        return None

    best_idx = valid_indices[np.argmax(confs[valid_indices])]
    best_conf = float(confs[best_idx])
    
    cx = float(data[0, best_idx])
    cy = float(data[1, best_idx])
    w = float(data[2, best_idx])
    h = float(data[3, best_idx])

    orig_cx = (cx - pad_x) / scale
    orig_cy = (cy - pad_y) / scale
    orig_w = w / scale
    orig_h = h / scale

    x1 = orig_cx - orig_w / 2.0
    y1 = orig_cy - orig_h / 2.0
    x2 = orig_cx + orig_w / 2.0
    y2 = orig_cy + orig_h / 2.0

    return {
        'conf': best_conf,
        'cx': orig_cx,
        'cy': orig_cy,
        'w': orig_w,
        'h': orig_h,
        'box': [x1, y1, x2, y2]
    }

def calculate_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interW = max(0.0, xB - xA)
    interH = max(0.0, yB - yA)
    interArea = interW * interH

    boxAArea = max(0.0, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    boxBArea = max(0.0, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))

    unionArea = boxAArea + boxBArea - interArea
    if unionArea <= 0:
        return 0.0
    return interArea / unionArea

def run_benchmark():
    images = find_all_images('samples')
    print(f"Loaded {len(images)} sample images.")

    sessions = {}
    for name, path in MODEL_PATHS.items():
        print(f"Loading {name} ({path})...")
        sessions[name] = ort.InferenceSession(path, providers=['CPUExecutionProvider'])

    dummy = np.random.randn(1, 3, 640, 640).astype(np.float32)
    for name, sess in sessions.items():
        sess.run(None, {sess.get_inputs()[0].name: dummy})

    results = {name: [] for name in MODEL_PATHS}
    timings = {name: [] for name in MODEL_PATHS}

    print("\nRunning inference across all images...")
    for idx, img_path in enumerate(images):
        tensor, scale, pad_x, pad_y, orig_w, orig_h = preprocess_image(img_path)

        for name, sess in sessions.items():
            t0 = time.perf_counter()
            outputs = sess.run(None, {sess.get_inputs()[0].name: tensor})
            t1 = time.perf_counter()
            timings[name].append((t1 - t0) * 1000.0)

            det = postprocess_output(outputs[0], scale, pad_x, pad_y)
            results[name].append({
                'img': img_path,
                'width': orig_w,
                'height': orig_h,
                'det': det
            })

    # Compare UINT8 vs FP16
    base_name = 'FP16'
    target_name = 'UINT8'
    comp_key = f"{target_name} vs {base_name}"
    ious = []
    conf_diffs = []
    center_drifts_px = []
    center_drifts_pct = []
    both_detected = 0
    only_base = []
    only_target = []
    neither_detected = 0
    significant_diffs = []

    for i in range(len(images)):
        img_path = images[i]
        d_base = results[base_name][i]['det']
        d_tgt = results[target_name][i]['det']
        w = results[base_name][i]['width']
        h = results[base_name][i]['height']
        diag = np.hypot(w, h)

        if d_base is not None and d_tgt is not None:
            both_detected += 1
            iou = calculate_iou(d_base['box'], d_tgt['box'])
            ious.append(iou)

            conf_diff = d_tgt['conf'] - d_base['conf']
            conf_diffs.append(conf_diff)

            drift_px = np.hypot(d_tgt['cx'] - d_base['cx'], d_tgt['cy'] - d_base['cy'])
            center_drifts_px.append(drift_px)
            center_drifts_pct.append((drift_px / diag) * 100.0)

            if iou < 0.90 or abs(conf_diff) > 0.10:
                significant_diffs.append({
                    'img': img_path,
                    'iou': round(iou, 4),
                    'base_conf': round(d_base['conf'], 4),
                    'tgt_conf': round(d_tgt['conf'], 4),
                    'drift_px': round(drift_px, 2),
                    'type': 'IoU < 0.90' if iou < 0.90 else 'Conf diff > 0.10'
                })
        elif d_base is not None and d_tgt is None:
            only_base.append({
                'img': img_path,
                'base_conf': round(d_base['conf'], 4)
            })
        elif d_base is None and d_tgt is not None:
            only_target.append({
                'img': img_path,
                'tgt_conf': round(d_tgt['conf'], 4)
            })
        else:
            neither_detected += 1

    comparison = {
        'target': target_name,
        'baseline': base_name,
        'total_images': len(images),
        'both_detected': both_detected,
        'neither_detected': neither_detected,
        'detection_agreement': round((both_detected + neither_detected) / len(images) * 100.0, 2),
        'only_base': only_base,
        'only_target': only_target,
        'mean_iou': round(float(np.mean(ious)), 4) if ious else 0.0,
        'median_iou': round(float(np.median(ious)), 4) if ious else 0.0,
        'min_iou': round(float(np.min(ious)), 4) if ious else 0.0,
        'iou_gte_95_pct': round(sum(1 for x in ious if x >= 0.95) / len(ious) * 100.0, 2) if ious else 0.0,
        'iou_gte_90_pct': round(sum(1 for x in ious if x >= 0.90) / len(ious) * 100.0, 2) if ious else 0.0,
        'mean_conf_diff': round(float(np.mean(conf_diffs)), 4) if conf_diffs else 0.0,
        'mean_abs_conf_diff': round(float(np.mean(np.abs(conf_diffs))), 4) if conf_diffs else 0.0,
        'mean_center_drift_px': round(float(np.mean(center_drifts_px)), 2) if center_drifts_px else 0.0,
        'mean_center_drift_pct': round(float(np.mean(center_drifts_pct)), 3) if center_drifts_pct else 0.0,
        'significant_diffs': significant_diffs
    }

    timing_summary = {}
    for name in MODEL_PATHS:
        t = timings[name]
        timing_summary[name] = {
            'mean_ms': round(float(np.mean(t)), 2),
            'median_ms': round(float(np.median(t)), 2),
            'min_ms': round(float(np.min(t)), 2),
            'max_ms': round(float(np.max(t)), 2)
        }

    print("\n" + "=" * 80)
    print("               TEFILLIN YOLO MODEL BENCHMARK REPORT")
    print("=" * 80)
    print(f"Total Sample Images Tested: {len(images)}")
    for name in MODEL_PATHS:
        cnt = sum(1 for r in results[name] if r['det'] is not None)
        print(f"   - {name:<10}: {cnt}/{len(images)} detections ({cnt/len(images)*100:.1f}%)")

    print("\nLatency Benchmarks (CPU Execution Provider):")
    for name, t in timing_summary.items():
        print(f"   - {name:<10}: Mean={t['mean_ms']:5.1f} ms | Median={t['median_ms']:5.1f} ms")

    print("\n" + "-" * 80)
    print(f"COMPARISON: {comp_key}")
    print("-" * 80)
    print(f"Detection Agreement:     {comparison['detection_agreement']}%")
    print(f"Mean IoU (Overlap):      {comparison['mean_iou'] * 100:.2f}%")
    print(f"IoU >= 95%:              {comparison['iou_gte_95_pct']}% of detected images")
    print(f"Mean Center Drift:       {comparison['mean_center_drift_px']:.2f} px")
    print("=" * 80)

if __name__ == '__main__':
    run_benchmark()

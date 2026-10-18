#!/usr/bin/env python3
"""
Downloads MediaPipe and ONNX Web runtimes for 100% offline mobile Capacitor builds.
"""
import os, urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VENDOR_DIR = os.path.join(BASE_DIR, 'vendor')

os.makedirs(os.path.join(VENDOR_DIR, 'mediapipe'), exist_ok=True)
os.makedirs(os.path.join(VENDOR_DIR, 'onnx'), exist_ok=True)

FILES = [
    (os.path.join(VENDOR_DIR, 'mediapipe', 'camera_utils.js'), 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
    (os.path.join(VENDOR_DIR, 'mediapipe', 'face_mesh.js'), 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'),
    (os.path.join(VENDOR_DIR, 'mediapipe', 'face_mesh_solution_simd_wasm_bin.js'), 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh_solution_simd_wasm_bin.js'),
    (os.path.join(VENDOR_DIR, 'mediapipe', 'face_mesh_solution_simd_wasm_bin.wasm'), 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh_solution_simd_wasm_bin.wasm'),
    (os.path.join(VENDOR_DIR, 'mediapipe', 'face_mesh.binarypb'), 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.binarypb'),
    (os.path.join(VENDOR_DIR, 'onnx', 'ort.min.js'), 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js'),
    (os.path.join(VENDOR_DIR, 'onnx', 'ort-wasm-simd-threaded.wasm'), 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'),
    (os.path.join(VENDOR_DIR, 'onnx', 'ort-wasm-simd-threaded.jsep.wasm'), 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm'),
    (os.path.join(VENDOR_DIR, 'onnx', 'ort-wasm-simd-threaded.jsep.mjs'), 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs'),
]

print("=== Downloading Vendor Dependencies for Offline Capacitor App ===")
for dest, url in FILES:
    fname = os.path.basename(dest)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"  ✔ Already downloaded: {fname} ({os.path.getsize(dest)/(1024*1024):.2f} MB)")
        continue
    print(f"  ⬇ Downloading {fname} from {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=45) as r, open(dest, 'wb') as f:
        f.write(r.read())
    print(f"  ✔ Finished {fname} ({os.path.getsize(dest)/(1024*1024):.2f} MB)")

print("\nAll vendor assets ready for offline Capacitor packaging!")

#!/usr/bin/env python3
"""
Optimize YOLO ONNX model for smartphone inference.
Creates multiple optimized variants from the original fp32 model.
"""
import os
import sys
import numpy as np

# Paths
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
ORIGINAL = os.path.join(MODELS_DIR, 'best.onnx')

def get_size_mb(path):
    return os.path.getsize(path) / (1024 * 1024)

def convert_fp16(input_path, output_path):
    """Convert fp32 model to fp16 (half precision).
    Keeps input/output as fp32 for compatibility, but all internal weights become fp16.
    This is the safest optimization — nearly zero accuracy loss."""
    import onnx
    from onnxruntime.transformers import float16
    
    print(f"\n{'='*60}")
    print(f"Converting to FP16...")
    print(f"{'='*60}")
    
    model = onnx.load(input_path)
    
    # Convert to fp16, keeping IO as fp32 for browser compatibility
    model_fp16 = float16.convert_float_to_float16(
        model,
        keep_io_types=True,
        min_positive_val=1e-7,
        max_finite_val=1e4
    )
    
    onnx.save(model_fp16, output_path)
    
    orig_size = get_size_mb(input_path)
    new_size = get_size_mb(output_path)
    print(f"  Original:  {orig_size:.1f} MB")
    print(f"  FP16:      {new_size:.1f} MB  ({new_size/orig_size*100:.0f}% of original)")
    
    return output_path


def quantize_uint8(input_path, output_path):
    """Dynamic quantization to uint8. 
    Aggressive compression — smallest model, but may lose some accuracy."""
    from onnxruntime.quantization import quantize_dynamic, QuantType
    
    print(f"\n{'='*60}")
    print(f"Quantizing to uint8 (dynamic)...")
    print(f"{'='*60}")
    
    quantize_dynamic(
        input_path,
        output_path,
        weight_type=QuantType.QUInt8,
        optimize_model=True,
    )
    
    orig_size = get_size_mb(input_path)
    new_size = get_size_mb(output_path)
    print(f"  Original:  {orig_size:.1f} MB")
    print(f"  Uint8:     {new_size:.1f} MB  ({new_size/orig_size*100:.0f}% of original)")
    
    return output_path


def resize_input(input_path, output_path, new_size=320):
    """Change the model input size from 640 to a smaller resolution.
    This is the biggest speedup — inference is ~O(n²) with input resolution.
    Requires modifying the model graph's input shape."""
    import onnx
    from onnx import helper, TensorProto
    
    print(f"\n{'='*60}")
    print(f"Resizing input from 640x640 to {new_size}x{new_size}...")
    print(f"  NOTE: YOLO models with fixed conv strides support dynamic input.")
    print(f"  The model weights stay the same; only the input tensor shape changes.")
    print(f"{'='*60}")
    
    model = onnx.load(input_path)
    
    # Update input shape
    for inp in model.graph.input:
        shape = inp.type.tensor_type.shape
        if shape and len(shape.dim) == 4:
            # NCHW: [1, 3, 640, 640] → [1, 3, new_size, new_size]
            old_h = shape.dim[2].dim_value
            old_w = shape.dim[3].dim_value
            shape.dim[2].dim_value = new_size
            shape.dim[3].dim_value = new_size
            print(f"  Input '{inp.name}': [{shape.dim[0].dim_value}, {shape.dim[1].dim_value}, {old_h}, {old_w}] → [{shape.dim[0].dim_value}, {shape.dim[1].dim_value}, {new_size}, {new_size}]")
    
    # Clear output shapes (let ONNX runtime infer them dynamically)
    for out in model.graph.output:
        out.type.tensor_type.shape.Clear()
    
    # Also clear intermediate value_info shapes that reference fixed dimensions
    for vi in model.graph.value_info:
        vi.type.tensor_type.shape.Clear()
    
    onnx.save(model, output_path)
    
    orig_size = get_size_mb(input_path)
    new_size_mb = get_size_mb(output_path)
    print(f"  File size: {new_size_mb:.1f} MB (weights unchanged, only metadata differs)")
    print(f"  Expected inference speedup: ~{(640/new_size)**2:.1f}x")
    
    return output_path


def validate_model(path, label):
    """Quick validation: load model and run dummy inference."""
    import onnxruntime as ort
    
    print(f"\n  Validating {label}...")
    try:
        sess = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
        inp = sess.get_inputs()[0]
        shape = inp.shape
        print(f"    Input: {inp.name} shape={shape} dtype={inp.type}")
        
        # Run dummy inference
        dummy = np.random.randn(*[s if isinstance(s, int) else 1 for s in shape]).astype(np.float32)
        out = sess.run(None, {inp.name: dummy})
        print(f"    Output shape: {out[0].shape}")
        print(f"    ✅ Model loads and runs successfully")
        return True
    except Exception as e:
        print(f"    ❌ Validation failed: {e}")
        return False


def main():
    if not os.path.exists(ORIGINAL):
        print(f"ERROR: Original model not found at {ORIGINAL}")
        sys.exit(1)
    
    print(f"Original model: {ORIGINAL}")
    print(f"Original size:  {get_size_mb(ORIGINAL):.1f} MB")
    
    results = []
    
    # Strategy 1: FP16 quantization (safest, ~50% size reduction)
    fp16_path = os.path.join(MODELS_DIR, 'best_fp16.onnx')
    try:
        convert_fp16(ORIGINAL, fp16_path)
        if validate_model(fp16_path, "FP16"):
            results.append(('FP16', fp16_path, get_size_mb(fp16_path)))
    except Exception as e:
        print(f"  FP16 conversion failed: {e}")
        # Fallback: manual fp16 conversion
        print("  Trying manual fp16 conversion...")
        try:
            import onnx
            from onnx import numpy_helper
            model = onnx.load(ORIGINAL)
            for init in model.graph.initializer:
                if init.data_type == onnx.TensorProto.FLOAT:
                    arr = numpy_helper.to_array(init).astype(np.float16)
                    new_init = numpy_helper.from_array(arr, init.name)
                    new_init.data_type = onnx.TensorProto.FLOAT16
                    init.CopyFrom(new_init)
            onnx.save(model, fp16_path)
            print(f"  Manual FP16: {get_size_mb(fp16_path):.1f} MB")
            if validate_model(fp16_path, "FP16 (manual)"):
                results.append(('FP16', fp16_path, get_size_mb(fp16_path)))
        except Exception as e2:
            print(f"  Manual FP16 also failed: {e2}")
    
    # Strategy 2: uint8 dynamic quantization (aggressive, ~75% size reduction)
    uint8_path = os.path.join(MODELS_DIR, 'best_uint8.onnx')
    try:
        quantize_uint8(ORIGINAL, uint8_path)
        if validate_model(uint8_path, "uint8"):
            results.append(('uint8', uint8_path, get_size_mb(uint8_path)))
    except Exception as e:
        print(f"  uint8 quantization failed: {e}")
    
    # Strategy 3: Reduced input size (320x320) — keeps fp32 weights
    small_path = os.path.join(MODELS_DIR, 'best_320.onnx')
    try:
        resize_input(ORIGINAL, small_path, 320)
        if validate_model(small_path, "320x320"):
            results.append(('320x320', small_path, get_size_mb(small_path)))
    except Exception as e:
        print(f"  Input resize failed: {e}")
    
    # Strategy 4: FP16 + 320x320 (best combo)
    if os.path.exists(fp16_path):
        combo_path = os.path.join(MODELS_DIR, 'best_fp16_320.onnx')
        try:
            resize_input(fp16_path, combo_path, 320)
            if validate_model(combo_path, "FP16+320"):
                results.append(('FP16+320', combo_path, get_size_mb(combo_path)))
        except Exception as e:
            print(f"  FP16+320 combo failed: {e}")
    
    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    orig_mb = get_size_mb(ORIGINAL)
    print(f"  {'Variant':<15} {'Size':>8} {'Reduction':>10} {'Est. Speedup':>14}")
    print(f"  {'-'*50}")
    print(f"  {'Original':<15} {orig_mb:>7.1f}M {'—':>10} {'1.0x':>14}")
    for label, path, size_mb in results:
        reduction = f"{(1 - size_mb/orig_mb)*100:.0f}%"
        if '320' in label:
            speedup = f"~{(640/320)**2:.0f}x" if 'FP16' not in label else f"~{(640/320)**2 * 1.5:.0f}x"
        elif 'FP16' in label:
            speedup = "~1.5-2x"
        else:
            speedup = "~1.5-2x"
        print(f"  {label:<15} {size_mb:>7.1f}M {reduction:>10} {speedup:>14}")
    
    # Recommend best option
    if results:
        best = min(results, key=lambda x: x[2])
        print(f"\n  🏆 Recommended: {best[0]} ({best[1]})")
        print(f"     Copy to models/best.onnx to use it.")


if __name__ == '__main__':
    main()

import os
import base64
import json
import re

def is_image(filename):
    lower = filename.lower()
    return lower.endswith(".jpg") or lower.endswith(".jpeg") or lower.endswith(".png")

def get_mime(filename):
    return "image/png" if filename.lower().endswith(".png") else "image/jpeg"

images = []

def add_image(file_path, group, expected, description, display_name):
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    
    mime = get_mime(file_path)
    data_uri = f"data:{mime};base64,{b64}"
    
    images.append({
        "name": display_name,
        "group": group,
        "expected": expected,
        "description": description,
        "path": data_uri
    })

# Scan the samples directory dynamically
if os.path.exists("samples"):
    for root_dir, dirs, files in os.walk("samples"):
        for f in files:
            if is_image(f):
                file_path = os.path.join(root_dir, f)
                rel_dir = os.path.relpath(root_dir, "samples")
                
                group_name = "samples/" if rel_dir == "." else rel_dir
                
                # Determine expected result based on path or filename
                lower_path = file_path.lower()
                if "wrong" in lower_path or "error" in lower_path:
                    expected = "FOREHEAD_ERROR"
                elif "ok" in lower_path:
                    expected = "ALIGNED"
                elif "cropped" in lower_path:
                    expected = "FOREHEAD_ERROR" if re.search(r"images \(3\)|images \(4\)|images \(6\)", f) else "ALIGNED"
                else:
                    # Default to ALIGNED for unknown folders
                    expected = "ALIGNED"
                    
                description = f"Image in {group_name}"
                display_name = f"{group_name}/{f}"
                
                add_image(file_path, group_name, expected, description, display_name)

# Root folder test images
for f in os.listdir("."):
    if os.path.isfile(f) and is_image(f):
        exp = "FOREHEAD_ERROR" if re.search(r"exmple3", f) else "ALIGNED"
        add_image(f, "root/", exp, "Root test image", f)

content = "const embeddedSamples = [\n"
content += ",\n".join(json.dumps(img) for img in images)
content += "\n];"

with open("samples_data.js", "w", encoding="utf-8") as f:
    f.write(content)

print(f"Generated samples_data.js successfully! Total images: {len(images)}")

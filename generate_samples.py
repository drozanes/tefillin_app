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

# 1. samples/OK
if os.path.exists("samples/OK"):
    for f in os.listdir("samples/OK"):
        if is_image(f):
            add_image(os.path.join("samples/OK", f), "OK", "ALIGNED", "Kosher / On Hair", f"OK/{f}")

# 2. samples/WRONG
if os.path.exists("samples/WRONG"):
    for f in os.listdir("samples/WRONG"):
        if is_image(f):
            add_image(os.path.join("samples/WRONG", f), "WRONG", "FOREHEAD_ERROR", "Invalid / On Forehead", f"WRONG/{f}")

# 3. samples/cropped
if os.path.exists("samples/cropped"):
    for f in os.listdir("samples/cropped"):
        if is_image(f):
            exp = "FOREHEAD_ERROR" if re.search(r"images \(3\)|images \(4\)|images \(6\)", f) else "ALIGNED"
            add_image(os.path.join("samples/cropped", f), "cropped/", exp, "Cropped face", f"cropped/{f}")

# 4. Root folder test images
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

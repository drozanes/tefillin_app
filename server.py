import http.server
import socketserver
import subprocess
import os
import json

PORT = 8000

# Available model mappings
MODEL_MAP = {
    'fp16': 'models/best_fp16.onnx',
    'uint8': 'models/best_uint8.onnx',
    'int8': 'models/best_uint8.onnx',
    'default': 'models/best.onnx',
}

# Read model selection from environment variable
# Usage: TEFILLIN_MODEL=uint8 python3 server.py
ENV_MODEL = os.environ.get('TEFILLIN_MODEL', os.environ.get('MODEL', 'fp16')).strip().lower()
ACTIVE_MODEL_KEY = ENV_MODEL if ENV_MODEL in MODEL_MAP else 'fp16'
ACTIVE_MODEL_PATH = MODEL_MAP.get(ACTIVE_MODEL_KEY, 'models/best_fp16.onnx')

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.onnx': 'application/octet-stream',
        '.wasm': 'application/wasm',
        '.js': 'application/javascript',
    }

    def do_GET(self):
        if self.path == '/api/config':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            
            config_payload = {
                "serverEnvModel": ACTIVE_MODEL_KEY,
                "serverModelPath": ACTIVE_MODEL_PATH,
                "availableModels": list(MODEL_MAP.keys()),
            }
            self.wfile.write(json.dumps(config_payload).encode())
            return
        
        super().do_GET()

    def do_POST(self):
        if self.path == '/generate':
            try:
                # Run the generate_samples.py script
                result = subprocess.run(['python3', 'generate_samples.py'], capture_output=True, text=True, check=True)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                # Send the output back to the browser
                response = '{"success": true, "message": "Samples updated successfully!", "output": "' + result.stdout.strip().replace('"', '\\"') + '"}'
                self.wfile.write(response.encode())
            except subprocess.CalledProcessError as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = '{"success": false, "message": "Failed to generate samples", "error": "' + e.stderr.strip().replace('"', '\\"') + '"}'
                self.wfile.write(response.encode())
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    # To allow address reuse
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"==================================================")
        print(f"🚀 Tefillin Mirror Server running at http://localhost:{PORT}")
        print(f"🤖 Active YOLO Model via TEFILLIN_MODEL env var: '{ACTIVE_MODEL_KEY}' ({ACTIVE_MODEL_PATH})")
        print(f"💡 Tip: change model anytime via: TEFILLIN_MODEL=uint8 python3 server.py")
        print(f"   Or in browser URL: http://localhost:{PORT}/?model=uint8")
        print(f"==================================================")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass

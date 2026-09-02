import http.server
import socketserver
import subprocess
import os

PORT = 8000

class CustomHandler(http.server.SimpleHTTPRequestHandler):
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

# To allow address reuse
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

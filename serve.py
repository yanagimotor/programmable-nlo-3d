"""Local web server for the programmable-photonics page (works offline, e.g. at the booth).

Browsers refuse to load ES modules from file://, so the page needs a server.  This one binds to
127.0.0.1 only, pins the MIME types (some Windows registries map .js to text/plain), and sends
no-cache so edits show up on reload.

Usage: python serve.py [folder] [port]
       folder defaults to ./docs next to this script if it exists, else this script's folder.
"""
import functools
import http.server
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
default = os.path.join(HERE, "docs") if os.path.isdir(os.path.join(HERE, "docs")) else HERE
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else default
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        "": "application/octet-stream",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".wasm": "application/wasm",
        ".glb": "model/gltf-binary",
        ".mp4": "video/mp4",
        ".txt": "text/plain; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print("Serving %s at http://127.0.0.1:%d/  (Ctrl+C to stop)" % (ROOT, PORT), flush=True)
        httpd.serve_forever()

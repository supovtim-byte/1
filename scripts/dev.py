"""Serve the static site locally, including the managed preview's CLI flags."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=5173)
parser.add_argument("--strictPort", action="store_true")
args = parser.parse_args()
directory = Path(__file__).resolve().parent.parent / "dist"
handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
with ThreadingHTTPServer((args.host, args.port), handler) as server:
    print(f"Local: http://{args.host}:{args.port}", flush=True)
    server.serve_forever()

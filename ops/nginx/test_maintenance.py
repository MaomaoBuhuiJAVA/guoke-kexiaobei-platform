"""Exercise the fallback with real Nginx on loopback; never stop the live app."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
NGINX = shutil.which("nginx") or "/usr/sbin/nginx"


def configure(site):
    source = HERE / "configure_maintenance.py"
    # Running against the unmodified configuration establishes the failing baseline.
    if not source.exists():
        return site
    spec = importlib.util.spec_from_file_location("maintenance_config", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.configure_site(site)


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/error/") or self.path.startswith("/api/error/"):
            status = int(self.path.split("?")[0].rsplit("/", 1)[-1])
        else:
            status = 200
        body = json.dumps({"error": "upstream-unavailable"}).encode() if self.path.startswith("/api/") else b"healthy-page" if status == 200 else b"upstream-page-error"
        self.send_response(status)
        self.send_header("Content-Type", "application/json" if self.path.startswith("/api/") else "text/html")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class MaintenanceIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="guoke-maintenance-test-")
        self.root = Path(self.temp.name)
        self.root.chmod(0o755)
        self.backend = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        self.backend_thread = threading.Thread(target=self.backend.serve_forever, daemon=True)
        self.backend_thread.start()
        self.backend_stopped = False
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.base = f"http://127.0.0.1:{self.port}"
        self.site = f"""server {{
    listen 127.0.0.1:{self.port};
    server_name localhost;
    location = /api/auth/login {{
        default_type application/json;
        return 409 '{{"error":"existing-auth-behavior"}}';
    }}
    location / {{
        proxy_pass http://127.0.0.1:{self.backend.server_port};
        proxy_read_timeout 1s;
    }}
}}
"""
        site = configure(configure(self.site))
        snippet_path = HERE / "maintenance.conf"
        if snippet_path.exists():
            shutil.copyfile(HERE / "maintenance.html", self.root / "maintenance.html")
            (self.root / "maintenance.html").chmod(0o644)
            snippet = snippet_path.read_text(encoding="utf-8").replace("/var/www/guoke-maintenance/index.html", str(self.root / "maintenance.html"))
            (self.root / "maintenance.conf").write_text(snippet, encoding="utf-8")
            site = site.replace("/etc/nginx/snippets/guoke-maintenance.conf", str(self.root / "maintenance.conf"))
        config = f"worker_processes 1;\npid {self.root}/nginx.pid;\nerror_log {self.root}/error.log;\nevents {{worker_connections 64;}}\nhttp {{access_log off;\n{site}\n}}\n"
        self.config_path = self.root / "nginx.conf"
        self.config_path.write_text(config, encoding="utf-8")
        self.nginx = subprocess.Popen([NGINX, "-p", str(self.root) + "/", "-c", str(self.config_path), "-g", "daemon off;"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(50):
            if self.nginx.poll() is not None:
                self.fail(self.nginx.stderr.read().decode())
            try:
                self.request("/")
                break
            except URLError:
                time.sleep(0.04)
        else:
            self.fail("Isolated Nginx did not start")

    def tearDown(self):
        self.nginx.send_signal(signal.SIGQUIT)
        self.nginx.wait(timeout=5)
        self.nginx.stderr.close()
        if not self.backend_stopped:
            self.backend.shutdown()
            self.backend.server_close()
        self.temp.cleanup()

    def request(self, path):
        try:
            response = urlopen(self.base + path, timeout=4)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read().decode("utf-8")

    def assert_maintenance(self, path):
        status, headers, body = self.request(path)
        self.assertEqual(status, 503)
        self.assertIn("网站正在维护更新中", body)
        self.assertIn("重新尝试", body)
        self.assertIn("no-store", headers.get("Cache-Control", ""))
        self.assertEqual(headers.get("Retry-After"), "60")
        self.assertIn("text/html", headers.get("Content-Type", ""))

    def test_healthy_page_still_reaches_application(self):
        self.assertEqual(self.request("/normal?from=test")[::2], (200, "healthy-page"))

    def test_application_errors_show_uncached_maintenance_page(self):
        for status in [500, 502, 503, 504]:
            with self.subTest(status=status):
                self.assert_maintenance(f"/error/{status}?keep=this")

    def test_api_business_errors_keep_their_original_json(self):
        for status in [500, 502, 503, 504]:
            with self.subTest(status=status):
                code, headers, body = self.request(f"/api/error/{status}")
                self.assertEqual(code, status)
                self.assertIn("application/json", headers.get("Content-Type", ""))
                self.assertEqual(json.loads(body), {"error": "upstream-unavailable"})

    def test_stopped_application_shows_maintenance_and_recovers(self):
        backend_port = self.backend.server_port
        self.backend.shutdown()
        self.backend.server_close()
        self.backend_stopped = True
        self.assert_maintenance("/original-page?keep=this")
        self.assertEqual(self.request("/api/anything")[0], 502)
        self.backend = ThreadingHTTPServer(("127.0.0.1", backend_port), Upstream)
        threading.Thread(target=self.backend.serve_forever, daemon=True).start()
        self.backend_stopped = False
        self.assertEqual(self.request("/original-page?keep=this")[::2], (200, "healthy-page"))

    def test_existing_exact_auth_location_is_preserved(self):
        code, _, body = self.request("/api/auth/login")
        self.assertEqual(code, 409)
        self.assertEqual(json.loads(body), {"error": "existing-auth-behavior"})

    def test_internal_page_cannot_be_opened_directly(self):
        self.assertEqual(self.request("/_guoke_maintenance.html")[0], 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)

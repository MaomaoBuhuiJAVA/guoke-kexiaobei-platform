"""Install the GitHub-built maintenance asset and reload Nginx; never restart the app."""
import argparse
from datetime import datetime, timezone
import difflib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from configure_maintenance import configure_site

SITE = Path("/etc/nginx/sites-available/guoke")
SNIPPET = Path("/etc/nginx/snippets/guoke-maintenance.conf")
PAGE = Path("/var/www/guoke-maintenance/index.html")
HERE = Path(__file__).resolve().parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".guoke-maintenance-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-site-sha256", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError("Nginx deployment must run as root on the reviewed ECS host")
    with open("/run/lock/guoke-native-release.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for path in [SITE, SNIPPET, PAGE, PAGE.parent]:
            if path.is_symlink():
                raise RuntimeError(f"Unexpected symlink at {path}")
        original = SITE.read_bytes()
        if digest(original) != args.expected_site_sha256:
            raise RuntimeError("Live Nginx configuration changed; refresh the review before deploying")
        updated = configure_site(original.decode("utf-8")).encode("utf-8")
        print("".join(difflib.unified_diff(original.decode().splitlines(True), updated.decode().splitlines(True), fromfile=str(SITE), tofile="with-maintenance")))
        if not args.apply:
            print(json.dumps({"applied": False, "applicationRestarted": False}))
            return
        commit = (HERE.parent.parent / "BUILD_COMMIT").read_text().strip()
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            raise RuntimeError("GitHub build commit is missing or invalid")
        previous_release = Path("/opt/guoke/current").resolve(strict=True)
        backup = Path("/var/backups/guoke/nginx-maintenance") / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + commit[:8])
        backup.mkdir(parents=True, mode=0o700, exist_ok=False)
        before = {path: path.read_bytes() if path.exists() else None for path in [PAGE, SNIPPET, SITE]}
        for index, (path, content) in enumerate(before.items()):
            if content is not None:
                atomic_write(backup / f"{index}-{path.name}.before", content, 0o600)
        target = {PAGE: (HERE / "maintenance.html").read_bytes(), SNIPPET: (HERE / "maintenance.conf").read_bytes(), SITE: updated}
        changed = []
        try:
            PAGE.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            for path, content in target.items():
                atomic_write(path, content)
                changed.append(path)
            subprocess.run(["nginx", "-t"], check=True)
            subprocess.run(["systemctl", "reload", "nginx"], check=True)
            subprocess.run(["curl", "--fail", "--silent", "--show-error", "--max-time", "15", "--resolve", "guokeey.cn:443:127.0.0.1", "--output", "/dev/null", "https://guokeey.cn/"], check=True)
            subprocess.run(["systemctl", "is-active", "--quiet", "nginx"], check=True)
            subprocess.run(["systemctl", "is-active", "--quiet", "guoke-web"], check=True)
            if Path("/opt/guoke/current").resolve(strict=True) != previous_release:
                raise RuntimeError("Application release changed during the Nginx update")
        except BaseException:
            if any(path.read_bytes() != target[path] for path in changed):
                raise RuntimeError("Nginx files changed independently; automatic rollback stopped")
            for path in reversed(changed):
                if before[path] is None:
                    path.unlink()
                else:
                    atomic_write(path, before[path])
            subprocess.run(["nginx", "-t"], check=True)
            subprocess.run(["systemctl", "reload", "nginx"], check=True)
            raise
        record = {"commit": commit, "nginxSiteSha256": digest(updated), "pageSha256": digest(target[PAGE]), "previousRelease": str(previous_release), "applicationRestarted": False, "databaseChanged": False, "backup": str(backup)}
        atomic_write(backup / "deployment.json", json.dumps(record, indent=2).encode(), 0o600)
        print(json.dumps(record))


if __name__ == "__main__":
    main()

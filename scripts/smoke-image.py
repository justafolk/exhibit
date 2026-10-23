#!/usr/bin/env python3
"""Boot a disposable image, check the served app/API, and always stop it."""
import json
import subprocess
import sys
import time
from urllib.request import urlopen
from urllib.error import URLError

image = sys.argv[1] if len(sys.argv) > 1 else "exhibit:local"
container = subprocess.check_output([
    "docker", "run", "--rm", "-d", "--read-only", "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true", "-e", "EXHIBIT_STORE=demo",
    "-p", "127.0.0.1::8080", image,
], text=True).strip()
try:
    address = subprocess.check_output(["docker", "port", container, "8080"], text=True).strip()
    base = "http://" + address
    for attempt in range(40):
        try:
            with urlopen(base + "/api/readyz", timeout=2) as response:
                assert json.load(response)["status"] == "ready"
            break
        except (URLError, TimeoutError):
            if attempt == 39:
                raise
            time.sleep(0.25)
    with urlopen(base + "/", timeout=5) as response:
        html = response.read().decode()
        assert '<div id="root"></div>' in html
        assert "Exhibit" in html
        assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    with urlopen(base + "/api/v1/runs", timeout=5) as response:
        data = json.load(response)
        assert data["mode"] == "demo" and len(data["runs"]) == 5
        assert all(run["sample"] for run in data["runs"])
    with urlopen(base + "/api/version", timeout=5) as response:
        version = json.load(response)
        assert version["application"] == "exhibit"
    print("Container smoke passed: static app, readiness, sample API, version and CSP")
finally:
    subprocess.run(["docker", "stop", "--time", "5", container], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

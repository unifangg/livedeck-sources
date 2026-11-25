#!/usr/bin/env python3
"""Validate manifest.json syntax/fields and probe remote CMS/T4 endpoints."""

import argparse
import json
import pathlib
import ssl
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent


def validate_manifest(path: pathlib.Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != "livedeck.manifest/v1":
        raise ValueError(f"unexpected schema: {data.get('schema')!r}")
    if not data.get("name") or not isinstance(data.get("items"), list):
        raise ValueError("manifest must declare name and items[]")

    seen_ids = set()
    for item in data["items"]:
        iid = item.get("id")
        if not iid or iid in seen_ids:
            raise ValueError(f"missing or duplicate item id: {iid!r}")
        seen_ids.add(iid)
        if item.get("driver") == "script_js":
            url = (item.get("source") or {}).get("url", "")
            prefix = "https://raw.githubusercontent.com/unifangg/livedeck-sources/main/"
            if url.startswith(prefix):
                local_file = ROOT / url[len(prefix):]
                if not local_file.is_file():
                    raise FileNotFoundError(f"missing local script for `{iid}`: {local_file}")
    print(f"[OK] validated {len(data['items'])} items in {path.name}")
    return data


def probe_http(data: dict) -> int:
    ctx = ssl._create_unverified_context()
    failed = 0
    for item in data["items"]:
        drv = item.get("driver")
        if drv not in ("cms", "t4"):
            continue
        url = (item.get("source") or {}).get("url", "")
        if drv == "cms" and "ac=" not in url:
            sep = "&" if "?" in url else "?"
            url += sep + "ac=list"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "okhttp/4.12.0"})
            with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
                body = resp.read(16000).decode("utf-8", errors="replace")
            ok = body.lstrip().startswith("{") or "<rss" in body[:400]
            status = "OK" if ok else "BAD_BODY"
            if not ok:
                failed += 1
            print(f"  [{status}] {item['name']} ({drv})")
        except Exception as e:
            failed += 1
            print(f"  [ERR]  {item['name']} ({drv}): {e}")
    return failed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true", help="Probe remote CMS/T4 liveness")
    args = parser.parse_args()
    data = validate_manifest(ROOT / "manifest.json")
    if args.probe:
        failed = probe_http(data)
        if failed:
            print(f"Warning: {failed} endpoint(s) failed probe", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

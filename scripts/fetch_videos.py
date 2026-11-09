#!/usr/bin/env python3
"""도로교통공단 '동영상 문제' 게시글에서 966~999번 영상을 받아 data/videos/*.mp4 로 저장한다.

- 공식 게시글의 최신 버전을 문제 번호별로 선택한다.
- WMV 원본은 브라우저에서 재생할 수 없으므로 ffmpeg로 H.264/AAC MP4로 변환한다.
- MP4 원본은 화질 손실 없이 faststart만 적용해 복사한다.
- data/videos.json 에 원본 게시글/다운로드 주소 메타데이터를 기록한다.

사용:
    python3 scripts/fetch_videos.py            # 없는 영상만 받기
    python3 scripts/fetch_videos.py --force    # 전부 다시 받기
"""

import html
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "videos"
MANIFEST = ROOT / "data" / "videos.json"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
LIST_URL = "https://www.safedriving.or.kr/subExamBoard/selectSubExamBoardMovieListAx.do"
DETAIL_URL = "https://www.safedriving.or.kr/subExamBoard/selectSubExamBoardMovie.do?bbscttSn={sn}"
TARGET_FROM, TARGET_TO = 966, 999


def curl(args, url):
    cmd = ["curl", "-sL", "-A", UA, *args, url]
    return subprocess.run(cmd, check=True, stdout=subprocess.PIPE).stdout


def fetch_list():
    rows = []
    for page in range(1, 20):
        raw = curl(
            [
                "-X",
                "POST",
                "--data",
                f"pageIndex={page}&menuCd=MN-PO-1153",
                "-H",
                "X-Requested-With: XMLHttpRequest",
            ],
            LIST_URL,
        )
        data = json.loads(raw.decode("utf-8"))
        batch = data.get("subExMovBoardList", [])
        rows.extend(batch)
        info = data.get("paginationInfo", {})
        if page >= int(info.get("totalPageCount", 0) or 0):
            break
    return rows


def latest_by_number(rows):
    by_no = {}
    for it in rows:
        title = it.get("bbscttTtl", "")
        if "1,2종보통" not in title:
            continue
        m = re.search(r"\((\d{3,4})\)\s*$", title)
        if not m:
            continue
        no = int(m.group(1))
        if not (TARGET_FROM <= no <= TARGET_TO):
            continue
        prev = by_no.get(no)
        if prev is None or it.get("regDt", "") > prev.get("regDt", ""):
            by_no[no] = it
    return by_no


def find_download(detail, no):
    # 첨부 링크의 텍스트에 문제 번호가 들어있다. (예: ...동영상(974.mp4))
    links = re.findall(
        r'<a\s+href="([^"]*FileDown\.do\?[^"]+)"[^>]*>([^<]*)</a>', detail, re.I
    )
    for href, text in links:
        text = html.unescape(text)
        if re.search(rf"\(\s*{no}\s*\.", text):
            return html.unescape(href), text.strip()
    if links:
        href, text = links[0]
        return html.unescape(href), html.unescape(text).strip()
    return None, None


def run_ffmpeg(src, dst, prefer_copy=True):
    # MP4 원본은 재인코딩 없이 faststart만 적용
    if prefer_copy:
        cmd = [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(src),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(dst),
        ]
        res = subprocess.run(cmd)
        if res.returncode == 0 and dst.exists() and dst.stat().st_size > 0:
            return "remux"
    # WMV 등 브라우저 비호환 원본은 H.264/AAC로 변환
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-i",
        str(src),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(dst),
    ]
    subprocess.run(cmd, check=True)
    return "transcode"


def main():
    force = "--force" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = fetch_list()
    by_no = latest_by_number(rows)
    missing = [n for n in range(TARGET_FROM, TARGET_TO + 1) if n not in by_no]
    if missing:
        print("게시글을 찾지 못한 번호:", missing)

    manifest = {}
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}

    with tempfile.TemporaryDirectory(prefix="driver-videos-") as td:
        td = Path(td)
        for no in sorted(by_no):
            it = by_no[no]
            sn = it["bbscttSn"]
            page_url = DETAIL_URL.format(sn=sn)
            target = OUT_DIR / f"{no}.mp4"
            entry = {
                "file": f"{no}.mp4",
                "page": page_url,
                "source": None,
                "title": it.get("bbscttTtl"),
                "date": it.get("regDt"),
            }
            if target.exists() and target.stat().st_size > 0 and not force:
                manifest[str(no)] = entry
                print(f"[{no}] 이미 있음 ({target.stat().st_size / 1024 / 1024:.1f} MB)", flush=True)
                continue

            detail = curl(["-e", page_url], page_url).decode("utf-8", "replace")
            dl_url, label = find_download(detail, no)
            if not dl_url:
                print(f"[{no}] 다운로드 링크를 찾지 못했습니다: {page_url}")
                continue

            ext = ".mp4"
            m = re.search(r"\.(mp4|wmv|avi|mov)\b", label or "", re.I)
            if m:
                ext = "." + m.group(1).lower()
            raw = td / f"{no}{ext}"
            print(f"[{no}] 다운로드 {label or dl_url}", flush=True)
            subprocess.run(
                ["curl", "-sL", "-A", UA, "-e", page_url, "-o", str(raw), dl_url],
                check=True,
            )
            if not raw.exists() or raw.stat().st_size < 1024:
                print(f"[{no}] 다운로드 실패", flush=True)
                continue

            print(f"[{no}] 변환 -> {target.name} ({raw.stat().st_size / 1024 / 1024:.1f} MB)", flush=True)
            how = run_ffmpeg(raw, target, prefer_copy=(ext == ".mp4"))
            entry["source"] = dl_url
            entry["original"] = label
            entry["converted"] = how
            manifest[str(no)] = entry
            print(f"[{no}] 완료 ({how}, {target.stat().st_size / 1024 / 1024:.1f} MB)", flush=True)

    MANIFEST.write_text(
        json.dumps(dict(sorted(manifest.items(), key=lambda kv: int(kv[0]))), ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    print(f"매니페스트 저장: {MANIFEST}")
    print(f"영상 저장 위치: {OUT_DIR}")


if __name__ == "__main__":
    main()

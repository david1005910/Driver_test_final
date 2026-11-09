const fs = require("fs");
const config = require("../config");

// data/videos.json 은 scripts/fetch_videos.py 가 생성한다.
// 매니페스트가 없으면 영상 기능만 비활성화되고 나머지 앱은 정상 동작한다.
let catalog = {};
try {
  const parsed = JSON.parse(fs.readFileSync(config.data.videosJson, "utf8"));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    catalog = parsed;
  }
} catch (err) {
  if (err.code !== "ENOENT") {
    console.warn("[video] videos.json load failed:", err.message);
  }
}

function getVideo(no) {
  return catalog[String(no)] || null;
}

function hasVideo(no) {
  return Boolean(getVideo(no));
}

function allVideos() {
  return catalog;
}

module.exports = { getVideo, hasVideo, allVideos };

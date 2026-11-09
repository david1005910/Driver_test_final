const express = require("express");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { getVideo, allVideos } = require("../services/videoCatalog");

const router = express.Router();

// 프론트가 저장된 모의고사/풀던 문제에 영상 메타데이터를 다시 붙일 때 사용한다.
router.get("/", (req, res) => {
  res.json({ videos: allVideos() });
});

// 문제 번호(no)에 연결된 공식 동영상. data/videos/{no}.mp4 를 Range 요청까지 지원해 서빙한다.
router.get("/:no", (req, res) => {
  const no = Number(req.params.no);
  if (!Number.isInteger(no)) return res.status(400).json({ error: "invalid question number" });

  const video = getVideo(no);
  if (!video) return res.status(404).json({ error: "video not found" });

  const file = path.resolve(config.data.videosDir, video.file || `${no}.mp4`);
  if (!fs.existsSync(file)) {
    return res.status(404).json({
      error: "video file is not downloaded",
      hint: "python3 scripts/fetch_videos.py 를 실행하세요.",
    });
  }

  res.sendFile(file, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

module.exports = router;

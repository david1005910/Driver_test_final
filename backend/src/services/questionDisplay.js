const { hasVideo } = require("./videoCatalog");

// 영상이 앱 안에 연결된 문제는 "(홈페이지 참조)" 안내를 화면에서 숨긴다.
// 영상이 아직 없는 경우에는 원문 안내를 그대로 남겨 사용자가 공식 사이트를 찾을 수 있게 한다.
function displayQuestion(text, no) {
  const source = String(text || "");
  if (!hasVideo(no)) return source;
  return source.replace(/\s*\(홈페이지 참조\)/g, "").trim();
}

module.exports = { displayQuestion };

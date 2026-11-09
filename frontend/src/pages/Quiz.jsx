import React, { useEffect, useRef, useState } from "react";
import { get, post } from "../api";
import { clearStored, usePersistentState, useScrollMemory } from "../usePersistentState";

const DURATION = 40 * 60; // 40분

export default function Quiz() {
  // 진행 중인 모의고사(문제지·답안·마감 시각)를 저장해 잠깐 쉬어도 이어서 푼다.
  const [license, setLicense] = usePersistentState(
    "driver.quiz.license",
    2,
    (v) => v === 1 || v === 2
  );
  const [paper, setPaper] = usePersistentState(
    "driver.quiz.paper",
    null,
    (v) => v === null || (v && Array.isArray(v.items))
  );
  const [answers, setAnswers] = usePersistentState(
    "driver.quiz.answers",
    {}, // qid -> [idx]
    (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  );
  const [saved, setSaved] = usePersistentState(
    "driver.quiz.saved",
    false,
    (v) => typeof v === "boolean"
  );
  const [result, setResult] = usePersistentState(
    "driver.quiz.result",
    null,
    (v) => v === null || (v && typeof v === "object")
  );
  const [deadline, setDeadline] = usePersistentState(
    "driver.quiz.deadline",
    null,
    (v) => v === null || (typeof v === "number" && Number.isFinite(v))
  );
  const [timeLeft, setTimeLeft] = useState(() =>
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : DURATION
  );
  const timerRef = useRef(null);

  useEffect(() => {
    if (!paper || result || !deadline) return;
    const tick = () => {
      setTimeLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [paper, deadline, result]);

  useEffect(() => {
    if (timeLeft === 0 && paper && !saved && !result) {
      submit();
    }
  }, [timeLeft, paper, saved, result]);

  // 제출 도중 탭이 닫혀 결과가 저장되지 못한 경우 버튼이 잠기지 않도록 복구한다.
  useEffect(() => {
    if (saved && !result) setSaved(false);
  }, []);

  // 시험지 스크롤 위치도 기억해 풀던 문제 근처로 돌아온다.
  useScrollMemory("driver.quiz.scroll", !!paper && !result);

  // 영상 기능 추가 전에 저장된 시험지는 새 필드(has_video 등)가 없으므로 영상 메타데이터를 보강한다.
  useEffect(() => {
    if (!paper || paper.items.every((i) => i.has_video !== undefined)) return;
    let alive = true;
    get("/videos")
      .then(({ videos }) => {
        if (!alive) return;
        setPaper((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) => {
              const meta = videos?.[String(item.no)];
              return {
                ...item,
                has_video: Boolean(meta),
                video_page: meta?.page || null,
                question: meta
                  ? item.question.replace(/\s*\(홈페이지 참조\)/g, "").trim()
                  : item.question,
              };
            }),
          };
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // 저장된 시험지는 마운트 시점 값만 확인하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (result) window.scrollTo(0, 0);
  }, [result]);

  function start() {
    clearStored("driver.quiz.scroll");
    setPaper(null);
    setAnswers({});
    setSaved(false);
    setResult(null);
    setDeadline(Date.now() + DURATION * 1000);
    setTimeLeft(DURATION);
    get(`/exam/paper?license=${license}&count=40`).then(setPaper).catch((e) => alert(e.message));
  }

  function reset() {
    clearStored("driver.quiz.scroll");
    setPaper(null);
    setAnswers({});
    setSaved(false);
    setResult(null);
    setDeadline(null);
    setTimeLeft(DURATION);
  }

  function setAnswer(qid, idx) {
    setAnswers((prev) => {
      const cur = prev[qid] || [];
      const q = paper.items.find((i) => i.id === qid);
      const multi = q && q.answer && q.answer.length > 1;
      if (multi) {
        return { ...prev, [qid]: cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx].sort((a, b) => a - b) };
      }
      return { ...prev, [qid]: [idx] };
    });
  }

  async function submit() {
    if (!paper || result) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setSaved(true);
    const body = {
      license,
      answers: Object.entries(answers).map(([question_id, user_answer]) => ({
        question_id: Number(question_id),
        user_answer,
      })),
    };
    try {
      const graded = await post("/exam/grade", body);
      setResult(graded);
      setDeadline(null);
    } catch (e) {
      alert(e.message);
      setSaved(false);
    }
  }

  const answeredCount = Object.keys(answers).length;
  const mm = Math.floor(timeLeft / 60);
  const ss = timeLeft % 60;

  if (!paper) {
    return (
      <div className="page">
        <h2>모의고사 (40문항 · 40분)</h2>
        <div className="quiz-setup">
          <label>
            면허 종류
            <select value={license} onChange={(e) => setLicense(Number(e.target.value))}>
              <option value={1}>1종 보통 (합격 70점)</option>
              <option value={2}>2종 보통 (합격 60점)</option>
            </select>
          </label>
          <p className="muted">
            실제 학과시험과 동일하게 100점 만점 기준으로 40문항이 출제됩니다.
          </p>
          <button className="btn primary big" onClick={start}>
            시험 시작
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="page">
        <h2>채점 결과</h2>
        <div className={`result-big ${result.passed ? "pass" : "fail"}`}>
          <div className="rb-score">{result.score}점</div>
          <div className={`rb-label`}>{result.passed ? "합격 🎉" : "아쉬워요, 재도전!"}</div>
          <div className="muted">
            {result.total}문항 중 {result.correct}개 정답 · 합격 기준 {result.pass_score}점
          </div>
        </div>
        <button className="btn primary" onClick={() => { reset(); window.location.hash = "wrong"; }}>
          오답노트에서 다시 학습하기
        </button>
        <button className="btn" onClick={reset}>
          다시 도전
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="quiz-header">
        <span className="quiz-license">제{license === 1 ? "1종 보통" : "2종 보통"} · 40문제</span>
        <span className={`timer ${timeLeft < 300 ? "danger" : ""}`}>
          ⏱ {mm}:{ss.toString().padStart(2, "0")}
        </span>
        <span className="muted">{answeredCount}/40 답안</span>
      </div>

      <div className="nav-grid">
        {paper.items.map((q, i) => {
          const done = answers[q.id] && answers[q.id].length > 0;
          return (
            <button
              key={q.id}
              className={`nav-cell ${done ? "done" : ""}`}
              onClick={() => document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="q-panels">
        {paper.items.map((q, i) => {
          const sel = answers[q.id] || [];
          const circles = "①②③④⑤⑥";
          return (
            <div key={q.id} id={`q-${q.id}`} className="quiz-q">
              <div className="quiz-q-head">
                <span className="q-no">문제 {i + 1} · {q.no}번</span>
                {q.images && q.images.length > 0 && <span className="tag img">이미지문제</span>}
                {q.has_video && <span className="tag video">영상문제</span>}
              </div>
              {q.images && q.images.length > 0 && (
                <div className="q-images">
                  {q.images.map((im) => (
                    <img key={im} src={`/images/${im}`} alt="문제 이미지" className="q-img" loading="lazy" />
                  ))}
                </div>
              )}
              {q.has_video && (
                <div className="q-video">
                  <div className="q-video-label">🎬 문제 영상</div>
                  <video
                    key={`video-${q.no}`}
                    controls
                    playsInline
                    preload="metadata"
                    src={`/api/videos/${q.no}`}
                  >
                    브라우저가 영상을 재생할 수 없습니다.
                  </video>
                  {q.video_page && (
                    <div className="q-video-foot">
                      <a href={q.video_page} target="_blank" rel="noreferrer">
                        영상이 재생되지 않으면 공식 사이트에서 보기
                      </a>
                    </div>
                  )}
                </div>
              )}
              <div className="q-text">{q.question}</div>
              <div className="opts">
                {q.options.map((opt, j) => {
                  const idx = j + 1;
                  const isSel = sel.includes(idx);
                  return (
                    <button
                      key={j}
                      className={`opt ${isSel ? "sel" : ""}`}
                      onClick={() => setAnswer(q.id, idx)}
                    >
                      <span className="opt-circle">{circles[j]}</span>
                      <span className="opt-text">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="quiz-submit-bar">
        <button className="btn primary big" onClick={submit} disabled={saved}>
          시험 제출 및 채점
        </button>
      </div>
    </div>
  );
}
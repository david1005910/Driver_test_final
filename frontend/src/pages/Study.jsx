import React, { useEffect, useRef, useState } from "react";
import { get, post, postStream } from "../api";
import QuestionView from "../components/QuestionView.jsx";
import { onOpenQuestion } from "../nav";
import { usePersistentState, useScrollMemory } from "../usePersistentState";

const PAGE_SIZE = 10;

export default function Study() {
  // 필터 / 페이지 / 풀던 문제를 저장해 두었다가 탭 전환이나 새로고침 후 이어서 푼다.
  const [type, setType] = usePersistentState("driver.study.type", "", (v) => typeof v === "string");
  const [multi, setMulti] = usePersistentState("driver.study.multi", "", (v) => typeof v === "string");
  const [page, setPage] = usePersistentState(
    "driver.study.page",
    1,
    (v) => Number.isInteger(v) && v > 0
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = usePersistentState(
    "driver.study.active",
    null,
    (v) => v === null || (v && typeof v === "object" && Number.isInteger(v.id))
  );
  const prevFilters = useRef({ type, multi });

  useEffect(() => {
    // 필터가 실제로 바뀐 경우에만 1페이지로 돌아간다.
    // (StrictMode의 effect 2회 실행에도 저장된 위치가 지워지지 않도록 비교 방식 사용)
    const prev = prevFilters.current;
    if (prev.type === type && prev.multi === multi) return;
    prevFilters.current = { type, multi };
    setPage(1);
    setActive(null);
  }, [type, multi]);

  // 풀던 문제의 스크롤 위치도 함께 기억한다.
  useScrollMemory(active ? `driver.study.scroll.${active.id}` : "driver.study.scroll", !!active);

  // 영상 기능 추가 전에 저장된 문제는 새 필드(has_video 등)가 없으므로 한 번 새로 받아온다.
  useEffect(() => {
    if (!active || active.has_video !== undefined) return;
    get(`/questions/by-no/${active.no}`)
      .then((q) => setActive(q))
      .catch(() => {});
    // 저장된 active는 마운트 시점 값만 확인하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const query = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (type) query.set("type", type);
    if (multi) query.set("multi", multi);
    get(`/questions?${query}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
      })
      .catch((e) => alive && alert(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [type, multi, page]);

  useEffect(() => {
    return onOpenQuestion(({ no }) => {
      get(`/questions/by-no/${no}`)
        .then((q) => setActive(q))
        .catch((e) => alert(e.message));
    });
  }, []);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  async function handleAnswered(questionId, userAnswer, isCorrect) {
    try {
      await post(`/questions/${questionId}/answer`, { userAnswer, mode: "study" });
    } catch (e) {
      console.error(e);
    }
  }

  // 필터와 관계없이 '이전/다음 문제'는 전체 문항 번호 순서(1~999)로 이동한다.
  const maxNo = Number(data?.max_no) || 999;
  const hasPrev = !!active && active.no > 1;
  const hasNext = !!active && active.no < maxNo;

  function goToNo(no) {
    if (!Number.isInteger(no) || no < 1 || no > maxNo) return;
    // 필터가 없으면 목록 페이지도 현재 문제 위치로 맞춰 '목록으로'가 자연스럽게 이어지게 한다.
    if (!type && !multi) {
      const targetPage = Math.floor((no - 1) / PAGE_SIZE) + 1;
      if (targetPage !== page) setPage(targetPage);
    }
    const cached = data?.items?.find((q) => q.no === no);
    if (cached) {
      setActive(cached);
      return;
    }
    get(`/questions/by-no/${no}`)
      .then((q) => setActive(q))
      .catch((e) => alert(e.message));
  }

  function goPrev() {
    if (active) goToNo(active.no - 1);
  }

  function goNext() {
    if (active) goToNo(active.no + 1);
  }

  // 현재 문제가 선택한 필터에 속하는지 (순차 이동은 필터와 무관하게 동작)
  const matchesFilter =
    !!active &&
    (!type ||
      (type === "image"
        ? (active.images?.length || 0) > 0
        : (active.images?.length || 0) === 0)) &&
    (!multi ||
      (multi === "1"
        ? active.answer?.length === 1
        : (active.answer?.length || 0) > 1));

  return (
    <div className="page">
      <div className="filters">
        <label>
          유형
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">전체</option>
            <option value="text">문장형</option>
            <option value="image">이미지(사진/일러스트/표지)형</option>
          </select>
        </label>
        <label>
          정답수
          <select value={multi} onChange={(e) => setMulti(e.target.value)}>
            <option value="">전체</option>
            <option value="1">1답 (사지선다)</option>
            <option value="2">2답 (오지선다)</option>
          </select>
        </label>
        <span className="muted">
          {data ? `${data.total}문항` : "..."}
        </span>
      </div>

      {active ? (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <button className="btn ghost" onClick={() => setActive(null)}>
              ← 목록으로
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={goPrev} disabled={!hasPrev}>
                ← 이전 문제
              </button>
              <button className="btn primary" onClick={goNext} disabled={!hasNext}>
                다음 문제 →
              </button>
            </div>
          </div>
          <h2>문제 {active.no}번</h2>
          {!matchesFilter && (
            <p className="muted small" style={{ marginTop: -4 }}>
              현재 문제는 선택한 필터에 포함되지 않지만, 전체 번호 순서(1~{maxNo})로 이어서 풀고 있습니다.
            </p>
          )}
          <QuestionView
            key={active.id}
            q={active}
            onAnswered={(ua, ic) => handleAnswered(active.id, ua, ic)}
            aiExplain={(id, wrong, onDelta, opts = {}) =>
              postStream(
                "/rag/explain",
                {
                  questionId: id,
                  wrongAnswer: wrong,
                  stream: true,
                  searchMode: opts.searchMode || "hybrid",
                  alpha: opts.alpha ?? 0.6,
                },
                { onDelta, onMeta: opts.onMeta }
              )
            }
            onNext={goNext}
            onPrev={goPrev}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onBack={() => setActive(null)}
          />
        </div>
      ) : (
        <div className="q-list">
          {!loading && data && (
            <div className="pager top">
              <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ← 이전
              </button>
              <span className="muted">
                {page} / {totalPages}
              </span>
              <button className="btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                다음 →
              </button>
            </div>
          )}
          {loading && <p className="muted">로딩 중...</p>}
          {!loading && data?.items.map((q) => (
            <div key={q.id} className="q-list-item">
              <div className="q-list-head">
                <button className="btn link" onClick={() => setActive(q)}>
                  {q.no}번 · {q.question.slice(0, 70)}
                </button>
                {q.answer.length > 1 && <span className="tag multi">복수정답</span>}
                {q.images.length > 0 && <span className="tag img">이미지</span>}
                {q.has_video && <span className="tag video">영상</span>}
              </div>
            </div>
          ))}
          {!loading && data && (
            <div className="pager">
              <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ← 이전
              </button>
              <span className="muted">
                {page} / {totalPages}
              </span>
              <button className="btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                다음 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
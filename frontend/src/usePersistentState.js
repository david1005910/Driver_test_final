import { useEffect, useState } from "react";

export function readStored(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

const MISSING = Symbol("missing");

export function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 저장 공간이 없거나 시크릿 모드인 경우 무시
  }
}

export function clearStored(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    // 무시
  }
}

// useState와 동일하게 쓰되, 값이 바뀔 때마다 localStorage에 저장하고
// 새로고침/탭 전환 후에도 마지막 값을 복원한다.
// isValid를 넘기면 손상된 저장값은 초기값으로 복구한다.
export function usePersistentState(key, initialValue, isValid) {
  const [value, setValue] = useState(() => {
    const fallback = typeof initialValue === "function" ? initialValue() : initialValue;
    const stored = readStored(key, MISSING);
    if (stored === MISSING) return fallback;
    if (isValid) return isValid(stored) ? stored : fallback;
    if (stored === null && fallback !== null) return fallback;
    if (fallback !== null && typeof stored !== typeof fallback) return fallback;
    return stored;
  });

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}

// 화면(문제)별 스크롤 위치를 기억한다. key가 바뀌면 이전 위치를 저장하고
// 새 화면의 저장된 위치로 이동한다.
export function useScrollMemory(key, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    let timer = null;
    let frame = 0;
    const save = () => {
      writeStored(key, window.scrollY);
    };
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 150);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", save);

    const saved = Number(readStored(key, 0)) || 0;
    frame = window.requestAnimationFrame(() => window.scrollTo(0, saved));

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", save);
      if (timer) clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      save();
    };
  }, [key, enabled]);
}

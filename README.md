# 운전면허 필기시험 학습 앱 (Driver Test)

도로교통공단 **학과시험 문제은행(999문항)** 기반의 운전면허 필기시험 대비 풀스택 앱입니다.

- **전체 학습**: 문장형/이미지형, 1답(4지선다)/2답(5지선다) 필터링으로 전체 문항 학습
- **모의고사**: 40문항·40분, 1종(합격 70점)/2종(합격 60점) 실전 구조, 채점·합격 판정
- **오답노트**: 틀린 문제 자동 등록. 다시 맞히면 노트에서 자동 제거
- **AI 튜터 (RAG)**: 문제은행을 임베딩(`nomic-embed-text`), 유사문제를 검색해 LLM(`qwen2.5:3b`)이 근거 기반 해설/추천 문제 제공

## 구조

```
Driver_test/
├── docker-compose.yml          # api / web / db (MySQL 8.4)
├── scripts/extract_pdf.py      # PDF → data/bank.json 추출 (재실행용)
├── data/
│   ├── bank.json               # 999문항 원본 (no/question/options/answer/explanation/images)
│   ├── images/                 # 289개 문제 이미지 PNG
│   ├── videos/                 # 966~999번 동영상 MP4 (git 제외, fetch_videos.py로 생성)
│   └── videos.json             # 동영상 문제 ↔ 공식 게시글/영상 메타데이터
├── backend/                    # Node.js + Express + MySQL
│   └── src/
│       ├── server.js           # API 서버 (정적 dist 서빙 겸)
│       ├── sql/init.sql        # 테이블 생성 (db 컨테이너 자동 실행)
│       ├── routes/             # questions / exam / wrong / stats / rag
│       ├── services/           # ollama 연동, embedding+RAG, ragService
│       └── scripts/            # importBank / buildEmbeddings / seed
└── frontend/                   # React + Vite (대시보드·학습·모의고사·오답노트·AI튜터)
```

## 실행 방법

사전 요구: Docker Desktop(Windows/WSL2), 호스트에서 Ollama 실행 `localhost:11434`
필요 모델: `nomic-embed-text`, `qwen2.5:3b`

```bash
# 1. Ollama에 모델이 없으면
ollama pull nomic-embed-text
ollama pull qwen2.5:3b

# 2. 빌드 및 기동
docker compose up -d --build

# 3. 999문항 임포트 + 999개 임베딩 구축 (RAG에 필요, 최초 1회)
docker exec driver_test_api node src/scripts/seed.js
```

접속 주소:

| 서비스   | 주소                          |
| -------- | ----------------------------- |
| 프론트   | http://localhost:5173         |
| API      | http://localhost:3002         |
| MySQL    | localhost:3307                |

## 주요 API

| 메서드 | 경로                        | 설명                                   |
| ------ | --------------------------- | -------------------------------------- |
| GET    | `/api/questions`            | 문항 목록 (type/multi/page/limit 필터)  |
| GET    | `/api/questions/random`     | 랜덤 문항                              |
| POST   | `/api/questions/:id/answer` | 정답 제출 (오답노트 자동 등록)          |
| GET    | `/api/exam/paper`           | 모의고사 문항 구성 (license/count)      |
| POST   | `/api/exam/grade`           | 모의고사 제출·채점·합격 판정            |
| GET    | `/api/wrong`                | 오답노트 목록                           |
| DELETE | `/api/wrong/:id`            | 오답노트에서 제거                       |
| GET    | `/api/stats`                | 학습 통계 대시보드                      |
| GET    | `/api/rag/status`           | Rag 상태 (Ollama 연결/임베딩 수)        |
| POST   | `/api/rag/explain`          | 틀린 문제 RAG 해설 + 유사문제 추천      |
| POST   | `/api/rag/ask`              | 자유 질의 RAG 답변                      |

## 데이터 재구축

```bash
# 데이터만 초기화
docker compose down -v          # vol data 포함 전부 삭제
docker compose up -d --build
docker exec driver_test_api node src/scripts/seed.js

# 이미지 포함 문제도 data/images/, scripts/ 디렉토리를 그대로 두면 자동 반영
```

## 동영상 문제 (966~999번)

공식 문제은행의 동영상 문제는 PDF에 영상이 포함되어 있지 않습니다. 아래 스크립트가 도로교통공단 '동영상 문제' 게시글에서 최신 영상을 받아 `data/videos/{번호}.mp4`로 저장하고, 브라우저 호환을 위해 WMV는 H.264/AAC MP4로 변환합니다.

```bash
# ffmpeg 필요 (macOS: brew install ffmpeg)
python3 scripts/fetch_videos.py

# 이미 받은 영상은 건너뛰고, 없는 영상만 받는다.
# 전부 다시 받으려면 --force
python3 scripts/fetch_videos.py --force
```

- 앱에서는 `/api/videos/{번호}`로 재생되며, 학습·오답노트·모의고사 화면에 영상 플레이어가 표시됩니다.
- 영상 파일은 `data/videos/`에만 저장되고 git에는 포함되지 않습니다. (`data/videos.json` 메타데이터만 추적)
- 영상이 없는 상태에서는 기존처럼 문제에 `(홈페이지 참조)` 안내가 유지됩니다.

## 문제은행 출처 및 재추출

- 출처: [안전운전 통합민원](https://www.safedriving.or.kr) 공식 게시물(2026-03-09 시행 문제은행 PDF, `/tmp/driver_bank.pdf`)
- 공공데이터포털 CSV는 로그인/캡차로 자동 다운로드가 불가해 PDF 파싱 방식 선택
- 재추출이 필요하면:
  ```bash
  python3 -m pip install pymupdf
  python3 scripts/extract_pdf.py /tmp/driver_bank.pdf
  ```
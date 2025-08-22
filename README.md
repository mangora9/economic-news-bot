# 📰 뉴스봇

GitHub Actions로 자동 실행되는 슬랙 뉴스봇입니다.

## 🚀 주요 기능

- **경제/부동산/GeekNews** 카테고리별 뉴스 전송
- **30분마다 자동 실행** (GitHub Actions)

## ⚙️ 설정

### 1. 환경변수 설정

GitHub Repository Settings > Secrets에 추가:

- `SLACK_BOT_TOKEN`: 슬랙 봇 토큰
- `ECONOMY_CHANNEL_ID`: 경제뉴스 채널 ID (필수)
- `REALESTATE_CHANNEL_ID`: 부동산뉴스 채널 ID (필수)  
- `GEEKNEWS_CHANNEL_ID`: 긱뉴스 채널 ID (필수)

### 2. 뉴스 카테고리 설정

`news-config.json`에서 카테고리별 설정:

```json
{
  "categories": {
    "economy": {
      "name": "경제",
      "emoji": "📈",
      "feeds": [
        { "name": "매일경제", "url": "https://www.mk.co.kr/rss/30100041/" },
        { "name": "한국경제", "url": "https://www.hankyung.com/feed/economy" }
      ]
    }
  }
}
```

### 3. 로컬 실행

```bash
npm install
# 모든 환경변수 설정하여 실행
SLACK_BOT_TOKEN=your_token \
ECONOMY_CHANNEL_ID=C1234 \
REALESTATE_CHANNEL_ID=C5678 \
GEEKNEWS_CHANNEL_ID=C9ABC \
node index.js
```

## 📂 구조

```
news-bot/
├── index.js           # 메인 코드 (강화된 중복 방지)
├── news-config.json   # 카테고리별 RSS 피드 설정
├── package.json       # 최적화된 의존성 (rss-parser, node-fetch)
└── README.md         # 사용법
```

## 🔧 커스터마이징

- **시간 범위**: `index.js`의 `getTimeWindow()` 함수에서 90분 범위 조정
- **유사성 임계값**: `isSimilarTitle()` 함수에서 `threshold = 0.75` 조정  
- **재시도 횟수**: `fetchRSSWithRetry()`, `sendToSlackWithRetry()` 함수에서 `maxRetries` 조정
- **카테고리 추가**: `news-config.json`에 새 카테고리 추가
- **RSS 피드 추가**: 각 카테고리의 `feeds` 배열에 추가

## ✨ 개선된 시스템

### 시간대 처리 개선

- **한국시간 통일**: 모든 RSS 피드를 한국시간으로 정확 변환
- **유연한 시간 윈도우**: 최근 90분 기사 처리로 놓치는 기사 최소화
- **GeekNews 문제 해결**: 시간대 차이로 인한 기사 누락 완전 해결

### 전역 중복 방지

- **전역 중복 제거**: 모든 카테고리에서 중복 기사 차단
- **최적화된 알고리즘**: Set 기반 유사성 검사로 성능 향상
- **정확한 필터링**: 제목 정규화 + 75% 유사성 임계값

### 강화된 안정성

- **재시도 로직**: RSS 피드, Slack API 실패 시 지수 백오프 재시도
- **병렬 처리**: RSS 피드 동시 처리로 속도 향상
- **순차 전송**: 카테고리별 순차 처리로 동기화 문제 해결
- **상세 로깅**: 실행 과정 및 결과 상세 모니터링

### 최적화된 의존성

- **rss-parser**: RSS 피드 파싱
- **node-fetch**: HTTP 요청

---

MIT License

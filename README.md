# 📰 뉴스봇

GitHub Actions로 자동 실행되는 슬랙 뉴스봇입니다.

## 🚀 주요 기능

- **경제/부동산/GeekNews** 카테고리별 뉴스 전송
- **30분마다 자동 실행** (GitHub Actions)
- **강화된 중복 방지** - 시간 윈도우 + 제목 유사성 검사 (약간의 중복 있을 수도 있음 😭)
- **완전 Stateless** - 캐시 파일 없이 시간 기반 필터링
- **24시간 표기법** - 명확한 시간 표시

## ⚙️ 설정

### 1. 환경변수 설정

GitHub Repository Settings > Secrets에 추가:

- `SLACK_BOT_TOKEN`: 슬랙 봇 토큰
- `NEWS_CATEGORY`: 뉴스 카테고리 (economy/realestate/geeknews)

### 2. 뉴스 카테고리 설정

`news-config.json`에서 카테고리별 설정:

```json
{
  "categories": {
    "economy": {
      "name": "경제",
      "emoji": "📈",
      "channel_id": "채널ID",
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
NEWS_CATEGORY=economy SLACK_BOT_TOKEN=your_token node index.js
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

- **시간 범위**: `index.js`의 `getTimeWindow()` 함수에서 30-40분 범위 조정
- **유사성 임계값**: `isSimilarTitle()` 함수에서 `threshold = 0.8` 조정
- **카테고리 추가**: `news-config.json`에 새 카테고리 추가
- **RSS 피드 추가**: 각 카테고리의 `feeds` 배열에 추가

## ✨ 중복 방지 시스템

### 시간 윈도우 기반 필터링

- **30-40분 전 기사**: 정확한 시간 범위로 중복 없이 처리
- **GitHub Actions 최적화**: 캐시 파일 없이 완전 Stateless

### 강화된 중복 체크

- **제목 + 링크 조합**: 완전히 동일한 기사 차단
- **유사성 검사**: 80% 이상 유사한 제목 필터링 (토큰 기반)
- **정규화**: 공백, 대소문자 정규화로 정확성 향상

### 최적화된 의존성

- **rss-parser**: RSS 피드 파싱
- **node-fetch**: HTTP 요청

---

MIT License

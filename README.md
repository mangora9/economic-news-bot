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

### 3. 실행

```bash
npm install
npm start
```

## 📂 구조

```
news-bot/
├── .github/workflows/
│   └── news-bot.yml   # GitHub Actions 워크플로우 (30분마다)
├── index.js           # 메인 코드 (Stateless)
├── news-config.json   # 카테고리 설정
└── package.json       # 의존성
```

## 🔧 커스터마이징

- **실행 주기**: `.github/workflows/news-bot.yml`에서 cron 수정
- **시간 범위**: `index.js`에서 `1 * 60 * 60 * 1000` (1시간) 조정
- **카테고리 추가**: `news-config.json`에 새 카테고리 추가
- **RSS 피드 추가**: 각 카테고리의 `feeds` 배열에 추가

## ✨ Stateless 구조

### 완전한 Stateless 설계

- **상태 파일 없음**: 파일 저장/관리 불필요
- **Git 히스토리 깔끔함**: 커밋/푸시 없이 깔끔한 저장소 유지
- **무한 확장성**: 새 카테고리 추가해도 추가 설정 불필요

### 시간 기반 필터링

- **최근 1시간 기사**: 30분마다 실행하여 놓치는 뉴스 없음
- **중복 제거**: 제목 기반 중복 필터링
- **24시간 표기법**: 명확한 시간 표시

---

MIT License

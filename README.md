# 📰 뉴스봇

GitHub Actions로 자동 실행되는 슬랙 뉴스봇입니다.

## 🚀 주요 기능

- **경제/부동산/GeekNews** 카테고리별 뉴스 전송
- **1시간마다 자동 실행** (GitHub Actions)
- **중복 방지** - 새로운 기사만 전송
- **모든 신규 뉴스 전송** - 발견한 모든 신규 기사 전송
- **캐시 기반 상태 관리** - Git 커밋 없이 상태 저장
- **무료** - GitHub Actions 사용

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
      "channel_id": "C099X9M231T",
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
│   └── news-bot.yml   # GitHub Actions 워크플로우 (캐시 사용)
├── index.js           # 메인 코드
├── news-config.json   # 카테고리 설정
├── last_check.json    # 마지막 확인 시간 (캐시로 관리)
└── package.json       # 의존성
```

## 🔧 커스터마이징

- **실행 주기**: `.github/workflows/news-bot.yml`에서 cron 수정
- **카테고리 추가**: `news-config.json`에 새 카테고리 추가
- **RSS 피드 추가**: 각 카테고리의 `feeds` 배열에 추가

## ✨ 개선된 구조

### GitHub Actions Cache 사용

- **Git 히스토리 오염 없음**: 더 이상 매시간 커밋이 쌓이지 않음
- **빠른 상태 복원**: 캐시를 통한 효율적인 상태 관리
- **최소 권한**: `actions: read`만 사용

### 완전한 뉴스 전송

- 발견한 모든 신규 뉴스를 전송 (기존 5개 제한 제거)
- 놓치는 뉴스 없이 완전한 모니터링

---

MIT License

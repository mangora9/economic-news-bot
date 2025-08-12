# 📰 슬랙 경제뉴스봇

GitHub Actions로 1시간마다 자동 실행되는 경제뉴스 슬랙봇입니다.

## ✨ 특징

- 🕐 **1시간마다 자동 실행** (GitHub Actions)
- 📊 **매일경제(mk), 한국경제(hk)** RSS 피드 모니터링
- ⏰ **효율적 중복 방지** - 마지막 확인 시간 기반 필터링
- 🆓 **완전 무료** - GitHub Actions 무료 할당량 사용
- ⚡ **함수형 프로그래밍** - 깔끔한 ES6 모듈 구조
- 📦 **최소 용량** - 기사 내용 저장 없이 시간만 기록 (용량 효율적)

## 🔧 최적화 포인트

### 왜 기사 ID 대신 시간을 저장하나요?

- **용량 효율성**: 기사 ID를 계속 저장하면 파일이 커집니다
- **간단함**: 마지막 확인 시간만 있으면 충분합니다
- **정확성**: 1시간마다 실행되니 지난 시간 이후 기사만 확인하면 됩니다

## 🚀 설정 방법

### 1. Repository 포크/클론

```bash
git clone https://github.com/your-username/slack-news-bot.git
cd slack-news-bot
```

### 2. 슬랙 웹훅 URL 설정

1. [api.slack.com/apps](https://api.slack.com/apps)에서 앱 생성
2. "Incoming Webhooks" 활성화
3. 웹훅 URL 복사

### 3. GitHub Secrets 설정

1. GitHub Repository > **Settings** > **Secrets and variables** > **Actions**
2. **"New repository secret"** 클릭
3. Name: `SLACK_WEBHOOK_URL`
4. Value: 복사한 웹훅 URL
5. **"Add secret"** 클릭

### 4. 로컬 개발 설정 (선택사항)

```bash
# 패키지 설치
npm install

# .env 파일 생성
cp .env .env.local
# .env.local 파일을 열어서 실제 웹훅 URL로 수정

# 로컬 테스트
npm start
```

### 5. 실행 확인

- **자동 실행**: 1시간마다 자동으로 실행됩니다
- **수동 실행**: Actions 탭에서 "Run workflow" 클릭

## 📁 프로젝트 구조

```
slack-news-bot/
├── .github/workflows/
│   └── news-bot.yml          # GitHub Actions 워크플로우
├── index.js                  # 메인 봇 코드 (함수형)
├── package.json              # 프로젝트 설정 (ES6 모듈)
├── last_check.json           # 마지막 확인 시간 (자동 업데이트)
├── .env                      # 로컬 개발용 환경변수
├── .gitignore               # Git 제외 파일
└── README.md                 # 이 파일
```

## 🔧 커스터마이징

### 실행 주기 변경

`.github/workflows/news-bot.yml`에서 cron 표현식 수정:

```yaml
schedule:
  - cron: "0 */2 * * *" # 2시간마다
  - cron: "0 9 * * *" # 매일 오전 9시
  - cron: "0 9,18 * * *" # 오전 9시, 오후 6시
```

### 뉴스 소스 추가

`index.js`의 `NEWS_SOURCES` 객체에 새로운 소스 추가:

```javascript
const NEWS_SOURCES = {
  mk: {
    name: "매일경제",
    url: "https://www.mk.co.kr/rss/30000001/",
    emoji: "📊",
  },
  hk: {
    name: "한국경제",
    url: "https://www.hankyung.com/feed/all-news",
    emoji: "💼",
  },
  ytn: {
    name: "YTN 경제",
    url: "https://www.ytn.co.kr/_rss/economy.xml",
    emoji: "📈",
  },
};
```

### 기사 개수 조절

`index.js`에서 `.slice(0, 5)` 숫자 변경:

```javascript
.slice(0, 3)  // 3개까지
.slice(0, 1)  // 1개만
```

## 📊 모니터링

- **실행 로그**: Actions 탭에서 확인
- **상태 파일**: `last_check.json`이 자동으로 업데이트됨 (각 소스별 마지막 확인 시간)
- **마지막 실행**: Repository 커밋 기록에서 확인

## 🆓 비용

GitHub Actions 무료 할당량:

- **Public 저장소**: 무제한 (무료)
- **Private 저장소**: 월 2000분 (충분함)

1시간마다 실행시 월 사용량: 약 30분 (매우 적음)

## 🔍 문제 해결

### "SLACK_WEBHOOK_URL이 설정되지 않았습니다"

- GitHub Secrets에 웹훅 URL이 제대로 설정되었는지 확인
- 로컬에서는 `.env` 파일에 올바른 URL이 있는지 확인

### "새로운 기사가 없습니다"

- 정상 작동입니다. 새 기사가 있을 때만 알림을 보냅니다.

### Actions가 실행되지 않음

- Repository가 60일 이상 비활성화되면 자동 비활성화됩니다
- Actions 탭에서 수동으로 활성화하세요

### 너무 많은 기사가 와요

- `index.js`에서 `.slice(0, 5)`를 더 작은 숫자로 변경하세요

### 특정 키워드만 받고 싶어요

```javascript
// filterNewArticles 함수 수정
function filterNewArticles(articles, lastCheckTime) {
  return articles
    .filter((article) => article.pubDate > lastCheckTime)
    .filter(
      (article) =>
        article.title.includes("삼성") ||
        article.title.includes("코스피") ||
        article.title.includes("금리")
    );
}
```

## 📄 라이센스

MIT License - 자유롭게 사용하세요!

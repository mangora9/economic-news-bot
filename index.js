// index.js - GitHub Actions 함수형 뉴스봇 (최적화 버전)
import xml2js from "xml2js";
import fs from "fs/promises";

// 로컬 개발용 .env 파일 로드 (GitHub Actions에서는 무시됨)
if (process.env.NODE_ENV !== "production") {
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch (error) {
    // dotenv가 없어도 에러 안남
  }
}

// 뉴스 소스 설정 (영문 키 사용)
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
};

const LAST_CHECK_FILE = "last_check.json";

// 슬랙으로 메시지 전송
async function sendToSlack(webhookUrl, message) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (response.ok) {
      console.log("✅ 슬랙 전송 완료");
      return true;
    } else {
      console.log("❌ 슬랙 전송 실패:", response.status);
      return false;
    }
  } catch (error) {
    console.log("❌ 슬랙 전송 오류:", error.message);
    return false;
  }
}

// XML 텍스트 안전하게 추출
function extractText(field) {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (Array.isArray(field) && field.length > 0) return field[0];
  if (field._ !== undefined) return field._;
  return String(field);
}

// RSS 피드 파싱
async function parseRSSFeed(sourceKey, sourceConfig) {
  try {
    console.log(`📡 ${sourceConfig.name} 뉴스 확인 중...`);

    const response = await fetch(sourceConfig.url);
    const xmlData = await response.text();

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);

    // RSS 구조에 따라 아이템 추출
    let items = [];
    if (result.rss && result.rss.channel) {
      items = result.rss.channel[0].item || [];
    } else if (result.feed && result.feed.entry) {
      items = result.feed.entry || [];
    }

    return items.map((item) => ({
      title: extractText(item.title),
      link: extractText(item.link),
      description: extractText(item.description || item.summary),
      pubDate: new Date(
        extractText(item.pubDate || item.published) || Date.now()
      ),
      source: sourceKey,
      sourceName: sourceConfig.name,
      emoji: sourceConfig.emoji,
    }));
  } catch (error) {
    console.log(`❌ ${sourceConfig.name} RSS 파싱 오류:`, error.message);
    return [];
  }
}

// 마지막 확인 시간 불러오기
async function loadLastCheckTimes() {
  try {
    const data = await fs.readFile(LAST_CHECK_FILE, "utf8");
    const parsed = JSON.parse(data);

    // 문자열을 Date 객체로 변환
    const result = {};
    for (const [key, value] of Object.entries(parsed)) {
      result[key] = new Date(value);
    }
    return result;
  } catch (error) {
    console.log("📝 마지막 확인 시간 기록 없음 (첫 실행)");
    // 기본값: 1시간 30분 전 (여유있게)
    const defaultTime = new Date(Date.now() - 90 * 60 * 1000);
    return {
      mk: defaultTime,
      hk: defaultTime,
    };
  }
}

// 마지막 확인 시간 저장
async function saveLastCheckTimes(checkTimes) {
  try {
    // Date 객체를 문자열로 변환해서 저장
    const toSave = {};
    for (const [key, value] of Object.entries(checkTimes)) {
      toSave[key] = value.toISOString();
    }

    await fs.writeFile(LAST_CHECK_FILE, JSON.stringify(toSave, null, 2));
    console.log("💾 확인 시간 저장 완료");
  } catch (error) {
    console.log("❌ 확인 시간 저장 실패:", error.message);
  }
}

// 새로운 기사만 필터링 (발행 시간 기준)
function filterNewArticles(articles, lastCheckTime) {
  return articles.filter((article) => article.pubDate > lastCheckTime);
}

// 슬랙 메시지 블록 생성
function createSlackMessage(articles) {
  const message = {
    username: "경제뉴스봇",
    icon_emoji: ":newspaper:",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📰 새로운 경제뉴스 ${articles.length}개`,
        },
      },
      { type: "divider" },
    ],
  };

  // 각 기사를 블록으로 추가
  articles.forEach((article, index) => {
    // 설명 정리
    let description = article.description || "";
    if (description.length > 80) {
      description = description.substring(0, 80) + "...";
    }
    description = description.replace(/<[^>]*>/g, "").trim();

    message.blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${article.emoji} *${article.title}*\n${description}`,
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "읽기",
        },
        url: article.link,
        action_id: `read_article_${index}`,
      },
    });

    // 기사 사이에 구분선 (마지막 제외)
    if (index < articles.length - 1) {
      message.blocks.push({ type: "divider" });
    }
  });

  return message;
}

// 모든 뉴스 소스에서 새로운 기사 확인
async function checkAllNewArticles() {
  console.log("🔍 새로운 기사 확인 시작...");

  // 마지막 확인 시간 불러오기
  const lastCheckTimes = await loadLastCheckTimes();

  const allNewArticles = [];
  const newCheckTimes = {};
  const currentTime = new Date();

  // 각 뉴스 소스 확인
  for (const [sourceKey, sourceConfig] of Object.entries(NEWS_SOURCES)) {
    try {
      const articles = await parseRSSFeed(sourceKey, sourceConfig);

      // 마지막 확인 시간 이후 기사만 필터링
      const lastCheck =
        lastCheckTimes[sourceKey] || new Date(Date.now() - 90 * 60 * 1000);
      const newArticles = filterNewArticles(articles, lastCheck).slice(0, 5); // 최대 5개

      if (newArticles.length > 0) {
        allNewArticles.push(...newArticles);
        console.log(
          `${sourceConfig.emoji} ${sourceConfig.name}: ${newArticles.length}개 새 기사`
        );
      } else {
        console.log(
          `${sourceConfig.emoji} ${sourceConfig.name}: 새로운 기사 없음`
        );
      }

      // 현재 시간을 새로운 확인 시간으로 설정
      newCheckTimes[sourceKey] = currentTime;
    } catch (error) {
      console.log(`❌ ${sourceConfig.name} 확인 실패:`, error.message);
      // 이전 확인 시간 유지
      newCheckTimes[sourceKey] = lastCheckTimes[sourceKey] || new Date();
    }
  }

  // 새로운 확인 시간 저장
  await saveLastCheckTimes(newCheckTimes);

  return allNewArticles;
}

// 메인 실행 함수
async function main() {
  console.log("🚀 GitHub Actions 뉴스봇 실행");
  console.log("🕐 실행 시간:", new Date().toLocaleString("ko-KR"));

  // 웹훅 URL 확인
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl || webhookUrl.includes("YOUR/WEBHOOK/URL")) {
    console.log(
      "❌ SLACK_WEBHOOK_URL 환경변수가 올바르게 설정되지 않았습니다!"
    );
    console.log(
      "GitHub Repository Settings > Secrets에서 설정하거나 .env 파일을 확인해주세요."
    );
    process.exit(1);
  }

  try {
    // 새로운 기사들 확인
    const newArticles = await checkAllNewArticles();

    if (newArticles.length > 0) {
      console.log(`📢 총 ${newArticles.length}개 새 기사 발견`);

      // 발행 시간 순으로 정렬 (최신순)
      newArticles.sort((a, b) => b.pubDate - a.pubDate);

      // 슬랙으로 전송
      const message = createSlackMessage(newArticles);
      await sendToSlack(webhookUrl, message);
    } else {
      console.log("📭 새로운 기사가 없습니다");
    }

    console.log("✅ 봇 실행 완료");
  } catch (error) {
    console.error("❌ 봇 실행 오류:", error);
    process.exit(1);
  }
}

// 스크립트가 직접 실행될 때만 main() 호출
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

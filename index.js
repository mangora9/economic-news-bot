import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs";

const parser = new Parser();

// 환경변수로 카테고리 지정 (기본값: economy)
const CATEGORY = process.env.NEWS_CATEGORY || "economy";

// 설정 파일 로드
const config = JSON.parse(fs.readFileSync("./news-config.json", "utf8"));
const categoryConfig = config.categories[CATEGORY];

if (!categoryConfig) {
  console.error(`Unknown category: ${CATEGORY}`);
  process.exit(1);
}

// Slack Bot Token 확인
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
if (!SLACK_BOT_TOKEN) {
  console.error("SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const CHANNEL_ID = categoryConfig.channel_id;

const rssFeeds = categoryConfig.feeds;

// 시간 범위: 30분 전 ~ 40분 전 기사만 처리
function getTimeWindow() {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const fortyMinutesAgo = new Date(now.getTime() - 40 * 60 * 1000);

  console.log(
    `시간 범위: ${fortyMinutesAgo.toISOString()} ~ ${thirtyMinutesAgo.toISOString()}`
  );
  return { start: fortyMinutesAgo, end: thirtyMinutesAgo };
}

// 기사 고유 키 생성
function generateArticleKey(article) {
  const normalizedTitle = article.title
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${normalizedTitle}|${article.link}`;
}

// 제목 유사성 검사
function isSimilarTitle(title1, title2, threshold = 0.8) {
  const tokens1 = title1
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const tokens2 = title2
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (tokens1.length === 0 || tokens2.length === 0) return false;

  const commonTokens = tokens1.filter((token) => tokens2.includes(token));
  const similarity =
    commonTokens.length / Math.max(tokens1.length, tokens2.length);

  return similarity >= threshold;
}

async function fetchArticles() {
  const timeWindow = getTimeWindow();

  const allArticles = [];
  for (const feed of rssFeeds) {
    try {
      console.log(`Fetching from ${feed.name}: ${feed.url}`);
      const rss = await parser.parseURL(feed.url);

      // 30분 전 ~ 40분 전 기사만 필터링
      const targetArticles = rss.items.filter((item) => {
        const pubDate = new Date(item.pubDate);
        return pubDate >= timeWindow.start && pubDate <= timeWindow.end;
      });

      targetArticles.forEach((item) => {
        allArticles.push({
          title: item.title,
          link: item.link,
          description: item.contentSnippet || item.content || "",
          pubDate: new Date(item.pubDate),
          sourceName: feed.name,
        });
      });

      console.log(
        `${feed.name}에서 총 ${rss.items.length}개 기사 중 ${targetArticles.length}개 대상 기사 발견`
      );
    } catch (error) {
      console.error(`Error fetching from ${feed.name}:`, error.message);
    }
  }

  // 중복 기사 제거 (제목+링크 기준 및 유사성 검사)
  const uniqueArticles = [];
  const seenKeys = new Set();
  const seenTitles = [];

  for (const article of allArticles) {
    const articleKey = generateArticleKey(article);

    // 1. 동일한 키(제목+링크)로 중복 확인
    if (seenKeys.has(articleKey)) {
      continue;
    }

    // 2. 유사한 제목의 기사 확인
    const isDuplicate = seenTitles.some((seenTitle) =>
      isSimilarTitle(article.title, seenTitle)
    );

    if (!isDuplicate) {
      seenKeys.add(articleKey);
      seenTitles.push(article.title);
      uniqueArticles.push(article);
    }
  }

  uniqueArticles.sort((a, b) => b.pubDate - a.pubDate);
  console.log(
    `중복 제거 후: ${uniqueArticles.length}개 기사 (원본: ${allArticles.length}개)`
  );
  return uniqueArticles;
}

function createSlackMessage(articles) {
  let messageText = `${categoryConfig.emoji} *최신 ${categoryConfig.name} 뉴스*\n\n`;

  articles.forEach((article, index) => {
    let description = article.description.replace(/<[^>]*>/g, "").trim();
    if (description.length > 150)
      description = description.substring(0, 150) + "...";

    const pubDateText = article.pubDate.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false, // 24시간 표기법
    });

    let sourceTag;
    if (article.sourceName.includes("매일경제")) {
      sourceTag = "[매일경제]";
    } else if (article.sourceName.includes("한국경제")) {
      sourceTag = "[한국경제]";
    } else {
      sourceTag = `[${article.sourceName}]`;
    }

    messageText += `📰 *${sourceTag} ${article.title}*\n`;
    messageText += `📅 ${pubDateText}\n`;
    messageText += `${description}\n`;
    messageText += `🔗 ${article.link}\n`;

    if (index < articles.length - 1) {
      messageText += `\n${"─".repeat(40)}\n\n`;
    }
  });

  return {
    username: `${categoryConfig.name}뉴스봇`,
    icon_emoji: ":newspaper:",
    text: messageText,
    unfurl_links: false,
    unfurl_media: false,
  };
}

async function sendToSlack(message) {
  const payload = {
    channel: CHANNEL_ID,
    username: message.username,
    icon_emoji: message.icon_emoji,
    text: message.text,
    unfurl_links: message.unfurl_links,
    unfurl_media: message.unfurl_media,
  };

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!result.ok) {
    console.error("Slack API 오류:", result.error);
    throw new Error(`Slack API 오류: ${result.error}`);
  }

  console.log("슬랙 메시지 전송 성공!");
}

(async () => {
  const articles = await fetchArticles();

  if (articles.length === 0) {
    console.log("전송할 새로운 뉴스가 없습니다.");
    return;
  }

  console.log(`${articles.length}개의 새로운 뉴스를 슬랙으로 전송합니다.`);
  const slackMessage = createSlackMessage(articles);
  await sendToSlack(slackMessage);

  console.log("뉴스 전송 완료!");
})();

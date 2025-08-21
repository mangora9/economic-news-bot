import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";

// .env 파일 로드 (로컬 개발용)
dotenv.config();

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

// Stateless 방식: 최근 1시간 기사만 가져오기 (news-bot.yml 에서 30분마다 실행)
function getRecentTimeThreshold() {
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1_000);
  console.log(`최근 1시간 기준 시간: ${oneHourAgo.toISOString()}`);
  return oneHourAgo;
}

async function fetchArticles() {
  const recentTimeThreshold = getRecentTimeThreshold();

  const allArticles = [];
  for (const feed of rssFeeds) {
    try {
      console.log(`Fetching from ${feed.name}: ${feed.url}`);
      const rss = await parser.parseURL(feed.url);

      // 최근 1시간 내 뉴스만 필터링
      const recentArticles = rss.items.filter((item) => {
        const pubDate = new Date(item.pubDate);
        return pubDate > recentTimeThreshold;
      });

      recentArticles.forEach((item) => {
        allArticles.push({
          title: item.title,
          link: item.link,
          description: item.contentSnippet || item.content || "",
          pubDate: new Date(item.pubDate),
          sourceName: feed.name,
        });
      });

      console.log(
        `${feed.name}에서 총 ${rss.items.length}개 기사 중 ${recentArticles.length}개 최근 기사 발견`
      );
    } catch (error) {
      console.error(`Error fetching from ${feed.name}:`, error.message);
      // 하나의 피드가 실패해도 다른 피드는 계속 처리
    }
  }

  // 중복 기사 제거 (제목 기준)
  const uniqueArticles = [];
  const seenTitles = new Set();

  for (const article of allArticles) {
    const normalizedTitle = article.title.replace(/\s+/g, " ").trim();
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle);
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
    console.log("최근 1시간 내 뉴스가 없습니다.");
    return;
  }

  console.log(`${articles.length}개의 최근 뉴스를 슬랙으로 전송합니다.`);
  const slackMessage = createSlackMessage(articles); // 모든 최근 뉴스 전송
  await sendToSlack(slackMessage);

  console.log("뉴스 전송 완료!");
})();

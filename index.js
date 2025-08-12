import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";

// .env 파일 로드 (로컬 개발용)
dotenv.config();

const parser = new Parser();

// 환경변수로 카테고리 지정 (기본값: economy)
const CATEGORY = process.env.NEWS_CATEGORY || "economy";

// 카테고리별 웹훅 URL 설정
const WEBHOOK_URLS = {
  economy: process.env.SLACK_WEBHOOK_URL_ECONOMY,
  realestate: process.env.SLACK_WEBHOOK_URL_REALESTATE,
};

const SLACK_WEBHOOK_URL = WEBHOOK_URLS[CATEGORY];

if (!SLACK_WEBHOOK_URL) {
  console.error(`No webhook URL found for category: ${CATEGORY}`);
  process.exit(1);
}

// 설정 파일 로드
const config = JSON.parse(fs.readFileSync("./news-config.json", "utf8"));
const categoryConfig = config.categories[CATEGORY];

if (!categoryConfig) {
  console.error(`Unknown category: ${CATEGORY}`);
  process.exit(1);
}

const rssFeeds = categoryConfig.feeds;

async function fetchArticles() {
  const allArticles = [];
  for (const feed of rssFeeds) {
    try {
      console.log(`Fetching from ${feed.name}: ${feed.url}`);
      const rss = await parser.parseURL(feed.url);
      rss.items.forEach((item) => {
        allArticles.push({
          title: item.title,
          link: item.link,
          description: item.contentSnippet || item.content || "",
          pubDate: new Date(item.pubDate),
          sourceName: feed.name,
        });
      });
      console.log(
        `Successfully fetched ${rss.items.length} articles from ${feed.name}`
      );
    } catch (error) {
      console.error(`Error fetching from ${feed.name}:`, error.message);
      // 하나의 피드가 실패해도 다른 피드는 계속 처리
    }
  }
  allArticles.sort((a, b) => b.pubDate - a.pubDate);
  return allArticles;
}

function createSlackMessage(articles) {
  const message = {
    username: `${categoryConfig.name}뉴스봇`,
    icon_emoji: ":newspaper:",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${categoryConfig.emoji} 최신 ${categoryConfig.name} 뉴스`,
          emoji: true,
        },
      },
      { type: "divider" },
    ],
  };

  articles.forEach((article) => {
    let description = article.description.replace(/<[^>]*>/g, "").trim();
    if (description.length > 80)
      description = description.substring(0, 80) + "...";

    // 한국 시간으로 변환하여 표시
    const pubDateText = article.pubDate.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let sourceTag;
    if (article.sourceName.includes("매일경제")) {
      sourceTag = "[매일경제]";
    } else if (article.sourceName.includes("한국경제")) {
      sourceTag = "[한국경제]";
    } else {
      sourceTag = `[${article.sourceName}]`;
    }

    message.blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${article.link}|${sourceTag} ${article.title}>*\n:calendar: ${pubDateText}\n${description}`,
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "📖 읽기" },
          style: "primary",
          url: article.link,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `*출처:* ${article.sourceName}` }],
      },
      { type: "divider" }
    );
  });

  return message;
}

async function sendToSlack(message) {
  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}

(async () => {
  const articles = await fetchArticles();
  const slackMessage = createSlackMessage(articles.slice(0, 5));
  await sendToSlack(slackMessage);
})();

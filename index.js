import Parser from "rss-parser";
import fetch from "node-fetch";

const parser = new Parser();
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const rssFeeds = [
  { name: "매일경제", url: "https://www.mk.co.kr/rss/30100041/" },
  { name: "한국경제", url: "https://rss.hankyung.com/feed/economy.xml" },
];

async function fetchArticles() {
  const allArticles = [];
  for (const feed of rssFeeds) {
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
  }
  allArticles.sort((a, b) => b.pubDate - a.pubDate);
  return allArticles;
}

function createSlackMessage(articles) {
  const message = {
    username: "경제뉴스봇",
    icon_emoji: ":newspaper:",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📰 최신 경제 뉴스",
          emoji: true,
        },
      },
      { type: "divider" },
    ],
  };

  articles.forEach((article, index) => {
    let description = article.description.replace(/<[^>]*>/g, "").trim();
    if (description.length > 80)
      description = description.substring(0, 80) + "...";

    const pubDateText = article.pubDate.toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let color;
    let sourceTag;
    if (article.sourceName.includes("매일경제")) {
      color = "#FF8C00"; // 주황
      sourceTag = "[매일경제]";
    } else if (article.sourceName.includes("한국경제")) {
      color = "#1E90FF"; // 파랑
      sourceTag = "[한국경제]";
    } else {
      color = "#808080"; // 회색
      sourceTag = `[${article.sourceName}]`;
    }

    // 카드 스타일 기사 블록
    message.blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${article.link}|${sourceTag} ${article.title}>*\n_${pubDateText}_\n${description}`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "📖 읽기",
          },
          style: "primary",
          url: article.link,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*출처:* ${article.sourceName}`,
          },
          {
            type: "mrkdwn",
            text: `:large_square:`,
          },
        ],
      },
      {
        type: "divider",
      }
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

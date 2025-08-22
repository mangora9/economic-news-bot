import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs";

const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;

const parser = new Parser();

// 설정 파일 로드
const config = JSON.parse(fs.readFileSync("./news-config.json", "utf8"));

// Slack Bot Token 확인
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
if (!SLACK_BOT_TOKEN) {
  console.error("SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

// 한국시간 기준 현재 시간 가져오기
function getKoreanTime() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
}

// 유연한 시간 윈도우 (최근 90분 기사 처리하여 놓치는 기사 최소화)
function getTimeWindow() {
  const now = getKoreanTime();
  const ninetyMinutesAgo = new Date(now.getTime() - 90 * ONE_MINUTE);

  console.log(
    `⏰ 시간 범위 (한국시간): ${ninetyMinutesAgo.toLocaleString(
      "ko-KR"
    )} ~ ${now.toLocaleString("ko-KR")}`
  );
  return { start: ninetyMinutesAgo, end: now };
}

// 기사 고유 키 생성 (전역 중복 방지용)
function generateArticleKey(article) {
  const normalizedTitle = article.title
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${normalizedTitle}|${article.link}`;
}

// 최적화된 제목 유사성 검사 (Set 기반)
function isSimilarTitle(title1, title2, threshold = 0.75) {
  const tokens1 = new Set(
    title1
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );

  const tokens2 = new Set(
    title2
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );

  if (tokens1.size === 0 || tokens2.size === 0) return false;

  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
  const similarity = intersection.size / Math.max(tokens1.size, tokens2.size);

  return similarity >= threshold;
}

// 재시도 로직이 포함된 RSS 피드 가져오기
async function fetchRSSWithRetry(feed, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `📡 [${feed.name}] 피드 가져오기 시도 ${attempt}/${maxRetries}`
      );

      const rssPromise = parser.parseURL(feed.url);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("타임아웃 (10초)")), 10 * ONE_SECOND)
      );

      const rss = await Promise.race([rssPromise, timeoutPromise]);

      // RSS 파싱 결과 검증
      if (!rss) {
        throw new Error(`RSS 파싱 실패: 결과가 null/undefined`);
      }
      if (!rss.items) {
        throw new Error(
          `RSS 파싱 실패: items 속성이 없음 (keys: ${Object.keys(rss).join(
            ", "
          )})`
        );
      }
      if (!Array.isArray(rss.items)) {
        throw new Error(
          `RSS 파싱 실패: items가 배열이 아님 (type: ${typeof rss.items})`
        );
      }

      console.log(
        `✅ [${feed.name}] RSS 파싱 성공: ${rss.items.length}개 항목`
      );
      return { success: true, data: rss, source: feed.name };
    } catch (error) {
      console.error(`❌ [${feed.name}] 시도 ${attempt} 실패:`, error.message);
      if (attempt === maxRetries) {
        return { success: false, error: error.message, source: feed.name };
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt - 1) * ONE_SECOND)
      );
    }
  }
}

// 병렬 RSS 피드 처리
async function fetchArticlesForCategory(categoryKey) {
  const categoryConfig = config.categories[categoryKey];
  if (!categoryConfig) {
    console.error(`❌ 알 수 없는 카테고리: ${categoryKey}`);
    return [];
  }

  const timeWindow = getTimeWindow();
  console.log(`\n🔍 [${categoryConfig.name}] 카테고리 처리 시작`);

  // 모든 RSS 피드를 병렬로 처리
  const feedPromises = categoryConfig.feeds.map((feed) =>
    fetchRSSWithRetry(feed)
  );
  const feedResults = await Promise.all(feedPromises);

  const allArticles = [];
  let successCount = 0;

  for (const result of feedResults) {
    if (result.success) {
      successCount++;
      const rss = result.data;

      // 추가 안전 검사
      if (!rss || !rss.items || !Array.isArray(rss.items)) {
        console.error(`❌ [${result.source}] RSS 데이터가 유효하지 않음`);
        continue;
      }

      // 시간대 처리: 모든 날짜를 한국시간으로 변환
      const targetArticles = rss.items.filter((item) => {
        const pubDate = new Date(item.pubDate);
        // 한국시간으로 변환
        const koreanPubDate = new Date(
          pubDate.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
        );
        return (
          koreanPubDate >= timeWindow.start && koreanPubDate <= timeWindow.end
        );
      });

      targetArticles.forEach((item) => {
        const pubDate = new Date(item.pubDate);
        const koreanPubDate = new Date(
          pubDate.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
        );

        allArticles.push({
          title: item.title,
          link: item.link,
          description: item.contentSnippet || item.content || "",
          pubDate: koreanPubDate,
          sourceName: result.source,
          category: categoryKey,
        });
      });

      console.log(
        `✅ [${result.source}] ${rss.items.length}개 중 ${targetArticles.length}개 대상 기사 발견`
      );
    } else {
      console.error(
        `❌ [${result.source}] 피드 가져오기 실패: ${result.error}`
      );
    }
  }

  console.log(
    `📊 [${categoryConfig.name}] 피드 성공률: ${successCount}/${categoryConfig.feeds.length}`
  );
  return allArticles;
}

// 전역 중복 제거 (모든 카테고리에서 중복 방지)
function removeDuplicatesGlobally(allCategoryArticles) {
  console.log("\n🔄 전역 중복 제거 시작");

  const uniqueArticles = [];
  const seenKeys = new Set();
  const seenTitles = [];

  // 모든 카테고리의 기사를 시간순으로 정렬
  const sortedArticles = allCategoryArticles
    .flat()
    .sort((a, b) => b.pubDate - a.pubDate);

  for (const article of sortedArticles) {
    const articleKey = generateArticleKey(article);

    // 1. 동일한 키(제목+링크)로 중복 확인
    if (seenKeys.has(articleKey)) {
      console.log(
        `🔄 중복 제거 (동일 키): ${article.title.substring(0, 50)}...`
      );
      continue;
    }

    // 2. 유사한 제목의 기사 확인 (최적화된 알고리즘)
    const isDuplicate = seenTitles.some((seenTitle) =>
      isSimilarTitle(article.title, seenTitle)
    );

    if (!isDuplicate) {
      seenKeys.add(articleKey);
      seenTitles.push(article.title);
      uniqueArticles.push(article);
    } else {
      console.log(
        `🔄 중복 제거 (유사 제목): ${article.title.substring(0, 50)}...`
      );
    }
  }

  console.log(
    `✅ 전역 중복 제거 완료: ${sortedArticles.length}개 → ${uniqueArticles.length}개`
  );
  return uniqueArticles;
}

// 카테고리별 기사 그룹화
function groupArticlesByCategory(articles) {
  const grouped = {};
  for (const article of articles) {
    if (!grouped[article.category]) {
      grouped[article.category] = [];
    }
    grouped[article.category].push(article);
  }
  return grouped;
}

function createSlackMessage(articles, categoryKey) {
  const categoryConfig = config.categories[categoryKey];
  let messageText = `${categoryConfig.emoji} *최신 ${categoryConfig.name} 뉴스* (${articles.length}건)\n\n`;

  articles.forEach((article, index) => {
    let description = article.description.replace(/<[^>]*>/g, "").trim();
    if (description.length > 120) {
      description = description.substring(0, 120) + "...";
    }

    const pubDateText = article.pubDate.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    let sourceTag = `[${article.sourceName}]`;
    if (article.sourceName.includes("매일경제")) {
      sourceTag = "[매경]";
    } else if (article.sourceName.includes("한국경제")) {
      sourceTag = "[한경]";
    } else if (article.sourceName.includes("GeekNews")) {
      sourceTag = "[긱뉴스]";
    }

    messageText += `📰 *${sourceTag} ${article.title}*\n`;
    messageText += `📅 ${pubDateText}\n`;
    if (description) {
      messageText += `${description}\n`;
    }
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

// 재시도 로직이 포함된 Slack 전송
async function sendToSlackWithRetry(
  message,
  channelId,
  categoryName,
  maxRetries = 3
) {
  const payload = {
    channel: channelId,
    username: message.username,
    icon_emoji: message.icon_emoji,
    text: message.text,
    unfurl_links: message.unfurl_links,
    unfurl_media: message.unfurl_media,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `📤 [${categoryName}] Slack 전송 시도 ${attempt}/${maxRetries}`
      );

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
        throw new Error(`Slack API 오류: ${result.error}`);
      }

      console.log(`✅ [${categoryName}] Slack 전송 성공!`);
      return { success: true };
    } catch (error) {
      console.error(
        `❌ [${categoryName}] Slack 전송 시도 ${attempt} 실패:`,
        error.message
      );
      if (attempt === maxRetries) {
        return { success: false, error: error.message };
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt - 1) * ONE_SECOND)
      );
    }
  }
}

// 메인 실행 함수
(async () => {
  console.log("🚀 뉴스봇 실행 시작");
  console.log(
    `📅 실행 시간 (한국시간): ${getKoreanTime().toLocaleString("ko-KR")}`
  );

  const startTime = Date.now();
  const categories = Object.keys(config.categories);
  const results = {
    success: 0,
    failed: 0,
    totalArticles: 0,
    errors: [],
  };

  try {
    // 1. 모든 카테고리의 기사를 병렬로 가져오기
    console.log(`\n📡 ${categories.length}개 카테고리 처리 시작`);
    const categoryPromises = categories.map((category) =>
      fetchArticlesForCategory(category)
    );
    const allCategoryArticles = await Promise.all(categoryPromises);

    // 2. 전역 중복 제거
    const uniqueArticles = removeDuplicatesGlobally(allCategoryArticles);

    if (uniqueArticles.length === 0) {
      console.log("📭 전송할 새로운 뉴스가 없습니다.");
      return;
    }

    // 3. 카테고리별로 그룹화 후 순차 전송
    const groupedArticles = groupArticlesByCategory(uniqueArticles);

    console.log("\n📤 카테고리별 Slack 전송 시작");

    for (const [categoryKey, articles] of Object.entries(groupedArticles)) {
      if (articles.length === 0) continue;

      const categoryConfig = config.categories[categoryKey];
      const channelEnvKey = `${categoryKey.toUpperCase()}_CHANNEL_ID`;
      const channelId = process.env[channelEnvKey];

      if (!channelId) {
        console.error(
          `❌ [${categoryConfig.name}] 채널 ID가 설정되지 않았습니다. 환경변수 ${channelEnvKey}를 확인하세요.`
        );
        results.failed++;
        results.errors.push(`${categoryConfig.name}: 채널 ID 없음`);
        continue;
      }

      console.log(
        `\n📤 [${categoryConfig.name}] ${articles.length}개 기사 전송 시작`
      );

      const slackMessage = createSlackMessage(articles, categoryKey);
      const sendResult = await sendToSlackWithRetry(
        slackMessage,
        channelId,
        categoryConfig.name
      );

      if (sendResult.success) {
        results.success++;
        results.totalArticles += articles.length;
        console.log(
          `✅ [${categoryConfig.name}] ${articles.length}개 기사 전송 완료`
        );
      } else {
        results.failed++;
        results.errors.push(`${categoryConfig.name}: ${sendResult.error}`);
        console.error(
          `❌ [${categoryConfig.name}] 전송 실패: ${sendResult.error}`
        );
      }

      // 카테고리 간 1초 대기 (Slack API 레이트 리밋 방지)
      if (
        Object.keys(groupedArticles).indexOf(categoryKey) <
        Object.keys(groupedArticles).length - 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, ONE_SECOND));
      }
    }
  } catch (error) {
    console.error("💥 예상치 못한 오류 발생:", error);
    results.errors.push(`전체 프로세스: ${error.message}`);
  }

  // 실행 결과 요약
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n" + "=".repeat(50));
  console.log("📊 뉴스봇 실행 결과 요약");
  console.log("=".repeat(50));
  console.log(`⏱️  실행 시간: ${duration}초`);
  console.log(`✅ 성공한 카테고리: ${results.success}개`);
  console.log(`❌ 실패한 카테고리: ${results.failed}개`);
  console.log(`📰 총 전송된 기사: ${results.totalArticles}개`);

  if (results.errors.length > 0) {
    console.log(`\n🚨 오류 목록:`);
    results.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }

  console.log("=".repeat(50));

  // 실패가 있으면 종료 코드 1로 종료
  if (results.failed > 0) {
    process.exit(1);
  }

  console.log("🎉 뉴스봇 실행 완료!");
})();

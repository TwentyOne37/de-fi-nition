// src/scripts/test-cryptopanic.ts
import { connectDatabase } from "@/services/database";
import { RelatedEventModel } from "@/models/RelatedEvent";
import logger from "@/services/logger";
import config from "@/config";

interface CryptoPanicNews {
  kind: string;
  domain: string;
  title: string;
  published_at: string;
  url: string;
  currencies: Array<{ code: string; title: string; slug: string }>;
}

interface CryptoPanicResponse {
  results: CryptoPanicNews[];
}

async function fetchCryptoNews(
  currencies: string[],
  fromTimestamp: number,
  toTimestamp: number
): Promise<CryptoPanicResponse> {
  const apiKey = config.CRYPTOPANIC_API_KEY;
  if (!apiKey) {
    throw new Error("CRYPTOPANIC_API_KEY not configured");
  }

  // Convert timestamps to ISO strings
  const fromDate = new Date(fromTimestamp).toISOString();
  const toDate = new Date(toTimestamp).toISOString();

  const currencyParam = currencies.join(",");
  const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&currencies=${currencyParam}&public=true&filter=important&from=${fromDate}&to=${toDate}`;

  logger.debug("Fetching news with params:", {
    currencies: currencyParam,
    from: fromDate,
    to: toDate,
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CryptoPanic API error: ${response.statusText}`);
  }

  return (await response.json()) as CryptoPanicResponse;
}

async function transformNews(news: CryptoPanicNews[]): Promise<any[]> {
  return news.map((item) => ({
    timestamp: new Date(item.published_at).getTime(),
    source: "cryptopanic",
    title: item.title,
    url: item.url,
    summary: `${item.kind} news from ${item.domain}`,
    confidence: item.kind === "news" ? 0.8 : 0.6,
    currencies: item.currencies.map((c) => c.code),
  }));
}

async function main() {
  try {
    // Connect to database
    await connectDatabase();

    logger.info("Starting CryptoPanic API test");

    // Test parameters
    const currencies = ["BTC", "ETH", "DOGE"]; // Test with major cryptocurrencies
    const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    logger.info("Fetching news for currencies:", currencies);

    // Fetch news for the last 24 hours
    const response = await fetchCryptoNews(currencies, now - timeWindow, now);

    logger.info(`Found ${response.results.length} news items`);

    // Transform and store news items
    if (response.results.length > 0) {
      const events = await transformNews(response.results);

      // Store in database
      for (const event of events) {
        await RelatedEventModel.findOneAndUpdate(
          {
            source: event.source,
            title: event.title,
            timestamp: event.timestamp,
          },
          event,
          { upsert: true }
        );
      }

      // Display results
      console.log("\n=== CryptoPanic News Summary ===");
      console.log(`Total news items: ${events.length}`);

      console.log("\nLatest news items:");
      events.slice(0, 5).forEach((event) => {
        console.log(`
          Date: ${new Date(event.timestamp).toISOString()}
          Title: ${event.title}
          Currencies: ${event.currencies.join(", ")}
          Confidence: ${event.confidence}
          URL: ${event.url}
          ---
        `);
      });

      // Calculate some statistics
      const currencyStats = events.reduce(
        (acc, event) => {
          event.currencies.forEach((currency: string) => {
            acc[currency] = (acc[currency] || 0) + 1;
          });
          return acc;
        },
        {} as Record<string, number>
      );

      console.log("\nNews by currency:");
      Object.entries(currencyStats).forEach(([currency, count]) => {
        console.log(`${currency}: ${count} articles`);
      });
    }

    process.exit(0);
  } catch (error) {
    logger.error("Error in CryptoPanic test", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();

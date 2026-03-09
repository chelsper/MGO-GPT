import { articles } from "./articles";

export const searchArticles = (query) => {
  if (!query || query.trim() === "") return [];

  const lowerQuery = query.toLowerCase().trim();
  const results = [];

  articles.forEach((article) => {
    let score = 0;

    // Title match (highest weight)
    if (article.title.toLowerCase().includes(lowerQuery)) {
      score += 10;
    }

    // Tag match
    if (article.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
      score += 5;
    }

    // Summary match
    if (article.summary.toLowerCase().includes(lowerQuery)) {
      score += 3;
    }

    // Content match (sections)
    const contentString = JSON.stringify(article.sections).toLowerCase();
    if (contentString.includes(lowerQuery)) {
      score += 1;
    }

    if (score > 0) {
      results.push({ ...article, score });
    }
  });

  return results.sort((a, b) => b.score - a.score);
};

export const getArticlesByCategory = (categoryId) => {
  return articles.filter((article) => article.categoryId === categoryId);
};

export const getRelatedArticles = (articleIds) => {
  return articles.filter((article) => articleIds.includes(article.id));
};

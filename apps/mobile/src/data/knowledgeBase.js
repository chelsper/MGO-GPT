// Authoritative Knowledge Base Content for Advancement Services
// Last Updated: March 6, 2026

import { categories } from "./knowledgeBase/categories";
import { articles } from "./knowledgeBase/articles";

export const knowledgeBaseData = {
  categories,
  articles,
};

export {
  searchArticles,
  getArticlesByCategory,
  getRelatedArticles,
} from "./knowledgeBase/utils";

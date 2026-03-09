import { fundamentalsArticles } from "./fundamentals";
import { constituenciesArticles } from "./constituencies";
import { householdArticles } from "./household";
import { givingArticles } from "./giving";
import { prospectArticles } from "./prospect";
import { reportingArticles } from "./reporting";
import { governanceArticles } from "./governance";
import { fundraisingPoliciesArticles } from "./fundraisingPolicies";
import { giftAcceptanceArticles } from "./giftAcceptance";
import { giftAgreementsArticles } from "./giftAgreements";
import { campaignCountingArticles } from "./campaignCounting";
import { advancementOpsArticles } from "./advancementOps";

export const articles = [
  ...fundamentalsArticles,
  ...constituenciesArticles,
  ...householdArticles,
  ...givingArticles,
  ...prospectArticles,
  ...reportingArticles,
  ...governanceArticles,
  ...fundraisingPoliciesArticles,
  ...giftAcceptanceArticles,
  ...giftAgreementsArticles,
  ...campaignCountingArticles,
  ...advancementOpsArticles,
];

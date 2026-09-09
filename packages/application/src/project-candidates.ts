export type InitialProjectCandidate = {
  key: string;
  name: string;
  purpose: string;
  status: "ACTIVE" | "PLANNED";
  importance: 3 | 4 | 5;
  targetDate: string | null;
  note: string | null;
};

export type InitialTaskCandidate = {
  key: string;
  projectKey: string;
  projectName: string;
  title: string;
  status: "UNSTARTED";
  importance: 3;
  dueDate: null;
  assignee: null;
  source: "USER_CONFIRMED_INITIAL_CANDIDATE";
};

const CLIENT_PROJECT_PURPOSE = "該当クライアントの提案・資料作成・対応進行を管理する";
const CLIENT_PROJECT_NOTE = "現在の進捗・重要度・期限は正式承認前に確認する";

export const INITIAL_PROJECT_CANDIDATES = [
  {
    key: "oz-command-center-development",
    name: "OZ COMMAND CENTER開発",
    status: "ACTIVE",
    importance: 5,
    targetDate: null,
    note: null,
    purpose: "音声とAIを通じて、プロジェクト・タスク・確認待ち・外部サービス連携を一元管理する",
  },
  {
    key: "sns-business",
    name: "SNS事業",
    status: "ACTIVE",
    importance: 5,
    targetDate: "2028-03-31",
    note: "旧D1と別プロジェクトにせず、この1件へ統合する",
    purpose: "企業のSNS運用を企画・撮影・編集・投稿まで支援し、認知拡大・集客・採用につなげる",
  },
  {
    key: "sns-operations-system",
    name: "SNS運用業務システム構築",
    status: "ACTIVE",
    importance: 5,
    targetDate: null,
    note: null,
    purpose: "SNS運用の受注、提案、撮影、編集、確認、修正、投稿、納品までを一括管理し、note・X・Threads等の運用自動化も行う社内システムを構築する",
  },
  ...[
    ["aichi-fire-brigade", "愛知県消防団"],
    ["kyoto-labor-bureau", "京都労働局"],
    ["wakayama-prefecture", "和歌山県"],
    ["konami-sports", "コナミスポーツ"],
    ["vivelea", "Vivelea"],
    ["mrmax", "ミスターマックス"],
    ["smaregi", "スマレジ"],
    ["and-security", "AND SECURITY"],
  ].map(([key, name]) => ({
    key,
    name,
    status: "PLANNED" as const,
    importance: 3 as const,
    targetDate: null,
    note: CLIENT_PROJECT_NOTE,
    purpose: CLIENT_PROJECT_PURPOSE,
  })),
  {
    key: "your-song",
    name: "Your Song",
    status: "ACTIVE",
    importance: 4,
    targetDate: null,
    note: null,
    purpose: "ウェディングを中心に、ヒアリング内容からオリジナル楽曲を制作・納品する",
  },
  {
    key: "yutolu",
    name: "YUTOLU",
    status: "ACTIVE",
    importance: 4,
    targetDate: null,
    note: null,
    purpose: "家族間のタスク、予定、買い物、在庫、負担状況を共有するアプリを開発・運営する",
  },
  {
    key: "the-private-film-japan",
    name: "THE PRIVATE FILM JAPAN",
    status: "ACTIVE",
    importance: 4,
    targetDate: null,
    note: null,
    purpose: "訪日富裕層の日本での体験や旅を高品質な映像作品として記録・納品する",
  },
  {
    key: "omoshiro-akindo-club",
    name: "OMOSHIRO AKINDO CLUB",
    status: "ACTIVE",
    importance: 4,
    targetDate: null,
    note: null,
    purpose: "若手経営者と経験豊富な先輩経営者をつなぐ、完全紹介制コミュニティを構築・運営する",
  },
  {
    key: "sanpo-yoshi-store-referral-platform",
    name: "三方良し／店舗集客・紹介プラットフォーム",
    status: "PLANNED",
    importance: 3,
    targetDate: null,
    note: "現在は仮の正式表記とし、名称変更は後日review経由で行う",
    purpose: "店舗、紹介者、来店ユーザーを成果報酬型でつなぐ店舗集客・紹介プラットフォームを構築する",
  },
  {
    key: "restaurant-procurement-cost-ai",
    name: "飲食店仕入れコスト最適化AI",
    status: "PLANNED",
    importance: 3,
    targetDate: null,
    note: null,
    purpose: "請求書や仕入れ情報を基に、安価な仕入れ先や代替商品を提案するシステムを構築する",
  },
] as const satisfies readonly InitialProjectCandidate[];

export const INITIAL_CLIENT_TASK_CANDIDATES = [
  ["aichi-fire-brigade-proposal", "aichi-fire-brigade", "愛知県消防団", "愛知県消防団向け提案・見積資料を作成"],
  ["kyoto-labor-bureau-proposal", "kyoto-labor-bureau", "京都労働局", "京都労働局向け提案書・企画・絵コンテを作成"],
  ["wakayama-prefecture-proposal", "wakayama-prefecture", "和歌山県", "和歌山県向け候補団体選定・提案資料を作成"],
  ["konami-sports-instagram-proposal", "konami-sports", "コナミスポーツ", "コナミスポーツ向けInstagram運用代行オプション提案・見積を作成"],
  ["vivelea-sns-proposal", "vivelea", "Vivelea", "Vivelea向けSNS運用提案資料を作成・更新"],
  ["mrmax-recruiting-sns-proposal", "mrmax", "ミスターマックス", "ミスターマックス向け採用SNS・動画コンテンツ戦略提案資料を作成"],
  ["smaregi-proposal", "smaregi", "スマレジ", "スマレジ向け提案資料を作成"],
  ["and-security-recruiting-sns-proposal", "and-security", "AND SECURITY", "AND SECURITY向けSNS採用提案資料を作成"],
].map(([key, projectKey, projectName, title]) => ({
  key,
  projectKey,
  projectName,
  title,
  status: "UNSTARTED" as const,
  importance: 3 as const,
  dueDate: null,
  assignee: null,
  source: "USER_CONFIRMED_INITIAL_CANDIDATE" as const,
})) satisfies readonly InitialTaskCandidate[];

export const LEGACY_D1_CANDIDATES = {
  projectCount: 1,
  taskCount: 8,
  items: [
    { id: "legacy-project-01", type: "project", label: "SNS事業", source: "D1", privateFields: "withheld", selectable: false },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `legacy-task-${String(index + 1).padStart(2, "0")}`,
      type: "task",
      label: `D1タスク移行候補 ${String(index + 1).padStart(2, "0")}`,
      source: "D1",
      privateFields: "withheld",
      selectable: false,
    })),
  ],
} as const;

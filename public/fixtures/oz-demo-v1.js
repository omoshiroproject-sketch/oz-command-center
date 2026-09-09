// Demo-only fixture. Never import these rows into the formal PostgreSQL task store.
window.OZ_DATA = {
  projects: [
    {
      id: "yutolu",
      name: "YUTOLU",
      progress: 72,
      status: "UI設計 / ベータ準備",
      phase: "プロダクト開発",
      priority: "高",
      owner: "OZ + あなた",
      updated: "今日",
      next: ["βテスト設計を固める", "通知フローを最終確認", "1月ローンチ導線を整理"]
    },
    {
      id: "yoursong",
      name: "YOUR SONG",
      progress: 48,
      status: "LINE / 決済フロー",
      phase: "サービス開発",
      priority: "中",
      owner: "OZ + あなた",
      updated: "今日",
      next: ["LINE導線を確定", "決済後フローをテスト", "サンプルコンテンツを追加"]
    },
    {
      id: "private",
      name: "THE PRIVATE FILM JAPAN",
      progress: 63,
      status: "ブランド / 営業設計",
      phase: "市場展開",
      priority: "高",
      owner: "OZ + あなた",
      updated: "今日",
      next: ["英語サイト表現を最終調整", "パートナー営業資料を完成", "撮影・納品オペレーション確認"]
    },
    {
      id: "akindo",
      name: "OMOSHIRO AKINDO CLUB",
      progress: 57,
      status: "サイト / 会員システム",
      phase: "コミュニティ開発",
      priority: "中",
      owner: "OMOSHIRO",
      updated: "TODAY",
      next: ["公開サイトを整える", "会員専用画面の仕様整理", "紹介申請フローを検証"]
    },
    {
      id: "client",
      name: "クライアントワーク",
      progress: 84,
      status: "提案 / 納品",
      phase: "運用",
      priority: "高",
      owner: "チーム",
      updated: "進行中",
      next: ["提案書の最終確認", "撮影スケジュール整理", "クライアント返信"]
    }
  ],
  scenes: [
    {
      speaker: "あなた",
      text: "OZ、今日まず何からやる？",
      sub: "音声入力を検出 / 優先順位の整理",
      state: "listening",
      context: "今日 / 優先順位",
      category: "STRATEGY"
    },
    {
      speaker: "OZ",
      text: "今日中に終わらせるべきものを3つに絞りました。先に“決める仕事”を片付けましょう。",
      sub: "緊急度 × 影響度で優先順位を再整理",
      state: "speaking",
      context: "今日 / 優先順位",
      category: "STRATEGY",
      view: {
        type: "task",
        title: "今日の優先事項",
        badge: "重要 3件",
        items: ["クライアント提案書を完成", "YUTOLUのβテスト方針を確定", "次回SNS撮影企画を決める"]
      }
    },
    {
      speaker: "あなた",
      text: "YUTOLU、今どこまで来てる？",
      sub: "プロジェクト分析を依頼",
      state: "listening",
      context: "YUTOLU",
      category: "PROJECT",
      project: "yutolu"
    },
    {
      speaker: "OZ",
      text: "72%。UIはかなり固まっています。次は機能追加より、βテストで“夫婦2人が続けて使う理由”を検証する段階です。",
      sub: "推奨：機能拡張前に継続利用を検証",
      state: "speaking",
      context: "YUTOLU / プロダクト",
      category: "PROJECT",
      project: "yutolu",
      view: {
        type: "project",
        title: "YUTOLU / 現在の状況",
        badge: "順調",
        progress: "72%",
        current: "UI設計",
        next: "ベータテスト",
        risk: "継続利用"
      }
    },
    {
      speaker: "あなた",
      text: "新しいInstagram企画、普通の商品紹介じゃ弱いよな？",
      sub: "クリエイティブ方針 / 挑戦モード",
      state: "listening",
      context: "SNS戦略",
      category: "CREATIVE"
    },
    {
      speaker: "OZ",
      text: "弱いです。商品を主役にするより、“その会社の意思決定”をコンテンツにした方が見たくなります。",
      sub: "商品訴求から意思決定型コンテンツへ転換",
      state: "speaking",
      context: "SNS戦略 / クリエイティブ",
      category: "CREATIVE",
      view: {
        type: "idea",
        title: "コンテンツの方向性",
        badge: "3案",
        items: ["社長 × OZ 経営会議", "現場で即決するドキュメント", "視聴者が次の一手を決める企画"]
      }
    },
    {
      speaker: "あなた",
      text: "もっと攻めるなら？",
      sub: "より大胆な案を依頼",
      state: "listening",
      context: "クリエイティブ / シリーズ",
      category: "CREATIVE"
    },
    {
      speaker: "OZ",
      text: "“AIに会社を任せたらどうなるか”を連続企画にしましょう。毎回OZが1つ判断して、人間側が実行する。",
      sub: "シリーズ構造：AIの判断 → 人の実行 → 結果",
      state: "speaking",
      context: "クリエイティブ / シリーズ",
      category: "CREATIVE",
      view: {
        type: "decision",
        title: "シリーズ構造",
        badge: "推奨",
        options: [
          ["OZが判断", "毎回ひとつ、OZが経営・企画判断を出す。"],
          ["人が実行", "実際に人間が動き、次回に結果をOZへ返す。"]
        ]
      }
    },
    {
      speaker: "あなた",
      text: "今月のSNS、数字はどう？",
      sub: "成果指標を確認",
      state: "listening",
      context: "SNS / KPI",
      category: "NUMBERS"
    },
    {
      speaker: "OZ",
      text: "再生は伸びています。ただ、次に見るべきは再生数そのものより、保存率と問い合わせ転換です。",
      sub: "デモ指標 / 接続後は実データへ切り替え",
      state: "speaking",
      context: "SNS / KPI",
      category: "NUMBERS",
      view: {
        type: "metrics",
        title: "今月の指標",
        badge: "デモデータ",
        metrics: [
          ["総再生数", "12.8M", "+18.6%", 82],
          ["保存数", "31.4K", "+9.8%", 64],
          ["問い合わせ率", "2.8%", "+0.6pt", 54]
        ]
      }
    },
    {
      speaker: "あなた",
      text: "AKINDO CLUBも今の状態見せて。",
      sub: "プロジェクト分析を依頼",
      state: "listening",
      context: "AKINDO CLUB",
      category: "PROJECT",
      project: "akindo"
    },
    {
      speaker: "OZ",
      text: "公開サイトと会員システムの考え方は整理できています。次は“入会→審査→紹介申請”の体験を一本につなぐのが重要です。",
      sub: "主要フロー：入会 → 審査 → 会員アクセス → 紹介申請",
      state: "speaking",
      context: "AKINDO CLUB / システム",
      category: "PROJECT",
      project: "akindo",
      view: {
        type: "project",
        title: "AKINDO CLUB / 現在の状況",
        badge: "開発中",
        progress: "57%",
        current: "サイト / UX",
        next: "会員フロー",
        risk: "複雑化"
      }
    },
    {
      speaker: "あなた",
      text: "じゃあ最後に、今日の判断を一言でまとめて。",
      sub: "要約を依頼",
      state: "listening",
      context: "今日 / 要約",
      category: "STRATEGY"
    },
    {
      speaker: "OZ",
      text: "増やすより、決める。今日は新しいことを足す日じゃなく、今あるプロジェクトを前に進める日です。",
      sub: "セッション要約 / 判断を確定",
      state: "speaking",
      context: "今日 / 要約",
      category: "STRATEGY",
      view: {
        type: "decision",
        title: "セッションの結論",
        badge: "確定",
        options: [
          ["やる", "提案・βテスト・撮影企画の3つを確定する。"],
          ["やらない", "新機能や新企画を増やして判断を先送りしない。"]
        ]
      }
    }
  ]
};

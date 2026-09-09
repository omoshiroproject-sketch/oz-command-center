# D1移行候補インベントリ（2026-08-23）

## 取扱い

Sitesの本番D1を読み取り専用で確認した記録であり、PostgreSQLへは投入していない。個人名、業務本文、外部サービスIDを含む完全な取得結果は、Git管理外の `data/legacy-d1/private/20260823-live-d1-backup.json` に退避した。正式移行にはownerによる一件ずつの確認と承認が必要である。

## 件数

| D1テーブル | 件数 | Phase 1Aでの扱い |
|---|---:|---|
| `oz_projects` | 1 | 移行候補のみ |
| `oz_tasks` | 8 | 移行候補のみ |
| `oz_memories` | 0 | 対象なし |

## 移行判断項目

- プロジェクト: `sns-business-2026`。名称、責任者、KPI、期限、Drive・Slack・Chatwork参照を確認してから移行する。
- タスク: 8件。正式タスクとして必要か、プロジェクトとの対応、期限、担当者、優先度を確認してから移行する。
- 旧owner IDはSupabase AuthのUUIDへ自動変換しない。
- 外部サービスのURL・IDはfixtureまたは専用の移行データとして分離し、通常ソースへ戻さない。
- D1は比較・バックアップ用のread-only legacy sourceとして維持する。

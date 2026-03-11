# Queue Call 運営会社向け内部管理ダッシュボード + テストアカウント実装資料（Codex向け）

## 1. ドキュメントの目的

この資料は、既存の Queue Call システムに対して以下を追加実装するための **Codex 向け実装資料** です。

- 運営会社向け内部管理ダッシュボード
- テストアカウント管理機能
- テスト店舗 3 つを持つ検証用アカウント
- テストデータを本番集計から除外する仕組み
- テスト店舗のリセット機能
- **方法B（固定ID allowlist）** による内部管理者判定

本資料は **設計・実装計画・WBS・受け入れ条件** を一体で整理したものです。  
実装そのものはまだ行わず、Codex が安全に着手できるレベルまで要求を明文化することを目的とします。

> 本資料でいう「管理者」は **契約者（店舗オーナー）ではなく、Queue Call を運営する会社の内部担当者** を指す。  
> 契約者向けダッシュボードの権限管理とは分離して扱う。

---

## 2. 背景

現在のシステムには店舗オーナー向けダッシュボードは存在するが、SaaS 提供者向けの全体管理画面が存在しない。  
また、営業デモ・QA・機能確認に使える公式なテストアカウント／テスト店舗の仕組みも不足している。

そのため、以下の課題がある。

- 全体のユーザー数、店舗数、利用状況、収益、システム状態を横断的に把握できない
- テストデータが本番の統計を汚染する可能性がある
- サポートや営業時に再現性のあるデモ環境を用意しづらい
- 各プラン差分の検証を継続的に行いづらい
- 「管理者」という言葉が契約者側管理者と運営会社側内部管理者で混同しやすい

今回の設計では、**内部管理画面は運営会社だけが閲覧・操作可能** とし、契約者には一切公開しない前提に統一する。

---

## 3. 今回の要件サマリー

### 3.1 内部管理ダッシュボード

- `/internal-admin` 配下に **運営会社向け内部管理画面** を追加する
- 既存の店舗オーナー向けダッシュボードとは分離する
- 契約者アカウントには内部管理権限を与えない
- アクセス制御は **方法B: 認証基盤の固定IDを環境変数 allowlist で許可する方式** を採用する

> 2026-03-11 時点の実装では、既存の店舗オーナー向け UI が `/admin/*` を使用しているため、  
> 内部管理画面は `/internal-admin/*` を正式ルートとして扱う。  
> UI 表示名称は「内部管理」や「運営管理」に寄せ、契約者向け管理画面と混同しないこと。

### 3.2 内部管理者の登録・管理方式（方法B）

- 公開登録や一般ユーザーの自己申告で内部管理者にはしない
- 内部管理者の付与・剥奪は **`INTERNAL_ADMIN_IDS`** 環境変数で行う
- 判定に使うのは **不変の認証ID** のみとする
- 表示名、アカウント名、ニックネーム、メールアドレス単体では判定しない
- 当面は UI 上の「管理者昇格」機能は作らない

### 3.3 テストアカウント

- テストユーザーは 1 つだけ作成する
- ただし、そのユーザーが **3 つのテスト店舗** を所有する
- 3 店舗で Free / Standard / Pro 相当の状態を検証できるようにする
- テスト店舗から通常の UI でチケット追加・操作・追跡ができるようにする

### 3.4 リセット

- テスト店舗単位のリセット
- 全テスト店舗一括リセット
- 店舗自体は削除せず、関連データを初期化する

### 3.5 集計ルール

- 管理者統計ではテストデータを **デフォルト除外** する
- 必要時のみトグルでテストデータを含めて確認できる
- ユーザー系 KPI では、可能な限り **内部管理者アカウントも除外** して契約者実数に近づける

---

## 4. スコープ

### 4.1 インスコープ

- 管理者ルーティング追加
- 管理者専用レイアウト追加
- 管理者 API / router 追加
- `users` / `stores` のテスト用フラグ追加
- テストアカウント・テスト店舗セットアップ機能
- テスト店舗リセット機能
- KPI / ユーザー管理 / 店舗管理 / チケット統計 / 収益 / システム監視 / テストアカウント画面
- **内部管理者 allowlist によるアクセス制御**
- フロントへ `isInternalAdmin` を公開するための認証コンテキスト拡張
- テストデータ除外ロジック
- テストコード追加

### 4.2 アウトオブスコープ

- 一般ユーザー向け UI の大幅な再設計
- 既存課金モデル自体の変更
- 高度な監査ログ基盤の新規構築
- 汎用的な全システムイベントソーシング
- 本番運用フローの自動化や CI/CD 改修
- **UI からの内部管理者付与・剥奪機能**
- **契約者向け管理者ロール設計の新規追加**

---

## 5. 前提技術スタック

以下は既存実装計画から推定される前提です。Codex は実装前に差分確認を行うこと。

- フロントエンド: React + Vite
- ルーティング: `App.tsx` ベース
- UI: Tailwind + shadcn/ui
- チャート: `recharts`
- サーバー: tRPC もしくは類似ルーター構成
- ORM/DB: Drizzle
- 認証: `ctx.user` を参照できる既存保護手続きあり
- 決済: Stripe
- SMS: Twilio
- Push: Web Push / VAPID
- 環境変数管理: `.env` / デプロイ先シークレット管理

> 実際のリポジトリ構成が異なる場合、Codex はファイル名・ディレクトリ名を現行構成に合わせて読み替えること。

---

## 6. アクセス制御方針（方法B）

### 6.1 基本原則

- 内部管理画面は **運営会社の内部担当者のみ** が利用する
- 契約者アカウントは内部管理者ではない
- 契約者に内部管理画面の閲覧権限は与えない
- 権限の最終判定は必ずサーバー側で行う

### 6.2 判定方式

内部管理者と見なす条件は以下。

```ts
const internalAdminIds = env.INTERNAL_ADMIN_IDS
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)

const authSubject = getAuthSubject(user)
const isInternalAdmin = !!authSubject && internalAdminIds.includes(authSubject)
```

### 6.3 判定に使う識別子

判定対象は、認証基盤が返す **不変の固定ID** とする。

候補例:

- `user.authSubject`
- `user.openId`
- `user.sub`
- `user.providerUserId`

Codex は既存コード上で最も適切なフィールドを確認し、**`getAuthSubject()` ヘルパーで正規化** すること。

### 6.4 使用禁止の識別子

以下を内部管理者判定のソースにしてはいけない。

- 表示名
- アカウント名
- ニックネーム
- メールアドレス単体
- 店舗名

理由:

- 変更可能
- 重複し得る
- 表記ゆれが起きる
- 権限判定の根拠として不十分

### 6.5 サーバー側方針

- `protectedProcedure` とは別に **`internalAdminProcedure`** を新設する
- すべての `adminRouter` は `internalAdminProcedure` 経由で公開する
- 可能であれば認証コンテキスト生成時点で `ctx.user.isInternalAdmin` を計算しておく
- URL を直接叩かれても、API 側で拒否できるようにする

### 6.6 フロント側方針

- フロントは raw の環境変数を直接評価しない
- サーバーが計算した `user.isInternalAdmin` を使って管理者リンク表示を制御する
- `user.isInternalAdmin === true` の場合のみ `/internal-admin` ナビゲーションを表示する
- フロントの非表示は UX 上の制御であり、セキュリティ境界はサーバー側とする

### 6.7 内部管理者の登録方法

方法Bでは、内部管理者の登録はアプリ内のロール変更ではなく、**環境変数 allowlist の更新** で行う。

手順:

1. 運営会社の担当者が通常ログインする
2. `users` テーブル、認証ログ、または安全な開発用確認手段から **固定 auth ID** を取得する
3. `INTERNAL_ADMIN_IDS` にその ID を追加する
4. デプロイ先の設定反映に応じて再起動・再デプロイ・設定リロードを行う
5. 対象ユーザーが再ログインまたはセッション更新を行う
6. `/internal-admin` にアクセスできることを確認する

例:

```env
INTERNAL_ADMIN_IDS=auth_sub_1,auth_sub_2
```

### 6.8 内部管理者の解除方法

- `INTERNAL_ADMIN_IDS` から対象 ID を削除する
- 再起動・再デプロイ・設定リロードを行う
- 次回セッション更新以降、`/internal-admin` へアクセス不可になることを確認する

### 6.9 将来拡張の扱い

当面の運営人数が少ない場合、方法Bは十分にシンプルで安全。  
ただし、内部担当者が増え、権限履歴や UI 管理が必要になった段階で、将来的に DB 管理方式へ移行する余地を残す。

---

## 7. 画面構成

```text
/
├── /dashboard                  # 既存: 店舗オーナー向け
├── /settings                   # 既存
├── /admin/*                    # 既存: 店舗オーナー向け管理画面
└── /internal-admin             # 新規: 運営会社向け内部管理画面（運営会社のみ）
    ├── /internal-admin         # 概要
    ├── /internal-admin/users   # ユーザー管理
    ├── /internal-admin/stores  # 店舗管理
    ├── /internal-admin/tickets # チケット統計
    ├── /internal-admin/revenue # 収益
    ├── /internal-admin/system  # システム監視
    └── /internal-admin/test-accounts # テストアカウント管理
```

---

## 8. データモデル変更

### 8.1 追加カラム

| テーブル | カラム | 型 | デフォルト | 用途 |
|---|---|---:|---:|---|
| users | is_test | boolean | false | テストユーザー識別 |
| stores | is_test | boolean | false | テスト店舗識別 |
| stores | test_plan_override | varchar(50) nullable | null | テスト用プラン擬似上書き |

### 8.2 運用ルール

- テストアカウントは `users.is_test = true`
- テスト店舗は `stores.is_test = true`
- 3 店舗の擬似プラン差分確認には `stores.test_plan_override` を使う
- `test_plan_override` の正式集計値は `free | standard | pro` とし、`premium` は `pro` 相当に正規化する
- 本番プランに影響を与えず UI / 制約 / 分岐を確認できるようにする

### 8.3 内部管理者に関するルール

- **このフェーズでは内部管理者用の DB ロールカラム追加は必須ではない**
- 内部管理者判定のソース・オブ・トゥルースは `INTERNAL_ADMIN_IDS` と固定 auth ID の照合とする
- 既存の `users.role` フィールドがあっても、`/internal-admin` アクセス許可の唯一の根拠にはしない
- 将来的に DB 方式へ移行する場合でも、このフェーズではスコープ外とする

### 8.4 集計除外ルール

すべての統計系クエリは原則として以下をデフォルト適用する。

```sql
WHERE stores.is_test = false
```

`includeTest: boolean` パラメータで明示的に含められるようにする。

### 8.5 ユーザー系 KPI の扱い

- `総ユーザー数` のようなユーザー基準 KPI は、`INTERNAL_ADMIN_IDS` に含まれる内部管理者を除外する
- `users.is_test = false` の除外は必須とする
- `INTERNAL_ADMIN_IDS` 除外は env 依存のため、必要に応じてアプリ層で追加除外する

---

## 9. テストアカウント設計

### 9.1 構成

1 つのテストユーザーが 3 つのテスト店舗を所有する。

| 店舗名 | スラッグ | test_plan_override | 目的 |
|---|---|---|---|
| Test Store Free | `test-free` | `free` | 無料プラン相当の制約確認 |
| Test Store Standard | `test-standard` | `standard` | 標準機能確認 |
| Test Store Pro | `test-pro` | `pro` | 全機能確認 |

> 既存資料や旧データで `premium` が残る場合は、集計時に `pro` として正規化して扱う。

### 9.2 方針

- 初期チケットは投入しない
- 各店舗の UI から手動でテストデータを追加する
- テスト操作の追跡は `stores.is_test = true` で識別する
- 管理者画面側ではテスト店舗専用表示を用意する
- テストユーザーは **内部管理者ではない**

### 9.3 リセット対象

| 対象 | 処理 |
|---|---|
| tickets | 対象店舗のチケット削除 |
| push_subscriptions | 対象店舗の購読情報削除 |
| 店舗設定 | 営業時間、カスタマイズなどを既定値へ戻す |
| 統計キャッシュ | 対象があればクリア |
| store レコード | 削除しない |

---

## 10. KPI / 監視指標の定義

### 10.1 概要画面で表示する主な指標

| 指標 | 説明 | 備考 |
|---|---|---|
| 総ユーザー数 | 全ユーザー数 | デフォルトでテスト除外、可能なら内部管理者も除外 |
| アクティブ店舗数 | 過去30日以内にチケット発行のある店舗数 | Phase 2 実装で 30 日に固定 |
| 本日の発券数 | 当日作成されたチケット数 | サーバーローカル日付基準 |
| MRR | 月間経常収益 | DB 上の `subscriptionPlan` と既存プラン定義から算出 |
| SMS送信数 | 過去30日の送信数 | `sms_logs` ベース |

> `プッシュ通知成功率` は永続ログ基盤がないため、Phase 2 の Overview には含めない。  
> 必要になった時点で Phase 6 以降でログ保存を先に追加する。

### 10.2 チケット統計で表示する指標

| 指標 | 説明 |
|---|---|
| 総発券数 | 期間内のチケット数 |
| 呼び出し数 | 呼び出し済み件数 |
| キャンセル率 | キャンセル数 / 総発券数 |
| 平均待ち時間 | 発券から呼び出し or 完了までの平均 |
| ピーク時間帯 | 時間帯別の発券集中度 |
| チェックイン率 | 呼び出し後にチェックインした割合 |

### 10.3 収益で表示する指標

| 指標 | 説明 |
|---|---|
| MRR | 月額定常売上 |
| プラン別売上 | Free / Standard / Pro 等の売上内訳 |
| 直近決済 | 直近の決済一覧 |
| チャーン率 | 解約率 |
| LTV 推定 | 参考値として将来追加余地あり |

### 10.4 システム監視で表示する指標

| 指標 | 説明 |
|---|---|
| Push 送信数 | 24h / 7d |
| Push 成功率 | 送信成功率。永続ログ追加後に定義 |
| Push 失敗理由 | endpoint 不正、期限切れ等。永続ログ追加後に表示 |
| SMS送信数 | 24h / 30d |
| Twilio 残高 | 取得可能なら表示 |
| VAPID鍵設定済み店舗数 | 設定済み / 全店舗 |
| DB接続状態 | システムヘルスの最小指標 |

---

## 11. API / ルーター構成案

### 11.1 管理者ルーター

```ts
adminRouter = {
  overview: {
    kpi,
    ticketChart,
    planDistribution,
    recentActivity,
  },
  users: {
    list,
    detail,
    updateStatus,
    updateTestFlag,
  },
  stores: {
    list,
    detail,
    updateStatus,
    updateTestFlag,
  },
  tickets: {
    summary,
    byStore,
    peakHours,
    checkinRate,
  },
  revenue: {
    mrr,
    planBreakdown,
    recentPayments,
    churnRate,
  },
  system: {
    pushStats,
    smsStats,
    vapidStatus,
    health,
  },
  testAccounts: {
    setup,
    list,
    stats,
    resetStore,
    resetAll,
  },
}
```

### 11.2 ガード

すべての `adminRouter` は **`internalAdminProcedure`** 経由で公開する。

---

## 12. フロントエンド構成案

### 12.1 新規ディレクトリ

```text
client/src/pages/internalAdmin/
  AdminLayout.tsx
  Overview.tsx
  Users.tsx
  Stores.tsx
  Tickets.tsx
  Revenue.tsx
  System.tsx
  TestAccounts.tsx
```

### 12.2 コンポーネント候補

```text
client/src/components/internal-admin/
  KpiCard.tsx
  AdminDataTable.tsx
  IncludeTestToggle.tsx
  MetricSection.tsx
  EmptyState.tsx
```

---

## 13. フェーズ別実装方針

## Phase 1: 基盤構築

### 目的

内部管理機能全体の土台を構築する。

### 実装内容

- `users.is_test`, `stores.is_test`, `stores.test_plan_override` 追加
- `getAuthSubject()` ヘルパー実装
- `INTERNAL_ADMIN_IDS` パーサーと `isInternalAdmin()` 実装
- `internalAdminProcedure` 実装
- `ctx.user.isInternalAdmin` をフロントへ公開
- `server/routers/admin.ts` 新規作成
- `/internal-admin/*` ルーティング追加
- `AdminLayout.tsx` と空ページを追加
- 管理者リンク表示制御

### 完了条件

- DB スキーマが反映される
- `INTERNAL_ADMIN_IDS` に含まれるユーザーのみ `/internal-admin` にアクセスできる
- 契約者アカウントや未許可ユーザーはサーバー側でも拒否される

---

## Phase 2: 概要ページ

### 目的

内部管理者がサービス全体の状況を最初に把握できるようにする。

### 実装内容

- KPI API 実装
- 過去 30 日の日別チケット推移 API
- プラン分布 API
- 直近アクティビティ API
- 既存 `recharts` 依存を利用
- Overview UI 実装
- テストデータ含有トグル実装
- KPI は `総ユーザー数 / アクティブ店舗数（過去30日） / 本日の発券数 / SMS送信数（過去30日） / MRR` を表示する
- MRR は DB 上の `subscriptionPlan` と既存プラン定義から算出し、UI では税込・税抜を併記する
- `recentActivity` は `users / stores / tickets / sms_logs / sms_transactions(type=charge)` を混在で時系列表示する
- `Push 成功率` は Phase 2 の対象外とする

### 完了条件

- KPI カード表示
- グラフ表示
- テスト除外切替動作
- `includeTest=false` で `stores.is_test = true` のデータが既定除外される

---

## Phase 3: ユーザー管理 + 店舗管理

### 目的

運用中に最も利用頻度の高い内部管理作業を可能にする。

### 実装内容

- `users.status` 追加（`active | suspended`、default `active`）
- suspended ユーザーは認証必須のアプリ利用全体から拒否する
- ユーザー一覧 / 詳細 / ステータス変更 / テストフラグ更新
- 店舗一覧 / 詳細 / 受付状態変更（既存 `intakeStatus`） / テストフラグ更新
- 検索・ページネーション・フィルター
- 詳細表示パネル実装
- allowlist 対象ユーザーに内部管理者バッジを表示
- **内部管理者の付与・剥奪 UI は実装しない**

### 完了条件

- ユーザー・店舗の一覧と詳細が参照できる
- 状態更新が UI から反映できる
- テストフラグ管理ができる

---

## Phase 4: テストアカウント + リセット機能

### 目的

営業・QA・プラン検証を継続的に行える仕組みを整備する。

### 実装内容

- テストユーザー + 3 店舗一括セットアップ
- テストアカウント一覧
- 店舗単位リセット
- 全店舗一括リセット
- テスト店舗カード UI
- 店舗への直接リンク

### 完了条件

- ボタン 1 つでテスト環境を作成できる
- テスト店舗から通常 UI 操作ができる
- リセット後に店舗は残り、関連データのみ初期化される

---

## Phase 5: チケット統計 + 収益

### 目的

運営判断に必要な利用状況と収益状況を可視化する。

### 実装内容

- チケット統計 API 群
- 期間切替 UI
- 店舗別ランキング
- 時間帯ヒートマップ
- Stripe 連携の MRR / 決済 / チャーン表示

### 完了条件

- 期間別の主要統計が確認できる
- 収益データが管理者 UI に表示される
- テスト除外が正しく効く

---

## Phase 6: システム監視

### 目的

通知や連携の異常を内部管理者が早期に発見できるようにする。

### 実装内容

- Push 統計
- SMS 統計
- VAPID 状態
- DB ヘルス状態
- 監視 UI 実装

### 完了条件

- Push / SMS / VAPID / DB の状態が一画面で確認できる
- 重大な設定漏れを発見しやすい UI になる

---

## 14. WBS（Work Breakdown Structure）

## 14.1 Phase 1: 基盤構築

### 1.1 DB スキーマ

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 1.1.1 | `users.is_test` 追加 | schema 変更 | - |
| 1.1.2 | `stores.is_test`, `stores.test_plan_override` 追加 | schema 変更 | - |
| 1.1.3 | マイグレーション反映 | DB 反映 | 1.1.1, 1.1.2 |
| 1.1.4 | 反映確認 | 検証結果 | 1.1.3 |

### 1.2 サーバーサイド認証基盤

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 1.2.1 | `getAuthSubject()` ヘルパー実装（`authSubject/openId/sub` 正規化） | auth helper | 1.1.3 |
| 1.2.2 | `INTERNAL_ADMIN_IDS` パーサー + `isInternalAdmin()` util 実装 | auth util | 1.2.1 |
| 1.2.3 | `internalAdminProcedure` 実装 | router 変更 | 1.2.2 |
| 1.2.4 | `server/routers/admin.ts` 作成 + メインルーター統合 | 新規ファイル / router 変更 | 1.2.3 |
| 1.2.5 | セッション / `ctx.user` に `isInternalAdmin` を公開 | auth context 変更 | 1.2.2 |
| 1.2.6 | 認証テスト作成 | test file | 1.2.3, 1.2.5 |

### 1.3 フロントサイド骨格

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 1.3.1 | `AdminLayout.tsx` 作成 | レイアウト | - |
| 1.3.2 | 管理者サイドバー定義 | ナビゲーション | 1.3.1 |
| 1.3.3 | 管理者ページ空コンポーネント作成 | 7ページ | 1.3.1 |
| 1.3.4 | `/internal-admin/*` ルーティング追加 | `App.tsx` 変更 | 1.3.3 |
| 1.3.5 | フロント側アクセスガード（`user.isInternalAdmin` 使用） | ガード処理 | 1.2.5, 1.3.4 |
| 1.3.6 | 管理者リンク表示制御 | ヘッダー / ナビ変更 | 1.3.5 |
| 1.3.7 | 未許可ユーザー拒否動作確認 | 手動確認 | 1.3.5 |

---

## 14.2 Phase 2: 概要ページ

### 2.1 サーバーサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 2.1.1 | `admin.overview.kpi` 実装（総ユーザー数はテスト除外、可能なら内部管理者除外） | API | 1.2.4 |
| 2.1.2 | `admin.overview.ticketChart` 実装 | API | 1.2.4 |
| 2.1.3 | `admin.overview.planDistribution` 実装 | API | 1.2.4 |
| 2.1.4 | `admin.overview.recentActivity` 実装 | API | 1.2.4 |
| 2.1.5 | `includeTest` 対応 | 統計分岐 | 2.1.1-2.1.4 |
| 2.1.6 | テスト作成 | test file | 2.1.1 |

### 2.2 フロントサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 2.2.1 | 既存 `recharts` 利用確認 | 構成確認 | - |
| 2.2.2 | `KpiCard.tsx` 作成 | UI コンポーネント | 2.2.1 |
| 2.2.3 | KPI カード接続 | `Overview.tsx` | 2.1.1, 2.2.2 |
| 2.2.4 | 折れ線グラフ実装 | `Overview.tsx` | 2.1.2 |
| 2.2.5 | 円グラフ実装 | `Overview.tsx` | 2.1.3 |
| 2.2.6 | アクティビティログ実装 | `Overview.tsx` | 2.1.4 |
| 2.2.7 | テストデータトグル実装 | `Overview.tsx` | 2.1.5 |
| 2.2.8 | ローディング / エラー / 空状態対応 | `Overview.tsx` | 2.2.3-2.2.7 |

---

## 14.3 Phase 3: ユーザー管理 + 店舗管理

### 3.1 ユーザー管理サーバーサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 3.1.0 | `users.status` 追加と migration | schema / migration | 1.1.3 |
| 3.1.1 | `admin.users.list` 実装 | API | 1.2.4 |
| 3.1.2 | `admin.users.detail` 実装 | API | 1.2.4 |
| 3.1.3 | `admin.users.updateStatus` 実装 | API | 1.2.4 |
| 3.1.4 | `admin.users.updateTestFlag` 実装 | API | 1.2.4 |
| 3.1.5 | allowlist 対象ユーザーの内部管理者フラグを読み取り専用で返却 | API 拡張 | 3.1.1 |
| 3.1.6 | suspended ユーザーを `sdk.authenticateRequest` で拒否 | auth 実装 | 3.1.0 |
| 3.1.7 | テスト作成 | test file | 3.1.1-3.1.6 |

### 3.2 ユーザー管理フロントサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 3.2.1 | 一覧テーブル実装 | `Users.tsx` | 3.1.1 |
| 3.2.2 | 検索 / フィルター実装 | `Users.tsx` | 3.1.1 |
| 3.2.3 | 詳細パネル実装 | `Users.tsx` | 3.1.2 |
| 3.2.4 | 操作ボタン実装 | `Users.tsx` | 3.1.3, 3.1.4 |
| 3.2.5 | 内部管理者バッジ表示（読み取り専用） | `Users.tsx` | 3.1.5 |
| 3.2.6 | 状態ハンドリング | `Users.tsx` | 3.2.1-3.2.5 |

### 3.3 店舗管理サーバーサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 3.3.1 | `admin.stores.list` 実装 | API | 1.2.4 |
| 3.3.2 | `admin.stores.detail` 実装 | API | 1.2.4 |
| 3.3.3 | `admin.stores.updateStatus` 実装（既存 `intakeStatus` を更新） | API | 1.2.4 |
| 3.3.4 | `admin.stores.updateTestFlag` 実装 | API | 1.2.4 |
| 3.3.5 | テスト作成 | test file | 3.3.1-3.3.4 |

### 3.4 店舗管理フロントサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 3.4.1 | 一覧テーブル実装 | `Stores.tsx` | 3.3.1 |
| 3.4.2 | 検索 / フィルター実装 | `Stores.tsx` | 3.3.1 |
| 3.4.3 | 詳細パネル実装 | `Stores.tsx` | 3.3.2 |
| 3.4.4 | 操作ボタン実装 | `Stores.tsx` | 3.3.3, 3.3.4 |
| 3.4.5 | 状態ハンドリング | `Stores.tsx` | 3.4.1-3.4.4 |

---

## 14.4 Phase 4: テストアカウント + リセット機能

### 4.1 サーバーサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 4.1.1 | `admin.testAccounts.setup` 実装 | API | 1.2.4, 1.1.3 |
| 4.1.2 | `admin.testAccounts.list` 実装 | API | 1.2.4 |
| 4.1.3 | `admin.testAccounts.resetStore` 実装 | API | 1.2.4 |
| 4.1.4 | `admin.testAccounts.resetAll` 実装 | API | 4.1.3 |
| 4.1.5 | `admin.testAccounts.stats` 実装 | API | 1.2.4 |
| 4.1.6 | リセット処理をトランザクション化 | 実装 | 4.1.3 |
| 4.1.7 | テスト作成 | test file | 4.1.1-4.1.6 |

### 4.2 フロントサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 4.2.1 | セットアップ UI 実装 | `TestAccounts.tsx` | 4.1.1 |
| 4.2.2 | テスト店舗カード表示 | `TestAccounts.tsx` | 4.1.2, 4.1.5 |
| 4.2.3 | 個別リセット導線 | `TestAccounts.tsx` | 4.1.3 |
| 4.2.4 | 一括リセット導線 | `TestAccounts.tsx` | 4.1.4 |
| 4.2.5 | 店舗への直接リンク | `TestAccounts.tsx` | 4.1.2 |
| 4.2.6 | 状態ハンドリング | `TestAccounts.tsx` | 4.2.1-4.2.5 |

---

## 14.5 Phase 5: チケット統計 + 収益

### 5.1 チケット統計サーバーサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 5.1.1 | `admin.tickets.summary` 実装 | API | 1.2.4 |
| 5.1.2 | `admin.tickets.byStore` 実装 | API | 1.2.4 |
| 5.1.3 | `admin.tickets.peakHours` 実装 | API | 1.2.4 |
| 5.1.4 | `admin.tickets.checkinRate` 実装 | API | 1.2.4 |
| 5.1.5 | テスト作成 | test file | 5.1.1-5.1.4 |

### 5.2 チケット統計フロントサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 5.2.1 | 期間セレクター実装 | `Tickets.tsx` | - |
| 5.2.2 | サマリーカード実装 | `Tickets.tsx` | 5.1.1 |
| 5.2.3 | 店舗別ランキング実装 | `Tickets.tsx` | 5.1.2 |
| 5.2.4 | ヒートマップ実装 | `Tickets.tsx` | 5.1.3 |
| 5.2.5 | 状態ハンドリング | `Tickets.tsx` | 5.2.1-5.2.4 |

### 5.3 収益サーバーサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 5.3.1 | `admin.revenue.mrr` 実装 | API | 1.2.4 |
| 5.3.2 | `admin.revenue.planBreakdown` 実装 | API | 1.2.4 |
| 5.3.3 | `admin.revenue.recentPayments` 実装 | API | 1.2.4 |
| 5.3.4 | `admin.revenue.churnRate` 実装 | API | 1.2.4 |
| 5.3.5 | テスト作成 | test file | 5.3.1-5.3.4 |

### 5.4 収益フロントサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 5.4.1 | MRR カード実装 | `Revenue.tsx` | 5.3.1 |
| 5.4.2 | 売上グラフ実装 | `Revenue.tsx` | 5.3.2 |
| 5.4.3 | 決済テーブル実装 | `Revenue.tsx` | 5.3.3 |
| 5.4.4 | チャーン率グラフ実装 | `Revenue.tsx` | 5.3.4 |
| 5.4.5 | 状態ハンドリング | `Revenue.tsx` | 5.4.1-5.4.4 |

---

## 14.6 Phase 6: システム監視

### 6.1 サーバーサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 6.1.1 | `admin.system.pushStats` 実装 | API | 1.2.4 |
| 6.1.2 | `admin.system.smsStats` 実装 | API | 1.2.4 |
| 6.1.3 | `admin.system.vapidStatus` 実装 | API | 1.2.4 |
| 6.1.4 | `admin.system.health` 実装 | API | 1.2.4 |
| 6.1.5 | テスト作成 | test file | 6.1.1-6.1.4 |

### 6.2 フロントサイド

| ID | タスク | 成果物 | 依存 |
|---|---|---|---|
| 6.2.1 | Push 統計 UI 実装 | `System.tsx` | 6.1.1 |
| 6.2.2 | SMS 統計 UI 実装 | `System.tsx` | 6.1.2 |
| 6.2.3 | VAPID 状況 UI 実装 | `System.tsx` | 6.1.3 |
| 6.2.4 | DB ヘルス UI 実装 | `System.tsx` | 6.1.4 |
| 6.2.5 | 状態ハンドリング | `System.tsx` | 6.2.1-6.2.4 |

---

## 15. テスト計画

### 15.1 必須テスト

| テスト対象 | 内容 |
|---|---|
| 内部管理者認証 | `internalAdminProcedure` が `INTERNAL_ADMIN_IDS` と固定 auth ID で制御できること |
| セッション反映 | `ctx.user.isInternalAdmin` が正しくフロントへ伝播すること |
| 統計除外 | `is_test = true` のデータがデフォルト集計に入らないこと |
| ユーザー管理 | 一覧、検索、ステータス更新、テストフラグ更新 |
| 店舗管理 | 一覧、検索、詳細、状態更新 |
| テストセットアップ | 1 ユーザー + 3 店舗が正しく作られること |
| テストリセット | 店舗は残り、関連データだけが初期化されること |
| 収益表示 | Stripe データ取得時の表示・例外処理 |
| 監視画面 | Push / SMS / VAPID / DB 状態の取得 |

### 15.2 UI テスト観点

- ローディング表示
- エラー表示
- 空状態表示
- 未許可ユーザーから管理者リンクが見えないこと
- URL 直打ちでも API で拒否されること
- allowlist 対象ユーザーに内部管理者バッジが表示されること

---

## 16. 受け入れ条件（Acceptance Criteria）

### 16.1 基盤

- `INTERNAL_ADMIN_IDS` に含まれるユーザーのみ `/internal-admin` に入れる
- 未許可ユーザーは UI / API の両方で拒否される
- 契約者アカウントは内部管理画面を利用できない

### 16.2 内部管理者登録方式

- 公開登録だけでは内部管理者にならない
- 固定 auth ID を `INTERNAL_ADMIN_IDS` に追加し、設定反映後にアクセス権が付与される
- UI 上に内部管理者昇格ボタンは存在しない

### 16.3 テストアカウント

- 管理者画面からテストアカウントをセットアップできる
- Free / Standard / Pro 相当の 3 店舗が作成される
- 各テスト店舗から通常 UI でチケット操作できる
- リセット後も店舗は保持される

### 16.4 統計

- テスト店舗のデータはデフォルトで除外される
- `includeTest` を有効化すると含まれる
- 管理者 KPI / チケット統計 / 収益 / 監視が表示される

### 16.5 品質

- 主要 API にテストがある
- 既存機能の回帰がない
- 例外時に画面が壊れず、適切なメッセージが出る

---

## 17. リスクと未確定事項

### 17.1 未確定事項

1. **アクティブ店舗の定義**  
   Phase 2 実装では **過去30日** に固定した。

2. **平均待ち時間の定義**  
   発券 → 呼び出し なのか、発券 → 完了 なのかを明確化する必要がある。

3. **停止/復帰の実体フィールド**  
   Phase 3 実装では `users.status (active | suspended)` を追加し、店舗側は既存 `stores.intakeStatus (open | paused)` を使う。

4. **最近のアクティビティのデータソース**  
   Phase 2 実装では `users / stores / tickets / sms_logs / sms_transactions(type=charge)` から生成する。

5. **Push 成功率のログ元**  
   送信成功/失敗の永続ログがないため、Overview では未実装。必要なら先にログ保存が必要。

6. **Twilio 残高取得可否**  
   利用プランや API 権限に依存する可能性がある。

7. **固定 auth ID の実際のフィールド名**  
   Phase 1 実装では **`openId`** を `getAuthSubject()` の基準に採用した。

8. **デプロイ先の環境変数反映タイミング**  
   `INTERNAL_ADMIN_IDS` 更新後に再起動・再デプロイ・ホットリロードのどれが必要か確認が必要。

### 17.2 実装リスク

- Stripe / Twilio / Push など外部依存によりローカル再現性が落ちる可能性
- 統計クエリが重くなりやすい
- テスト除外条件の漏れがあると KPI が歪む
- 店舗停止の影響範囲が既存ロジックに波及する可能性
- **方法Bはシンプルだが、内部担当者が増えると運用負荷が上がる**
- **allowlist 更新のたびに設定反映が必要になる**
- **内部管理者履歴や監査証跡はこの方式だけでは弱い**

---

## 18. Codex 実装時の推奨ルール

1. **Phase 1 から順番に実装すること**
2. **1 フェーズごとにコミット可能な単位に分割すること**
3. **サーバー API と UI を同時に大規模変更しないこと**
4. **各フェーズで最低 1 つはテストを追加すること**
5. **既存の命名規則・ディレクトリ構造・UI パターンを優先すること**
6. **テストデータ除外ロジックは共通化を検討すること**
7. **例外処理・権限エラー・空状態を省略しないこと**
8. **内部管理者判定は必ず不変の auth ID を使うこと**
9. **表示名やアカウント名では判定しないこと**
10. **UI から内部管理者付与・剥奪を追加しないこと**

---

## 19. Codex に渡す実装指示テンプレート

以下は Codex にそのまま渡しやすい作業指示テンプレートです。

```md
# 実装タスク

Queue Call に運営会社向け内部管理ダッシュボードとテストアカウント機能を追加してください。

## 実装方針
- 既存の店舗オーナー UI は壊さない
- 既存の店舗オーナー向け `/admin/*` は維持し、内部管理画面は `/internal-admin/*` に追加する
- 内部管理者判定は方法Bを採用する
- 具体的には `INTERNAL_ADMIN_IDS` と認証基盤の固定 auth ID の一致で判定する
- Phase 1 実装では `openId` を `getAuthSubject()` の基準に採用しているため、以降のフェーズも `openId` 前提で扱う
- 表示名やアカウント名では判定しない
- フロントへは `user.isInternalAdmin` を公開して表示制御する
- 最終的な認可は `internalAdminProcedure` で行う
- テストアカウントは 1 ユーザー + 3 店舗
- `stores.is_test = true` のデータは統計からデフォルト除外
- 実装は Phase 1 から順に行う
- UI からの内部管理者昇格・剥奪は実装しない

## Phase 1
- `users.is_test`, `stores.is_test`, `stores.test_plan_override` を追加
- `getAuthSubject()` を実装
- `INTERNAL_ADMIN_IDS` パーサーと `isInternalAdmin()` を実装
- `internalAdminProcedure` を実装
- `ctx.user.isInternalAdmin` をフロントへ公開
- `server/routers/admin.ts` を作成
- `/internal-admin/*` ルーティングと空ページを作成
- 許可ユーザーのみアクセス可能にする
- 必要なテストを追加する

## 完了条件
- `INTERNAL_ADMIN_IDS` に含まれるユーザーだけが `/internal-admin` にアクセスできる
- 未許可ユーザーは API と UI の両方で拒否される
- テストが通る
```

---

## 20. 実装順序の推奨

1. Phase 1: 基盤
2. Phase 2: 概要ページ
3. Phase 3: ユーザー/店舗管理
4. Phase 4: テストアカウント
5. Phase 5: チケット統計/収益
6. Phase 6: システム監視

この順序が最も安全で、途中段階でも価値が出やすい。

---

## 21. タスク総数サマリー

| フェーズ | タスク数 | テストファイル数 |
|---|---:|---:|
| Phase 1: 基盤構築 | 17 | 1 |
| Phase 2: 概要ページ | 14 | 1 |
| Phase 3: ユーザー/店舗管理 | 22 | 2 |
| Phase 4: テストアカウント | 13 | 1 |
| Phase 5: チケット統計 + 収益 | 19 | 2 |
| Phase 6: システム監視 | 10 | 1 |
| **合計** | **95** | **8** |

---

## 22. 最終メモ

この資料は実装に十分近いが、以下の点だけは着手前にリポジトリ実態と照合すること。

- 既存 schema の正確なカラム名
- 認証コンテキストの型
- 固定 auth ID の実際のフィールド名
- `INTERNAL_ADMIN_IDS` の反映タイミング
- Stripe / Twilio / Push ログの保存有無
- 既存 UI コンポーネントの共通ルール

不一致があれば、設計意図を維持したまま現行コードベースに合わせて調整する。

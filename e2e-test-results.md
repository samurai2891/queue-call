# E2E テスト結果レポート — リリース前バグチェック

実施日: 2026-02-28

---

## 発見したバグと修正状況

### BUG-001: StoreTop.tsx — Reactフックルール違反 [重大] [修正済み]
- **症状**: 「Rendered more hooks than during the previous render」エラーで店舗トップが全く表示されない
- **原因**: 早期リターン（loading/error）の後にuseMemoフックが呼ばれていた
- **修正**: useMemoを早期リターンの前に移動、store?.でオプショナルチェインに変更
- **ファイル**: `client/src/pages/store/StoreTop.tsx`

### BUG-002: Dashboard.tsx — Reactフックルール違反 [重大] [修正済み]
- **症状**: 同上。管理画面ダッシュボードが表示されない
- **原因**: 早期リターンの後にuseMemo、ヘルパー関数が定義されていた
- **修正**: ヘルパー関数をコンポーネント外に移動、useMemoを早期リターンの前に移動
- **ファイル**: `client/src/pages/admin/Dashboard.tsx`

### BUG-003: SMS分析画面 — SQLクエリエラー [重大] [修正済み]
- **症状**: SMS分析画面で500エラー（Internal Server Error）
- **原因**: Drizzle ORMのorderBy句でsqlテンプレートリテラル内にASCを含めていた + only_full_group_byモードでのGROUP BY不整合
- **修正**: orderByをDrizzleのasc()関数に変更、GROUP BYをエイリアスベースに変更、try-catchで安全にフォールバック
- **ファイル**: `server/stripe.ts`

---

## テスト済み画面一覧（20画面）

| # | 画面 | URL | 結果 | 備考 |
|---|---|---|---|---|
| 1 | ホーム画面 | `/` | OK | 店舗一覧、機能紹介、料金プラン正常表示 |
| 2 | 店舗トップ | `/s/test` | OK (BUG-001修正後) | 待ち状況、予測待ち時間、受付ボタン正常 |
| 3 | 整理券発行 | `/s/test/join` | OK | 発券フロー正常動作 |
| 4 | チケット画面 | `/s/test/ticket/:token` | OK | チケット情報、待ち人数表示正常 |
| 5 | スタッフ画面 | `/s/test/staff` | OK | PIN入力→スタッフ選択→ログイン正常 |
| 6 | スタッフ: 呼び出し | `/s/test/staff` | OK | 呼び出しボタン、チケット操作正常 |
| 7 | キオスク管理 | `/s/test/kiosk` | OK | URL表示、プレビュー、QRコード正常 |
| 8 | 呼び出しボード管理 | `/s/test/board` | OK | URL表示、プレビュー、QRコード正常 |
| 9 | メニュー画面（グリッド） | `/s/test/menu` | OK | カテゴリ別表示正常 |
| 10 | メニュー画面（リスト） | `/s/test/menu` | OK | セクション分け、固定ヘッダー正常 |
| 11 | 予約画面 | `/s/test/reservation` | OK | 予約フォーム正常表示 |
| 12 | 予約確認 | `/s/test/reservation/check` | OK | 予約番号検索フォーム正常 |
| 13 | 予約管理 | `/s/test/reservations` | OK | PIN入力画面正常表示 |
| 14 | ダッシュボード | `/admin/dashboard` | OK (BUG-002修正後) | 統計カード、グラフ正常表示 |
| 15 | 設定画面 | `/admin/settings` | OK | 全14タブ正常表示 |
| 16 | SMS履歴 | `/admin/sms-history` | OK | 履歴一覧正常表示 |
| 17 | SMS取引履歴 | `/admin/sms-transactions` | OK | 取引一覧、フィルター正常 |
| 18 | SMS分析 | `/admin/sms-analytics` | OK (BUG-003修正後) | グラフ、統計カード正常表示 |
| 19 | プライバシーポリシー | `/privacy` | OK | 全文正常表示 |
| 20 | 利用規約 | `/terms` | OK | 全文正常表示 |

---

## コンソールエラー確認

全画面でコンソールエラーなし（修正後）

---

## 未テスト項目（ユーザー操作必要）

- Stripe決済フロー（Sandbox未クレーム）
- SMS実送信（Twilio設定必要）
- キオスク表示画面（/s/test/kiosk/display）— アクセスキー必要
- 呼び出しボード表示画面（/s/test/board/display）— アクセスキー必要

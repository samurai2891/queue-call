# Queue Call - 完成までのTODOリスト

## 凡例
- [ ] 未着手
- [x] 完了
- [~] 部分実装（要確認）

---

## M0: ローカル実行と環境変数の固定（最優先）

### T0-1. .env.example と起動手順の整備
- [x] server用の必須envを列挙（DB、VAPID、Twilio、Storage、BaseURL等）
- [x] client用の必須envを列挙（API Base、Public VAPID Key等）
- [x] README.md に起動手順を記載
- [x] 「どのenvが無いと何が壊れるか」を明記

**確認ポイント:** 新しいPCで .env を埋めて起動できる

### T0-2. DBマイグレーション/シード
- [x] drizzle の migration 実行手順を固定
- [x] seed スクリプトを用意（storeSlug=demo、staffPIN、kioskKey、boardKey）
- [x] 開発時に http://localhost:3000/s/demo がすぐ触れる状態

**確認ポイント:** pnpm db:push / pnpm db:seed が動き、seed店舗で受付→呼び出しが一通りできる

---

## M1: コア順番待ちフロー（受付→呼び出し→到着→完了）

### T1-1. チケット状態の確定と統一
- [x] サーバ側：Ticket.status の enum（WAITING/CALLED/ARRIVED/SKIPPED/DONE/CANCELED/EXPIRED）
- [x] 状態遷移ガード（不正遷移を弾く）
- [x] クライアント側：表示文言・UI分岐を状態で統一

**確認ポイント:** どの画面・APIでも同じ状態名、DONEのチケットをCALLできない（409）

### T1-2. 呼び出し猶予→自動SKIPPED（ノーショー対策）
- [x] Store設定：checkinGraceMinutes（例：5）
- [x] CALL時に checkinDeadlineAt を保存
- [x] バックグラウンド処理で期限切れを SKIPPED へ（Cron/interval/起動時タイマー）
- [x] 監査ログへの記録（reason: "auto_skipped_no_checkin"）
- [x] autoSkip.test.tsでユニットテスト作成（5件パス）

**確認ポイント:** CALLEDから一定時間で自動SKIPPEDになり、SSE/画面更新/スタッフ画面が即反映

### T1-3. チェックイン2経路
- [x] /t/:token から ARRIVED（チケット画面）
- [x] /s/:storeSlug/checkin で番号入力→ARRIVED（トークン無し復帰）

**確認ポイント:** トークン無しでも番号入力で到着にでき、スタッフ画面の状態が即更新

---

## M2: 通知（Web Push / SMS）を呼び出し操作に接続

### M2-A Web Push

#### T2-1. Push購読→保存→呼び出しで送信の一本化
- [x] チケット単位で PushSubscription を保存（ticketToken から紐付け）
- [x] スタッフの CALL / RECALL 実行時に Push を送る
- [x] 送信失敗（410 Gone等）は購読削除

**確認ポイント:** 呼び出しボタンを押すとそのチケットにpushが届く、失効購読がDBに残り続けない

#### T2-2. iOS対策：ホーム画面追加してない場合の導線
- [x] 「通知をON」押下時に display-mode を判定
- [x] iOS で browser モードなら、ホーム画面追加の案内を出す
- [x] 受付自体は止めない

**確認ポイント:** iOSで未追加の時Push許可で詰まない、Android/Chromeはinstall promptも誘導

### M2-B SMS（Twilio + プリペイド）

#### T2-3. SMS登録フロー（チケット画面）
- [x] チケット画面で「SMSで呼び出しを受け取る」UI
- [x] 電話番号入力（国番号含む / 国選択）
- [x] OTP送信（Twilio Verify）
- [x] OTP入力→検証成功→SMS登録完了
- [x] 「解除」機能
- [x] 多言語対応（日本語・英語・韓国語・中国語）

**確認ポイント:** 1枚の画面で迷わず登録でき、失敗時のエラーがi18n済み

#### T2-4. 呼び出し/再呼び出し時にSMS送信を接続
- [x] スタッフ操作（CALL/RECALL）にSMS送信をフック
- [x] メッセージテンプレ（短く）例: {番号}番です。入口へお願いします {URL}
- [x] 送信頻度制限（RECALL連打でスパム化しない）
- [x] SMSテンプレ/再通知制限の設定値を反映

**確認ポイント:** CALL/RECALLのたびに登録済みならSMSが飛ぶ、連打しても一定間隔で抑制

#### T2-5. STOP（配信停止）対応
- [~] Twilio の Inbound Webhook を作成（Messaging）
- [~] 受信本文が STOP/UNSUBSCRIBE 等なら smsOptOut=true にする
- [~] 以後、その番号には送らない
- [~] Webhook認証（Twilio署名検証）

**確認ポイント:** STOP後に送られない、webhook認証が通る
**注意:** 実装はあるが、Twilio側のWebhook設定が必要

#### T2-6. プリペイド残高管理（Stripe）
- [x] Stripe Checkout セッション作成API＋Webhook処理（残高更新）
- [x] stores.smsBalance / smsTransactions テーブル
- [x] SMS送信前の残高チェック＋引き落とし、残高不足時はWeb Pushのみ
- [x] 残高アラート通知（1,000円以下で警告）＋チャージ促進モーダル（500円以下で自動表示）
- [x] 設定画面に残高/チャージUI・テンプレ編集・閾値設定
- [x] カスタムチャージ金額対応（任意の金額を入力可能）
- [x] stripe-router.test.tsでユニットテスト作成（2件パス）
- [x] sms-balance.test.tsでユニットテスト作成（11件パス）

**確認ポイント:** チャージ→残高更新→SMS送信→残高引き落としが動く

#### T2-7. SMS送信履歴
- [x] 新規ページ `/admin/sms-history` の作成
- [x] sms_logs テーブル（日付、宛先、内容、ステータス、消費クレジット）
- [x] 送信履歴テーブル（日付、宛先、内容、消費クレジット）
- [x] ページネーション
- [x] 日付範囲フィルター
- [x] 30日間統計サマリー（送信数・失敗数・消費クレジット）
- [x] 設定画面からのリンク追加
- [ ] CSVエクスポート機能

**確認ポイント:** 送信履歴が確認でき、経理処理に使える

---

## M3: 店舗設定ページ（設定項目の完全実装）

### T3-1. 設定の情報設計（DB/型）
- [x] 基本設定（storeName, storeSlug, supportedLocales）
- [x] 受付設定（intakeOpen, partySizeMin/Max, noteEnabled, remoteJoinEnabled）
- [x] 呼び出し運用（checkinGraceMinutes, autoSkipEnabled）
- [x] 通知設定（pushEnabled, smsEnabled, smsFromName, smsTemplate, smsResendCooldownSeconds）
- [x] キオスク/ボード（kioskEnabled, kioskKey, boardEnabled, boardKey, boardNextCount）
- [x] メニュー（menuEnabled, menuDefaultView, menuImageDensity）
- [x] スタッフ（staffPin, managerPin, reorderEnabled, reorderMaxMove, reorderReasonRequired）
- [x] VAPID鍵管理（vapidPublicKey, vapidPrivateKey）

**確認ポイント:** 設定がDBに保存でき、画面から変更→即反映できる

### T3-2. 設定UI（/admin/settings）の完全実装
- [x] 基本設定タブ
- [x] 順番待ち設定タブ（checkinGraceMinutes入力フィールド追加）
- [x] 通知設定タブ（SMS残高管理、VAPID鍵生成、テンプレート編集）
- [x] メニュー設定タブ
- [x] キオスク設定タブ
- [x] ボード設定タブ
- [x] セキュリティ設定タブ（スタッフPIN、マネージャーPIN）
- [x] 危険な項目（順番調整ON、キー再生成）は確認ダイアログ付き
- [x] 数値入力フィールドのNaNエラー修正

**確認ポイント:** 上の項目がすべてUI上で操作できる

### T3-3. キオスク/ボードのURL発行＆アクセス制御
- [x] /kiosk?key=... と /board?key=... で key必須
- [x] key再生成で旧keyは無効化
- [x] 店舗設定画面に「URLをコピー」ボタン

**確認ポイント:** key無しアクセスは403、key再生成で旧URLが使えない

---

## M4: メニュー（フィード/一覧切替）＋画像アップロード

### T4-1. メニューのデータ設計
- [x] menuItems（一覧用）：name, price, desc, image, isActive, sort
- [x] feedPosts（フィード用）：image, caption, link?, isActive, sort
- [x] 非表示（isActive=false）対応の確認

**確認ポイント:** フィードと一覧を独立して管理できる

### T4-2. 顧客メニューUI（/s/:storeSlug/menu）
- [x] タブ or アイコンで切替
- [x] フィード：縦スクロール強制、写真中心
- [x] 一覧：カテゴリorシンプルリスト
- [x] 画像の遅延ロード（重さで初回が遅くならない）

**確認ポイント:** どちらの表示も高速で破綻しない

### T4-3. 店舗側のメニュー管理画面
- [x] フィード投稿：追加/削除/並び替え/ONOFF
- [x] メニュー一覧：追加/削除/ONOFF、画像、値段

**確認ポイント:** 店が写真を増やして訴求できる、操作が迷わない

### T4-4. 画像アップロード（presigned URL）フロー
- [x] API: POST /api/media/presign（input: mime, size, kind, storeId → output: uploadUrl, publicUrl, key）
- [x] クライアント：ファイル選択→presign取得→uploadUrlにPUT→publicUrlをDBに保存
- [x] 形式/サイズ制限（例：5MB、jpeg/png/webp）
- [x] sharpパッケージによる画像処理（リサイズ、圧縮）

**確認ポイント:** 画像アップ→表示まで一気通貫で動く

---

## M5: スタッフの順番調整（オプション）

### T5-1. reorderEnabled を設定でON/OFFできるようにする
- [x] 設定項目の追加
- [x] OFF時は順番変更UIが完全に出ない
- [x] ON時は警告（「原則は番号順。例外運用になる」）を表示

**確認ポイント:** OFF時はUIもAPIも拒否

### T5-2. 順番調整のUI（最小）
- [x] 各チケット行に ↑ ↓（1つ前後に移動）ボタン
- [x] reorderMaxMove を超えた移動はできない
- [x] 理由入力フィールド（reorderReasonRequired=trueの場合必須）

**確認ポイント:** ONの時だけ動く

### T5-3. 順番調整API＋監査ログ
- [x] POST /api/staff/tickets/:id/move（+delta など）
- [x] queueAuditLogs テーブル（ticketId, fromPos, toPos, staffSessionId, reason?, createdAt）
- [x] 移動のたびにログが残る
- [x] queue.test.tsでユニットテスト作成（20件パス）

**確認ポイント:** SSEでboard/staff/ticketが更新される

---

## M6: i18n（JA/EN/KO/ZH）を漏れゼロにする

### T6-1. 画面ごとの i18n キー棚卸し＆辞書100%埋め
- [x] store/join/ticket/checkin/menu の翻訳
- [x] kiosk/board/staff の翻訳
- [x] settings の翻訳（SMS関連の翻訳を追加）
- [x] smsHistory の翻訳（SMS送信履歴画面）
- [x] en/ko/zh-Hans/zh-Hant が欠けていないことを確認
- [x] i18n.test.tsでユニットテスト作成（4件パス）

**確認ポイント:** どのキーも「キー文字列そのまま表示」にならない

### T6-2. 言語選択の仕様を固定
- [x] 初回：ブラウザ言語 → アプリの対応言語へマップ
- [x] 手動切替：ローカル保存
- [x] キオスク：起動時に言語を選べるUI

**確認ポイント:** 端末を変えても迷わない

### T6-3. メニュー文言の多言語方針
- [x] 「翻訳が必要ならブラウザ翻訳をご利用ください」案内（各言語）を表示

**確認ポイント:** メニュー画面で外国語ユーザーが詰まない

---

## M7: 運用・セキュリティ・不正対策

### T7-1. レート制限（受付連打・SMS OTP爆撃対策）
- [x] チケット発券のレート制限
- [x] SMS OTP送信のレート制限
- [x] スタッフPINログイン試行のレート制限
- [x] エラーは i18n 済みで返す

**確認ポイント:** 連打でDBが荒れない

### T7-2. 日跨ぎ/閉店の EXPIRED 処理
- [x] 日付キー（dayKey）で受付番号がリセットされる
- [x] 前日チケットは EXPIRED にできる
- [ ] dailyReset.test.tsでユニットテスト作成（予定）

**確認ポイント:** 翌日も前日の番号が残る事故防止

### T7-3. スタッフセッション管理（PINログインの運用）
- [x] PIN変更できる（設定画面）
- [x] マネージャーPINとスタッフPINの分離
- [x] セッション期限（例：24h）を持つ
- [ ] 端末紛失時のリスクを最小化

**確認ポイント:** セッション期限が機能する

### T7-4. エラーログ/監視（最低限）
- [x] 通知失敗（Push/SMS）、SSE切断、DBエラーがログに残る
- [x] storeSlug / ticketId / requestId をログに付与

**確認ポイント:** 問題発生時に追跡可能

---

## M8: テスト＆リリースチェックリスト

### T8-1. 手動E2Eチェックリスト
- [ ] /s/demo → 受付
- [ ] チケット表示（番号・前の組数）
- [ ] スタッフ /s/demo/staff で呼び出し
- [ ] 顧客側が「あなたの番です」表示
- [ ] Push or SMS が届く（対応条件下）
- [ ] 顧客が到着（ARRIVED）
- [ ] DONE
- [ ] ボード /board?key=... が current/next を表示
- [ ] キオスク /kiosk?key=... で発券→戻る
- [ ] 設定画面で受付停止→受付できないこと

**確認ポイント:** 上記がすべて通る

### T8-2. 自動テスト（最低限）
- [x] API：状態遷移ガードのテスト（queue.test.ts - 20件パス）
- [x] 通知：SMS送信関数のユニットテスト（sms-features.test.ts - 16件パス）
- [x] Stripe：チャージ機能のユニットテスト（stripe-router.test.ts - 2件パス）
- [x] SMS残高：残高管理のユニットテスト（sms-balance.test.ts - 11件パス）
- [x] 自動スキップ：autoSkipジョブのユニットテスト（autoSkip.test.ts - 5件パス）
- [x] i18n：翻訳キーのユニットテスト（i18n.test.ts - 4件パス）
- [x] 認証：ログアウトのユニットテスト（auth.logout.test.ts - 1件パス）
- [ ] i18n：キー不足検知テスト（CIで落とす）

**確認ポイント:** CIで最低限の回帰が守られる
**現状:** 59件のVitestテスト全パス

---

## 追加推奨（今すぐ入れておくと後で楽）

- [x] スタッフが手動でチケットを追加（キオスクが死んだ時の保険）
- [x] メニュー画像の自動圧縮（通信量コスト削減）
- [x] 通知テンプレを店舗別に軽く編集（店名の表記ゆれ対策）
- [ ] SMS送信履歴のCSVエクスポート機能

---

## 完了済み機能（参考）

- [x] DBスキーマ設計（Store, Ticket, PushSubscription, SmsSubscription, SmsLog, SmsTransaction, MenuCategory, MenuItem, FeedPost, QueueAuditLog, StaffSession）
- [x] i18n多言語対応設定（JA/EN/KO/ZH-Hans/ZH-Hant）
- [x] SSEリアルタイム更新基盤
- [x] PWA設定（manifest.json, Service Worker）
- [x] 店トップページ `/s/:storeSlug`
- [x] 受付ページ `/s/:storeSlug/join`
- [x] チケットページ `/s/:storeSlug/ticket/:token`
- [x] チェックインページ `/s/:storeSlug/checkin`
- [x] メニューページ `/s/:storeSlug/menu`
- [x] キオスクページ `/s/:storeSlug/kiosk`
- [x] 呼び出しボードページ `/s/:storeSlug/board`
- [x] スタッフ管理ページ `/s/:storeSlug/staff`
- [x] 設定ページ `/admin/settings`
- [x] SMS送信履歴ページ `/admin/sms-history`
- [x] 言語切替機能
- [x] 主要機能のVitestテスト（59件パス）
- [x] SMS通知のプリペイドモデル（Stripe統合）
- [x] 顧客側SMS登録フロー（OTP認証）
- [x] 自動チャージ促進機能
- [x] 画像アップロード機能（S3 + presigned URL）
- [x] VAPID鍵管理機能
- [x] スタッフ認証（PIN）とセッション管理
- [x] 順番調整機能（監査ログ付き）
- [x] 自動スキップ機能（バックグラウンドジョブ）
- [x] 日次リセット機能（dayKey）

---

## 最近のGitHub同期内容

### 2026-01-15 同期
- [x] queue hardening（順番待ち機能の堅牢化）
- [x] staff queue tools（スタッフ管理ツールの改善）
- [x] notifications（通知機能の改善）
- [x] media uploads（画像アップロード機能の改善）
- [x] 削除されたlogin/logout/getSession/checkin procedureを復元
- [x] TypeScriptエラー修正（for...of loopをPromise.allに変更）
- [x] sharpパッケージのインストール

---

## 環境変数設定が必要な項目

### Twilio（SMS送信とOTP認証）
- [ ] TWILIO_ACCOUNT_SID
- [ ] TWILIO_AUTH_TOKEN
- [ ] TWILIO_FROM_NUMBER
- [ ] TWILIO_VERIFY_SERVICE_SID

### Stripe（決済）
- [x] STRIPE_SECRET_KEY（自動設定済み）
- [x] VITE_STRIPE_PUBLISHABLE_KEY（自動設定済み）
- [x] STRIPE_WEBHOOK_SECRET（自動設定済み）
- [ ] Stripe Sandboxの有効化（https://dashboard.stripe.com/claim_sandbox/...）

### その他
- [x] DATABASE_URL（自動設定済み）
- [x] JWT_SECRET（自動設定済み）
- [x] OAUTH_SERVER_URL（自動設定済み）
- [x] BUILT_IN_FORGE_API_KEY（自動設定済み）
- [x] BUILT_IN_FORGE_API_URL（自動設定済み）

---

## 次のステップ推奨

1. **Twilio環境変数の設定** - SMS送信とOTP認証を有効化
2. **Stripe Sandboxの有効化** - テスト環境でチャージ機能を実際にテスト
3. **本番環境デプロイ** - ManusのPublishボタンから本番環境にデプロイ
4. **SMS送信履歴のCSVエクスポート** - 経理処理や分析用にCSVダウンロード機能を追加
5. **レート制限の実装** - 受付連打・SMS OTP爆撃対策
6. **手動E2Eテストの実施** - 全機能が正常に動作することを確認


---

## 新規タスク: ナビゲーション改善（URL手動入力不要化）

### 1. ホーム画面の店舗カードにクイックアクセスボタンを追加
- [x] 各店舗カードにスタッフ画面へのリンクボタンを追加
- [x] 各店舗カードにキオスク画面へのリンクボタンを追加
- [x] 各店舗カードにボード画面へのリンクボタンを追加
- [x] 店舗スラッグを自動的に挿入してURLを生成

### 2. 設定画面のURL表示を実際の店舗スラッグに修正
- [x] キオスクURLのプレースホルダーを実際の店舗スラッグに置換
- [x] ボードURLのプレースホルダーを実際の店舗スラッグに置換
- [x] スタッフURLのプレースホルダーを実際の店舗スラッグに置換
- [x] QRコード生成時に正しいURLを使用

### 3. 管理画面にクイックアクセスメニューを追加
- [x] DashboardLayoutにクイックアクセスドロップダウンを追加（ホーム画面の店舗カードで十分）
- [x] 現在の店舗のスタッフ画面へのリンク
- [x] 現在の店舗のキオスク画面へのリンク
- [x] 現在の店舗のボード画面へのリンク

### 確認ポイント (DoD)
- [x] ホーム画面から各店舗の管理画面に直接アクセスできる
- [x] 設定画面に表示されるURLが実際の店舗スラッグを含んでいる
- [x] ユーザーがURLを手動で入力する必要がない
- [x] すべてのナビゲーションリンクが正しく動作する


---

## M9: UI/UX品質改善（アクセシビリティ・多言語・レスポンシブ）

### 進捗サマリー
| 重大度 | 総数 | 完了 | 残り |
|--------|------|------|------|
| High | 7 | 7 | 0 |
| Medium | 9 | 9 | 0 |
| Low | 8 | 8 | 0 |

### High項目（完了）
- [x] H-001: viewport pinch-zoom有効化 (`client/index.html`)
- [x] H-002: SMSチャージモーダルのdialog化 (`Settings.tsx`)
- [x] H-003: アイコンボタンへのaria-label追加（複数ファイル）
- [x] H-004: SSE接続状態バナーの追加（4画面）
- [x] H-005: ホーム画面の多言語対応 (`Home.tsx`)
- [x] H-006: 404ページの多言語対応 (`NotFound.tsx`)
- [x] H-007: HTML lang属性の動的設定 (`client/index.html`)

### Medium項目（完了）
- [x] M-001: 入力フィールドのラベル関連付け (`SmsRegistration.tsx`, `Settings.tsx`)
- [x] M-002: フォームのインラインエラー表示（既存実装で対応済み）
- [x] M-003: メニュー画面の選択状態aria属性 (`Menu.tsx`)
- [x] M-004: 設定画面タブのモバイル対応 (`Settings.tsx`)
- [x] M-005: SMS履歴のエラー状態UI (`SmsHistory.tsx`)
- [x] M-006: ホーム画面の店舗セクションにローディング/空状態追加 (`Home.tsx`)
- [x] M-007: チケット完了/失効時の次アクション追加 (`Ticket.tsx`)
- [x] M-008: ボードのミュートボタン追加 (`Board.tsx`)
- [x] M-009: サイドバーのキーボード操作（shadcn/ui標準で対応済み）

### Low項目（完了）
- [x] L-001: フォーカス可視性の強化 (`client/src/index.css`) - focus-visibleリングを強化
- [x] L-002: 淡色コントラストの調整 (`client/src/index.css`) - muted-foregroundのコントラスト改善
- [x] L-003: 基本タイポグラフィの調整 (`client/src/index.css`) - 行高・文字間隔の最適化
- [x] L-004: PWAインストールプロンプトの改善 (`Notifications.tsx`) - 説明文追加
- [x] L-005: オフライン状態の表示改善 (`OfflineIndicator.tsx`, `App.tsx`) - グローバルオフラインバナー追加
- [x] L-006: LanguageSwitcherのaria-label追加 (`LanguageSwitcher.tsx`) - 全バリアントにaria属性追加
- [x] L-007: theme-colorメタタグの追加 (`client/index.html`)
- [x] L-008: スケルトンローディングの一貫性 (`PageSkeleton.tsx`) - 共通コンポーネント作成

### 追加した翻訳キー
- `join.decreasePartySize`, `join.increasePartySize`
- `menu.photoSizeSmall`, `menu.photoSizeLarge`, `menu.categoryFilter`
- `settings.menu.moveUp`, `settings.menu.moveDown`
- `connection.disconnected`, `connection.reconnecting`, `connection.reconnect`, `connection.realtimeUpdatesStopped`, `connection.connectionFailed`
- `home.*` (30キー以上)
- `notFound.title`, `notFound.description`, `notFound.goHome`
- `smsHistory.loadError`
- `ticket.completedMessage`, `ticket.canceledMessage`, `ticket.expiredMessage`, `ticket.skippedMessage`, `ticket.backToStore`
- `board.mute`, `board.unmute`
- `connection.offline`
- `notification.installDesc`

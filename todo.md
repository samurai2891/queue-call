# Queue Call - 順番待ち呼び出しシステム TODO

## Phase 1: 基盤構築
- [x] DBスキーマ設計（Store, Ticket, PushSubscription, SmsSubscription, MenuCategory, MenuItem, Media, FeedPost, QueueAuditLog）
- [x] i18n多言語対応設定（JA/EN/KO/ZH-Hans/ZH-Hant）
- [x] SSEリアルタイム更新基盤
- [x] PWA設定（manifest.json, Service Worker）

## Phase 2: 顧客向け機能
- [x] 店トップページ `/s/:storeSlug`（店名・現在番号・待ち組数・受付/メニューボタン）
- [x] 受付ページ `/s/:storeSlug/join`（来店人数・自由入力・発券）
- [x] チケットページ `/s/:storeSlug/ticket/:token`（番号・現在呼び出し中・前の組数・通知設定・キャンセル）
- [x] チェックインページ `/s/:storeSlug/checkin`（番号入力・到着確認）
- [x] メニューページ `/s/:storeSlug/menu`（フィード/一覧切替・写真サイズ大小切替）
- [x] 言語切替機能（ブラウザ言語自動検出・手動切替）

## Phase 3: 店舗向け機能
- [x] キオスクページ `/s/:storeSlug/kiosk`（多言語選択・人数入力・発券・番号表示・自動リセット）
- [x] 呼び出しボードページ `/s/:storeSlug/board`（現在番号・次の番号・リアルタイム更新）
- [x] スタッフ管理ページ `/s/:storeSlug/staff`（PINログイン・待ちリスト・呼び出し・スキップ・到着・完了・受付停止/再開）
- [x] 順番調整モード（店舗設定で許可時のみ・喚起モーダル・移動上限・理由入力）

## Phase 4: 店舗設定
- [x] 設定トップ `/admin/settings`
- [x] 基本設定 `/settings/general`（店名・デフォルト言語・対応言語・日次リセット時刻）
- [x] 順番待ち設定 `/settings/queue`（チェックイン猶予・自動スキップ・順番調整許可）
- [x] 通知設定 `/settings/notifications`（Push/SMS ON/OFF・再通知制限・SMSテンプレート）
- [x] メニュー設定 `/settings/menu`（表示設定・カテゴリ管理・商品管理・フィード投稿管理）
- [x] キオスク設定 `/settings/kiosk`（key再生成・自動リセット秒数・最大人数）
- [x] ボード設定 `/settings/board`（key再生成・次の表示件数）
- [x] セキュリティ `/settings/security`（managerPIN・staffPIN変更）

## Phase 5: 通知機能
- [x] Web Push通知（Service Worker・購読登録・呼び出し通知）
- [x] SMS通知（Twilio Verify OTP・呼び出しSMS・再通知・STOP対応）
- [x] 画面内通知（リアルタイム更新・全画面呼び出し表示・バイブ/音）

## Phase 6: メディア・ストレージ
- [x] 画像アップロード（presigned URL・大小2バリアント）
- [x] メニュー写真管理
- [x] フィード投稿画像管理

## Phase 7: API実装
- [x] チケット系API（発券・取得・キャンセル・到着・Push購読・SMS登録）
- [x] スタッフ系API（ログイン・待ち一覧・呼び出し・再通知・スキップ・到着・完了・受付停止/再開・順番調整）
- [x] メニュー系API（一覧取得・フィード取得・カテゴリ/商品/投稿管理）
- [x] 設定系API（取得・更新・key再生成）
- [x] SSEストリーム（board/staff/ticket scope）
- [x] Twilio Webhooks（StatusCallback・Inbound）

## Phase 8: テスト・調整
- [x] 主要機能のVitestテスト
- [x] PWA動作確認
- [x] 多言語表示確認
- [x] レスポンシブデザイン確認

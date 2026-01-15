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

**確認ポイント:** 1枚の画面で迷わず登録でき、失敗時のエラーがi18n済み

#### T2-4. 呼び出し/再呼び出し時にSMS送信を接続
- [x] スタッフ操作（CALL/RECALL）にSMS送信をフック
- [x] メッセージテンプレ（短く）例: {番号}番です。入口へお願いします {URL}
- [x] 送信頻度制限（RECALL連打でスパム化しない）
- [x] SMSテンプレ/再通知制限の設定値を反映

**確認ポイント:** CALL/RECALLのたびに登録済みならSMSが飛ぶ、連打しても一定間隔で抑制

#### T2-5. STOP（配信停止）対応
- [x] Twilio の Inbound Webhook を作成（Messaging）
- [x] 受信本文が STOP/UNSUBSCRIBE 等なら smsOptOut=true にする
- [x] 以後、その番号には送らない
- [x] Webhook認証（Twilio署名検証）

**確認ポイント:** STOP後に送られない、webhook認証が通る

#### T2-6. プリペイド残高管理（Stripe）
- [x] Stripe Checkout セッション作成API＋Webhook処理（残高更新）
- [x] stores.smsBalance / smsTransactions テーブル
- [x] SMS送信前の残高チェック＋引き落とし、残高不足時はWeb Pushのみ
- [x] 残高アラート通知（1,000円以下で警告）＋チャージ促進モーダル
- [x] 設定画面に残高/チャージUI・テンプレ編集・閾値設定

#### T2-7. SMS送信履歴
- [x] 新規ページ `/admin/sms-history` の作成
- [x] 送信履歴テーブル（日付、宛先、内容、消費クレジット）
- [x] ページネーション
- [x] 日付範囲フィルター
- [x] 設定画面からのリンク追加
- [x] CSVエクスポート機能


---

## M3: 店舗設定ページ（設定項目の完全実装）

### T3-1. 設定の情報設計（DB/型）
- [x] 基本設定（storeName, storeSlug, supportedLocales）
- [x] 受付設定（intakeOpen, partySizeMin/Max, noteEnabled, remoteJoinEnabled）
- [x] 呼び出し運用（checkinDeadlineMinutes, autoSkipEnabled）
- [x] 通知設定（pushEnabled, smsEnabled, smsFromName）
- [x] キオスク/ボード（kioskEnabled, kioskKey, boardEnabled, boardKey, boardNextCount）
- [x] メニュー（menuEnabled, menuDefaultView, menuImageDensity）
- [x] スタッフ（staffPin, reorderEnabled, reorderMaxMove）

**確認ポイント:** 設定がDBに保存でき、画面から変更→即反映できる

### T3-2. 設定UI（/admin/settings）の完全実装
- [x] 基本設定タブ
- [x] 順番待ち設定タブ
- [x] 通知設定タブ
- [x] メニュー設定タブ
- [x] キオスク設定タブ
- [x] ボード設定タブ
- [x] セキュリティ設定タブ
- [x] 危険な項目（順番調整ON、キー再生成）は確認ダイアログ付き

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

**確認ポイント:** ONの時だけ動く

### T5-3. 順番調整API＋監査ログ
- [x] POST /api/staff/tickets/:id/move（+delta など）
- [x] queueAuditLogs テーブル（ticketId, fromPos, toPos, staffSessionId, reason?, createdAt）
- [x] 移動のたびにログが残る

**確認ポイント:** SSEでboard/staff/ticketが更新される

**注意:** `queue_audit_logs`のカラム追加に伴う`pnpm db:push`は未実行

---

## M6: i18n（JA/EN/KO/ZH）を漏れゼロにする

### T6-1. 画面ごとの i18n キー棚卸し＆辞書100%埋め
- [x] store/join/ticket/checkin/menu の翻訳
- [x] kiosk/board/staff の翻訳
- [~] settings の翻訳
- [ ] en/ko/zh-Hans/zh-Hant が欠けていないことを確認

**確認ポイント:** どのキーも「キー文字列そのまま表示」にならない

### T6-2. 言語選択の仕様を固定
- [x] 初回：ブラウザ言語 → アプリの対応言語へマップ
- [x] 手動切替：ローカル保存
- [x] キオスク：起動時に言語を選べるUI

**確認ポイント:** 端末を変えても迷わない

### T6-3. メニュー文言の多言語方針
- [ ] 「翻訳が必要ならブラウザ翻訳をご利用ください」案内（各言語）を表示

**確認ポイント:** メニュー画面で外国語ユーザーが詰まない

---

## M7: 運用・セキュリティ・不正対策

### T7-1. レート制限（受付連打・SMS OTP爆撃対策）
- [ ] チケット発券のレート制限
- [ ] SMS OTP送信のレート制限
- [ ] スタッフPINログイン試行のレート制限
- [ ] エラーは i18n 済みで返す

**確認ポイント:** 連打でDBが荒れない

### T7-2. 日跨ぎ/閉店の EXPIRED 処理
- [ ] 日付キー（dayKey）で受付番号がリセットされる
- [ ] 前日チケットは EXPIRED にできる

**確認ポイント:** 翌日も前日の番号が残る事故防止

### T7-3. スタッフセッション管理（PINログインの運用）
- [x] PIN変更できる（設定画面）
- [ ] セッション期限（例：24h）を持つ
- [ ] 端末紛失時のリスクを最小化

**確認ポイント:** セッション期限が機能する

### T7-4. エラーログ/監視（最低限）
- [ ] 通知失敗（Push/SMS）、SSE切断、DBエラーがログに残る
- [ ] storeSlug / ticketId / requestId をログに付与

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
- [x] API：状態遷移ガードのテスト
- [~] 通知：送信関数のユニットテスト（Twilioはモック）
- [ ] i18n：キー不足検知テスト（CIで落とす）

**確認ポイント:** CIで最低限の回帰が守られる

---

## 追加推奨（今すぐ入れておくと後で楽）

- [ ] スタッフが手動でチケットを追加（キオスクが死んだ時の保険）
- [ ] メニュー画像の自動圧縮（通信量コスト削減）
- [ ] 通知テンプレを店舗別に軽く編集（店名の表記ゆれ対策）

---

## 完了済み機能（参考）

- [x] DBスキーマ設計（Store, Ticket, PushSubscription, SmsSubscription, MenuCategory, MenuItem, FeedPost, QueueAuditLog）
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
- [x] 言語切替機能
- [x] 主要機能のVitestテスト（16件パス）


---

## 新規追加タスク: T1-2 自動スキップ機能

### 実装内容
- [x] バックグラウンドジョブの作成（server/jobs/autoSkip.ts）
- [x] CALLED状態のチケットで猶予時間（checkinGraceMinutes）を超過したものを自動SKIPPED化
- [x] setIntervalで定期実行（60秒ごと）
- [x] server/_core/index.tsでジョブを起動
- [x] 監査ログへの記録（reason: "auto_skipped_no_checkin"）
- [x] SSEで状態変更を通知

### テスト
- [x] autoSkip.test.tsでユニットテスト作成
- [x] CALLED状態のチケットが猶予時間経過後にSKIPPEDになることを確認
- [x] autoSkipEnabled=falseの場合はスキップされないことを確認

**確認ポイント:** 呼び出し後5分経過したチケットが自動的にSKIPPEDになり、次の顧客が呼ばれる


---

## 新規追加タスク: 店舗設定画面に猶予時間設定項目を追加

### 実装内容
- [x] Settings.tsxの順番待ち設定セクションにcheckinGraceMinutes入力フィールドを追加
- [x] 入力値のバリデーション（1～60分の範囲）
- [x] 設定保存時にsettings.queue.checkinGraceMinutesを更新
- [x] 設定画面に説明文を追加（「呼び出し後、この時間内に到着しない場合は自動的にスキップされます」）

### 確認ポイント
- [x] 設定画面で猶予時間を変更できる
- [x] 変更した猶予時間が自動スキップジョブに反映される
- [x] 無効な値（0分、61分以上）を入力するとエラーが表示される


---

## バグ修正: 設定画面のNaNエラー

### 問題
- [x] 設定画面の数値入力フィールドでNaNエラーが発生
- [x] parseIntの結果がNaNになる可能性がある（空文字列、undefined等）

### 修正内容
- [x] 数値入力フィールドのvalue属性でNaNをチェック
- [x] parseIntの結果をNumber.isNaN()で検証
- [x] NaNの場合はデフォルト値を使用
- [x] 空文字列の場合の処理を追加




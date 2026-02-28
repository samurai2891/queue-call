# Webプッシュ通知機能 調査レポート

## 調査概要

Queue Call の呼び出し通知の要となるWebプッシュ通知機能について、以下の観点から包括的に調査を実施しました。

- Service Worker（sw.js）
- VAPID キー管理（vapid.ts / systemRouter.ts）
- 購読フロー（usePushNotification.ts / Notifications.tsx）
- 送信ロジック（notifications.ts）
- DB スキーマ（push_subscriptions）
- 呼び出しフロー統合（routers.ts）
- iOS / PWA 対応
- テストカバレッジ

---

## 全体評価

実装は基本的に堅実で、主要なフローは正しく動作する構造になっています。ただし、本番運用で問題になりうるいくつかの改善点が見つかりました。以下に重大度別に整理します。

---

## 問題点一覧

### High（重大）

| # | 問題 | 箇所 | 影響 | 改善案 |
|---|------|------|------|--------|
| H-1 | **プッシュ通知ペイロードに `url` が含まれていない** | `notifications.ts` L486-495 | sw.js の `notificationclick` イベントで `event.notification.data?.url` を参照しているが、`notifyTicketCalled` が送信するペイロードの `data` に `url` フィールドがない。通知をタップしてもチケットページではなくルート `/` に遷移してしまう。 | `notifyTicketCalled` の `sendPushNotification` 呼び出しで `data` に `url: options?.ticketUrl` と `ticketToken` を含める。 |
| H-2 | **push_subscriptions に重複防止がない** | `drizzle/schema.ts` L223-230, `db.ts` L564-569 | 同じブラウザから同じチケットに対して複数回 subscribe すると、同一の endpoint が重複登録される。呼び出し時に同じデバイスに複数回通知が届く。 | `createPushSubscription` で `endpoint + ticketId` の組み合わせで upsert（INSERT ... ON DUPLICATE KEY UPDATE）にするか、登録前に既存チェックを追加。スキーマにユニークインデックスを追加。 |
| H-3 | **notifyTicketCalled の結果が無視されている** | `routers.ts` L1039-1050 等 | `await notifyTicketCalled(...)` の戻り値 `{ push: boolean; sms: boolean }` を使用していない。プッシュ通知の送信失敗がスタッフ画面に伝わらず、呼び出しが届いていないことに気づけない。 | 戻り値を受け取り、push/sms の成否をレスポンスに含めるか、失敗時にスタッフ画面にフィードバック（SSE経由 or レスポンス）を返す。 |

### Medium（中程度）

| # | 問題 | 箇所 | 影響 | 改善案 |
|---|------|------|------|--------|
| M-1 | **TTL が 86400秒（24時間）で長すぎる** | `notifications.ts` L95, L153 | 順番待ち呼び出しは即時性が重要。24時間後に届いても意味がない。古い通知がキューに溜まり、遅延配信される可能性がある。 | TTL を 300〜600秒（5〜10分）程度に短縮。チケットの有効期限（checkinGraceMinutes）と連動させるのが理想。 |
| M-2 | **Urgency ヘッダーが未設定** | `notifications.ts` L95 | Web Push Protocol では `urgency` ヘッダーで配信優先度を指定できる。未設定だと `normal` 扱いになり、バッテリーセーバーモード等で遅延する可能性がある。 | `webPush.sendNotification` のオプションに `urgency: 'high'` を追加。呼び出し通知は即時配信が必要。 |
| M-3 | **SMS送信失敗時の残高返金ロジックが未実装** | `notifications.ts` L332 | Twilio API エラー時、残高は既に消費済みだがSMSは送信されていない。コメントで「consider refund logic」と記載されているが未実装。 | 送信失敗時に `sms_transactions` に `refund` タイプのレコードを追加して残高を戻すロジックを実装。 |
| M-4 | **VAPID キー生成後の自動設定フローが不完全** | `systemRouter.ts` L39-51 | `generateVapidKeys` はキーを生成して返すだけで、環境変数への自動設定は行わない。管理者が手動で Settings → Secrets に設定する必要がある。 | 生成後に `webdev_request_secrets` 相当の処理で自動的に環境変数を設定するか、UIでワンクリック設定できるフローを追加。 |
| M-5 | **Service Worker のキャッシュバージョン管理が静的** | `sw.js` L1 | `CACHE_NAME = 'queue-call-v1'` がハードコードされている。アプリ更新時にキャッシュが古いまま残り、新しいUIが反映されない可能性がある。 | ビルド時にハッシュを含めたキャッシュ名を生成するか、`vite-plugin-pwa` 等のツールで自動管理。 |

### Low（軽微）

| # | 問題 | 箇所 | 影響 | 改善案 |
|---|------|------|------|--------|
| L-1 | **VAPID_SUBJECT がデフォルト値のまま** | `notifications.ts` L35 | `mailto:admin@example.com` がフォールバック値。一部のプッシュサービスで拒否される可能性がある。 | 環境変数で実際のメールアドレスを設定するよう促すか、オーナーのメールアドレスを自動設定。 |
| L-2 | **sw.js の Background Sync が未実装** | `sw.js` L119-128 | `syncCheckin` 関数が空実装（console.log のみ）。オフライン時のチェックイン同期が動作しない。 | 実装するか、使用しないなら削除してコードを整理。 |
| L-3 | **usePushNotification の isSubscribed 判定が不正確** | `usePushNotification.ts` L23-27 | ブラウザレベルの PushSubscription の有無で判定しているが、サーバー側の push_subscriptions テーブルとの整合性は確認していない。ブラウザで購読済みでもサーバーにレコードがない場合がある（クリーンアップ後など）。 | サーバー側の購読状態も確認するか、購読時にサーバーへの登録成功を条件に isSubscribed を更新。 |
| L-4 | **プッシュ通知のフォールバックメッセージが日本語固定** | `notifications.ts` L478-480 | 多言語対応しているアプリだが、プッシュ通知のフォールバックメッセージが日本語のみ。テンプレート未設定時に外国語ユーザーに日本語通知が届く。 | チケットまたは店舗のロケール設定に基づいてフォールバックメッセージの言語を切り替える。 |

---

## 良い点（正しく実装されている部分）

1. **無効な購読の自動クリーンアップ**: 404/410 レスポンス時に push_subscriptions から自動削除（L103-104）
2. **iOS PWA 対応**: スタンドアロンモード検出とインストールガイドダイアログの表示
3. **テスト通知機能**: 管理画面からテスト通知を送信できるUI（VapidSettings.tsx）
4. **古いチケットのクリーンアップ**: 90日経過したチケットの push_subscriptions を自動削除（cleanupOldTickets.ts）
5. **SSE との併用**: プッシュ通知に加え、SSE でリアルタイム更新も配信しており、二重の通知チャネルを確保
6. **Service Worker の notificationclick**: 既存ウィンドウのフォーカスと新規ウィンドウの開設を適切にハンドリング
7. **requireInteraction: true**: 通知が自動で消えず、ユーザーの操作を待つ設定（重要な呼び出し通知に適切）
8. **vibrate パターン**: モバイルデバイスでの振動パターンが設定済み

---

## 推奨対応優先順位

1. **H-1（url 未設定）** — 通知タップ時のUXに直結。即座に修正すべき。
2. **H-2（重複購読）** — 同じデバイスに複数通知が届く問題。DB スキーマ変更が必要。
3. **H-3（結果無視）** — 通知失敗の可視化。スタッフの運用品質に影響。
4. **M-1（TTL 短縮）** — 即時性が重要な呼び出し通知に不適切な長いTTL。
5. **M-2（Urgency 設定）** — バッテリーセーバーモードでの遅延防止。
6. **M-3（SMS 返金）** — 課金に関わるため、ビジネス上重要。

---

## まとめ

Webプッシュ通知機能の基盤は適切に構築されていますが、**通知タップ時の遷移先URL未設定（H-1）**と**購読の重複防止がない（H-2）**の2点は、本番運用前に必ず修正すべき重大な問題です。これらを修正すれば、呼び出しシステムとして十分に実用的な品質になります。

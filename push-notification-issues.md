# プッシュ通知 問題分析レポート

## 発見した問題一覧

### 🔴 CRITICAL-1: Service Worker の競合 — カスタムSWとVitePWA生成SWが共存

**問題**: 2つの Service Worker が競合している。
1. `client/public/sw.js` — 手動で作成したカスタムSW（プッシュ通知ハンドラを含む）
2. VitePWA プラグイン (`vite.config.ts`) — Workbox ベースのSWを自動生成

**影響**: VitePWA の `registerType: 'autoUpdate'` + `skipWaiting: true` + `clientsClaim: true` 設定により、ビルド時にWorkboxが生成するSWがカスタムSWを上書きする。本番ビルドでは **push イベントリスナーと notificationclick イベントリスナーが存在しないSWが有効になる**。

**根本原因**: VitePWA は独自のSWファイルを生成し、`/sw.js` を登録する。一方、`main.tsx` でも `/sw.js` を手動登録している。本番ビルドではVitePWAが生成したSWが優先され、カスタムのpush/notificationclickハンドラが失われる。

### 🔴 CRITICAL-2: VITE_VAPID_PUBLIC_KEY がビルド時に未定義

**問題**: `usePushNotification.ts` L101 で `import.meta.env.VITE_VAPID_PUBLIC_KEY` を参照しているが、この環境変数はビルド時に `.env` ファイルに存在しない。

**影響**: Viteはビルド時に `import.meta.env.*` を静的に置換する。VAPID鍵はDB保存＋サーバー起動時にprocess.envにセットする方式だが、**クライアントサイドのビルド時にはこの値が存在しない**ため、常に `undefined` になる。結果として新規購読が常に失敗する。

**根本原因**: VAPID公開鍵はサーバーサイドのDB/process.envにのみ存在し、Viteのビルド時環境変数として注入されていない。`VapidSettings.tsx` では `trpc.system.getVapidPublicKey.useQuery()` でAPIから取得しているが、`usePushNotification.ts` は `import.meta.env` から直接読んでいる。

### 🟡 HIGH-3: カスタムSW の CACHE_VERSION が毎回変わる

**問題**: `sw.js` L3 で `const CACHE_VERSION = Date.now().toString(36)` としている。

**影響**: SWファイルが読み込まれるたびに新しいキャッシュ名が生成され、activate時に全ての古いキャッシュが削除される。これ自体はプッシュ通知の直接的な原因ではないが、不要なキャッシュ再構築が頻繁に発生する。

### 🟡 HIGH-4: sendWaitTimeAlert の data に url フィールドがない

**問題**: `notifications.ts` L806 の wait alert 通知で `data.url` が設定されていない。

**影響**: 待ち時間アラートの通知をタップしても、チケット画面ではなくルート `/` に遷移する。

### 🟢 LOW-5: unsubscribe がサーバーサイドの購読を削除しない

**問題**: `usePushNotification.ts` L149-164 の `unsubscribe` 関数はブラウザのPushSubscriptionのみ解除し、サーバーのDBレコードを削除しない。

**影響**: ユーザーが通知を解除しても、サーバーは依然としてプッシュ送信を試み、410エラーで失敗→DBから削除という非効率なフローになる。

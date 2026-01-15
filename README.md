# Queue Call - 順番待ち呼び出しシステム

飲食店向けのPWA形式順番待ち・呼び出しSaaS。顧客がスマートフォンで受付し、リアルタイムで呼び出し状況を確認でき、スタッフが効率的に待ちリストを管理できるWebアプリケーションです。

## 主要機能

### 顧客向け
- **店舗トップ**: 現在の呼び出し番号と待ち組数を表示
- **受付**: 来店人数を入力してチケット発行
- **チケット**: 自分の番号、現在呼び出し中の番号、前の組数を表示
- **チェックイン**: 番号入力で到着報告（トークン無しでも復帰可能）
- **メニュー**: フィード/一覧表示の切替、多言語対応

### 店舗向け
- **キオスク**: 多言語対応のセルフ受付端末
- **呼び出しボード**: 現在・次の番号をリアルタイム表示
- **スタッフ管理**: 待ちリスト管理、呼び出し、スキップ、到着確認、完了処理

### 通知機能
- **Web Push**: ブラウザ通知で呼び出しをお知らせ
- **SMS通知**: Twilio連携でSMS送信（OTP認証、STOP対応）

### その他
- **多言語対応**: 日本語・英語・韓国語・中国語（簡体/繁体）
- **リアルタイム更新**: SSEによる即座の状態同期
- **PWA対応**: オフライン動作、ホーム画面追加

## 技術スタック

- **フロントエンド**: React 19 + Tailwind CSS 4 + Wouter
- **バックエンド**: Express 4 + tRPC 11
- **データベース**: MySQL (Drizzle ORM)
- **リアルタイム**: Server-Sent Events (SSE)
- **認証**: Manus OAuth + PIN認証
- **通知**: Web Push API + Twilio SMS
- **ストレージ**: S3互換ストレージ

## セットアップ

### 必須要件

- Node.js 22.x
- pnpm 10.x
- MySQL 8.x または互換データベース

### 環境変数

プロジェクトには以下の環境変数が必要です：

#### サーバー側（自動注入済み）
- `DATABASE_URL`: MySQL接続文字列
- `JWT_SECRET`: セッションCookie署名用シークレット
- `OAUTH_SERVER_URL`: Manus OAuth バックエンドURL
- `OWNER_OPEN_ID`, `OWNER_NAME`: オーナー情報
- `BUILT_IN_FORGE_API_URL`: Manus内蔵API URL
- `BUILT_IN_FORGE_API_KEY`: Manus内蔵API認証トークン

#### クライアント側（自動注入済み）
- `VITE_APP_ID`: Manus OAuth アプリケーションID
- `VITE_OAUTH_PORTAL_URL`: Manus ログインポータルURL
- `VITE_FRONTEND_FORGE_API_KEY`: フロントエンド用API認証トークン
- `VITE_FRONTEND_FORGE_API_URL`: フロントエンド用API URL

#### オプション（機能有効化に必要）
- `VAPID_PUBLIC_KEY`: Web Push VAPID 公開鍵
- `VAPID_PRIVATE_KEY`: Web Push VAPID 秘密鍵
- `VAPID_SUBJECT`: Web Push VAPID subject（例: `mailto:admin@example.com`）
- `VITE_VAPID_PUBLIC_KEY`: ブラウザ購読用VAPID公開鍵
- `TWILIO_ACCOUNT_SID`: Twilio アカウントSID（SMS通知用）
- `TWILIO_AUTH_TOKEN`: Twilio 認証トークン（SMS通知用）
- `TWILIO_VERIFY_SERVICE_SID`: Twilio Verify サービスSID（OTP用）
- `TWILIO_FROM_NUMBER`: SMS送信元電話番号
- `APP_BASE_URL`: SMS内リンク生成用のベースURL（例: `https://example.com`）
- `PUBLIC_BASE_URL`: `APP_BASE_URL` 未設定時の代替URL

VAPIDキーは `npx web-push generate-vapid-keys` で生成できます。

### インストール


```bash
# 依存関係のインストール
pnpm install

# データベースマイグレーション
pnpm db:push

# デモデータのシード
pnpm db:seed
```

### 開発サーバー起動

```bash
pnpm dev
```

サーバーは `http://localhost:3000` で起動します。

### デモ店舗へのアクセス

シード実行後、以下のURLでデモ店舗にアクセスできます：

- **店舗トップ**: http://localhost:3000/s/demo
- **スタッフ管理**: http://localhost:3000/s/demo/staff (PIN: 5678)
- **設定画面**: http://localhost:3000/admin/settings (Manager PIN: 1234)
- **キオスク**: http://localhost:3000/s/demo/kiosk?key=<表示されたキー>
- **呼び出しボード**: http://localhost:3000/s/demo/board?key=<表示されたキー>

## 開発ワークフロー

### データベース変更

1. `drizzle/schema.ts` でスキーマを編集
2. `pnpm db:push` でマイグレーション生成・適用
3. `server/db.ts` でクエリヘルパーを追加
4. `server/routers.ts` でtRPCプロシージャを追加

### フロントエンド開発

1. `client/src/pages/` に新しいページコンポーネントを作成
2. `client/src/App.tsx` でルーティングを追加
3. `trpc.*.useQuery` / `trpc.*.useMutation` でAPIを呼び出し
4. shadcn/ui コンポーネントを活用してUIを構築

### テスト

```bash
# 全テスト実行
pnpm test

# 型チェック
pnpm check
```

## プロジェクト構成

```
queue-call/
├── client/                 # フロントエンド
│   ├── public/            # 静的ファイル（manifest.json, sw.js）
│   └── src/
│       ├── pages/         # ページコンポーネント
│       │   ├── store/     # 顧客向けページ
│       │   └── admin/     # 管理画面
│       ├── components/    # 再利用可能なコンポーネント
│       ├── contexts/      # React Context
│       ├── hooks/         # カスタムフック
│       └── lib/           # ユーティリティ
├── server/                # バックエンド
│   ├── routers.ts         # tRPCルーター
│   ├── db.ts              # データベースヘルパー
│   ├── sse.ts             # SSE実装
│   ├── notifications.ts   # 通知処理
│   └── _core/             # フレームワーク層
├── drizzle/               # データベーススキーマ・マイグレーション
├── shared/                # 共有コード
│   └── i18n/              # 多言語翻訳
├── scripts/               # ユーティリティスクリプト
│   └── seed.mjs           # シードスクリプト
└── storage/               # S3ストレージヘルパー
```

## 主要な状態遷移

### チケットの状態

```
WAITING (待機中)
  ↓ スタッフが呼び出し
CALLED (呼び出し中)
  ↓ 顧客が到着報告 or 猶予時間経過
ARRIVED (到着済み) or SKIPPED (自動スキップ)
  ↓ スタッフが完了処理
DONE (完了)

その他の状態:
- CANCELED: 顧客がキャンセル
- EXPIRED: 日跨ぎで無効化
```

## セキュリティ

- **キオスク/ボード**: URLにkeyパラメータが必須（key無しは403）
- **スタッフ管理**: PIN認証必須
- **設定画面**: Manager PIN認証必須
- **レート制限**: チケット発券、SMS送信、PIN試行に制限あり

## ライセンス

MIT

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。

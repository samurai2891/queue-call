# 呼び出しボードUIリファクタリング計画書

## 1. 現状分析

### 現在の実装状況

**BoardDisplay.tsx（呼び出しボード画面）**
- 現在呼び出し中の番号を大きく表示
- 次の3件の番号を小さく表示
- リアルタイム更新（SSE/ポーリング）
- 音声通知機能（ミュート可能）

**到着確認の現在の実装**
- `ticket.checkin` エンドポイント: 番号のみで到着確認可能
- セキュリティ上の問題: 番号さえ知っていれば誰でも到着報告できる

**データ構造**
- `tickets` テーブル: PIN関連のカラムは現在存在しない
- `status`: WAITING → CALLED → ARRIVED の流れ
- `checkinDeadlineAt`: 呼び出し後の到着期限

---

## 2. 要件定義

### 機能要件

#### 要件1: 3桁PIN認証による到着確認
**目的**: 顧客が店舗に実際に到着したことを確認し、不正な到着報告を防止する

**仕様**:
- 店舗全体で共通の3桁PINを使用（同時呼び出し対応）
- PINは15分ごとに自動更新される
- PINは呼び出しボード画面に表示（顧客が店舗で確認可能）
- 顧客は整理券画面でPINを入力して到着報告
- PIN入力が正しい場合のみ、ステータスがARRIVEDに変更

**同時呼び出し対応**:
- 複数の整理券が同時にCALLED状態になっても、同じPINで到着確認可能
- PINは店舗単位で管理され、15分ごとに自動更新
- 呼び出し中の全ての整理券が同じPINを共有

**セキュリティ考慮**:
- PINは15分ごとに自動再生成
- PIN入力の試行回数制限（5回まで）
- PIN有効期限は整理券の `checkinDeadlineAt` まで

#### 要件2: 待機列の番号表示
**目的**: 待機中の顧客に自分の順番を視覚的に伝える

**仕様**:
- 現在呼び出し中の番号を最上部に大きく表示（現状維持）
- 待機列の番号を10件表示（次の10組）
- 自分の番号が近づいていることを視覚的に確認可能
- グリッド形式で見やすく配置

---

## 3. UI設計

### 3.1 呼び出しボード画面のレイアウト

```
┌─────────────────────────────────────────────┐
│  Header: 店舗名                    [🔊/🔇]  │
├─────────────────────────────────────────────┤
│                                             │
│          🔊 現在お呼び出し中                │
│                                             │
│              [  42  ]                       │
│         (超特大フォント)                     │
│                                             │
│           PIN: 537                          │
│        (大きめフォント)                      │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│           待機中の番号                       │
│                                             │
│     43    44    45    46    47              │
│     48    49    50    51    52              │
│                                             │
│  ※ PINは15分ごとに更新されます              │
│   (中サイズフォント、グリッド表示10件)        │
│                                             │
└─────────────────────────────────────────────┘
```

### 3.2 整理券画面（顧客側）のPIN入力UI

**呼び出し前（WAITING状態）**
- 現状維持（待ち組数、予想待ち時間など）

**呼び出し中（CALLED状態）**
```
┌─────────────────────────────────────────────┐
│  🔔 お客様の番です！                         │
│                                             │
│  店舗のボードに表示されているPINを           │
│  入力して到着を報告してください              │
│                                             │
│  PIN入力:  [_] [_] [_]                      │
│           (3桁の入力欄)                      │
│                                             │
│  [到着を報告する]                            │
│                                             │
│  ※ 14:35 までにお越しください               │
└─────────────────────────────────────────────┘
```

### 3.3 デザイン詳細

**色とタイポグラフィ**
- 現在呼び出し中の番号: `text-9xl` (144px)、`text-primary`、アニメーションパルス
- PIN: `text-6xl` (60px)、`text-foreground`、太字
- 待機中の番号: `text-4xl` (36px)、`text-muted-foreground`、グリッド配置
- PIN入力欄: 大きめの入力欄、数字のみ入力可能

**レスポンシブ対応**
- タブレット・大画面向けの表示最適化
- 待機列の表示件数は画面サイズに応じて調整

---

## 4. データモデル設計

### 4.1 データベーススキーマ変更

**stores テーブルに追加するカラム**:
```typescript
{
  // 店舗全体で共有するPIN（15分ごとに更新）
  currentCheckinPin: varchar("currentCheckinPin", { length: 3 }),
  checkinPinUpdatedAt: timestamp("checkinPinUpdatedAt"),
}
```

**tickets テーブルに追加するカラム**:
```typescript
{
  // PIN入力試行回数（整理券ごと）
  checkinPinAttempts: int("checkinPinAttempts").default(0),
}
```

**説明**:
- `stores.currentCheckinPin`: 店舗全体で共有する現在の3桁PIN
- `stores.checkinPinUpdatedAt`: PIN最終更新日時（15分ごとに更新）
- `tickets.checkinPinAttempts`: 整理券ごとのPIN入力試行回数（5回まで）

### 4.2 API設計

#### 新規エンドポイント

**1. `ticket.checkinWithPin`**
```typescript
input: {
  ticketToken: string;
  pin: string; // 3桁のPIN
}
output: {
  success: boolean;
  message?: string;
  attemptsRemaining?: number;
}
```

**処理フロー**:
1. ticketTokenでチケットを取得
2. ステータスがCALLEDであることを確認
3. checkinDeadlineAtが有効期限内であることを確認
4. checkinPinAttemptsが5回未満であることを確認
5. 入力されたPINとcheckinPinを照合
6. 正しい場合: ステータスをARRIVEDに更新、arrivedAtを記録
7. 間違っている場合: checkinPinAttemptsをインクリメント、エラーメッセージ返却

#### 既存エンドポイントの変更

**`queue.callNext`（呼び出し実行）**
- 呼び出し時に3桁のランダムPINを生成
- `checkinPin`、`checkinPinGeneratedAt` を設定
- `checkinPinAttempts` を0にリセット

**`store.getQueueStatus`（ボード表示用）**
- 現在の呼び出し番号とPINを返却
- 待機中の番号リスト（次の10件）を返却
- PIN更新チェック: 15分経過していれば自動更新

```typescript
output: {
  currentNumber: number;
  currentPin: string | null; // 店舗の現在のPIN
  waitingNumbers: number[]; // 待機中の番号リスト（10件）
  waitingCount: number;
  pinExpiresAt: Date | null; // PIN有効期限（15分後）
}
```

---

## 5. 実装計画

### Phase 1: データベーススキーマ変更
- [x] `drizzle/schema.ts` の `stores` テーブルにPIN関連カラムを追加
- [x] `drizzle/schema.ts` の `tickets` テーブルに試行回数カラムを追加
- [x] `pnpm db:push` でマイグレーション実行

### Phase 2: バックエンドAPI実装
- [x] `server/db.ts` にPIN生成・更新ヘルパー関数を追加
  - `generateCheckinPin()`: 3桁ランダムPIN生成
  - `getOrUpdateStorePin(storeId)`: 15分経過チェック＆更新
- [x] `server/routers.ts` の `store.getQueueStatus` を修正
  - PIN自動更新チェック（15分経過時）
  - 待機番号リスト10件返却
  - PIN有効期限返却
- [x] `server/routers.ts` に `ticket.checkinWithPin` エンドポイントを追加
  - 店舗の現在のPINと照合
  - 試行回数制限チェック
  - 到着確認処理

### Phase 3: フロントエンドUI実装
- [ ] `BoardDisplay.tsx` のリファクタリング
  - PINの表示追加（大きく目立つように）
  - PIN更新カウントダウン表示（15分タイマー）
  - 待機列番号のグリッド表示追加（10件）
  - レイアウト調整
- [ ] `Ticket.tsx` のPIN入力UI追加
  - CALLED状態でPIN入力フォーム表示（3桁入力欄）
  - `ticket.checkinWithPin` の呼び出し
  - エラーハンドリング（試行回数制限、PIN不一致）
  - 残り試行回数の表示

### Phase 4: 多言語対応
- [ ] `shared/i18n/translations.ts` に翻訳キーを追加
  - `board.pin`: "PIN"
  - `board.pinUpdatesEvery15Min`: "PINは15分ごとに更新されます"
  - `board.waitingNumbers`: "待機中の番号"
  - `ticket.enterPin`: "PINを入力してください"
  - `ticket.pinRequired`: "店舗のボードに表示されているPINを入力して到着を報告してください"
  - `ticket.pinInvalid`: "PINが正しくありません"
  - `ticket.pinAttemptsRemaining`: "残り{count}回入力できます"
  - `ticket.pinAttemptsExceeded`: "試行回数の上限に達しました。スタッフにお声がけください"

### Phase 5: テスト
- [ ] vitest でPIN生成・検証ロジックのテスト
- [ ] ブラウザでの動作確認
  - 呼び出しボードでのPIN表示
  - 整理券画面でのPIN入力
  - エラーケース（間違ったPIN、試行回数超過）

### Phase 6: チェックポイント保存
- [ ] todo.md の更新
- [ ] チェックポイント保存

---

## 6. セキュリティ考慮事項

### PIN生成と更新
- `Math.random()` ではなく、より安全な乱数生成を使用
- 3桁（000〜999）のランダムな数値
- 15分ごとに自動更新（バックエンドで管理）
- 店舗全体で共有（同時呼び出し対応）

### 試行回数制限
- 整理券ごとに5回まで入力可能
- 5回失敗後はスタッフによる手動確認が必要
- 試行回数は整理券単位でカウント

### 有効期限
- 整理券の `checkinDeadlineAt` まで到着確認可能
- 期限切れ後は自動的にSKIPPED状態に移行（既存ロジック）
- PINは15分ごとに更新されるが、古いPINでも猶予時間内は有効

---

## 7. 今後の拡張案

### オプション機能（今回は実装しない）
1. **QRコードによる到着確認**: PINの代わりにQRコードをスキャン
2. **位置情報による自動到着確認**: 店舗近くにいることをGPSで確認
3. **顔認証**: カメラで顧客の顔を認証（プライバシー配慮が必要）

---

## 8. まとめ

本リファクタリングにより、以下の改善が実現されます：

1. **セキュリティ向上**: 3桁PIN認証により、不正な到着報告を防止
2. **同時呼び出し対応**: 15分更新の共有PINにより、複数組の同時呼び出しが可能
3. **UX改善**: 待機列の番号表示（10件）により、顧客が自分の順番を把握しやすくなる
4. **運用効率化**: スタッフが到着確認を手動で行う必要がなくなる

実装は段階的に進め、各フェーズで動作確認を行います。

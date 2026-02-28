# コスト構造調査メモ

## Manusホスティング料金
- 無料月間枠: Cloud $10, AI $1, API $1
- Marketing site + lead capture (10k-50k visits/mo): Cloud ~$25, AI ~$10 → 追加 ~$24/月
- E-commerce (100k-300k visits/mo): Cloud ~$150, AI ~$80, API ~$30 → 追加 ~$248/月
- 小規模SaaS（1k-5k visits/mo）: 無料枠内で収まる可能性あり

## Twilio SMS料金（日本向け）
- International Numbers: $0.084/通（約13円/通 @155円/USD）
- Domestic Numbers: $0.12/通（約18.6円/通）
- 電話番号リース: $1.15/月〜
- Engagement Suite: $0.015/通（最初の1,000通/月は無料）
- 失敗メッセージ処理費: $0.001/通

## Web Push通知
- 自前実装（web-push npm）: 完全無料
- VAPID鍵ベースで追加コストなし
- 帯域コストのみ（Manusホスティング内に含まれる）

## 変動コスト計算例（月間1,000呼び出し）
- SMS 1,000通: $84 = 約13,020円
- SMS 500通（Push併用）: $42 = 約6,510円
- Push通知のみ: $0
- ホスティング: 無料枠〜$24/月

## 変動コスト計算例（月間100呼び出し）
- SMS 100通: $8.4 = 約1,302円
- Push通知のみ: $0
- ホスティング: 無料枠内

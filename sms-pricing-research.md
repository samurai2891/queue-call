# SMS料金調査結果

## 1. 日本の順番待ちシステムのSMS/呼び出し料金

### myJunban（マイジュンバン）
- 月額: 5,980円〜9,980円（税別）
- 電話呼び出し: 月100回まで無料、101回目以降 **20円/コール（税別）**
- SMS呼び出し: 記載なし（電話・LINE・メールが中心）
- 追加電話料金は**事前ポイントチャージ制**（プリペイド）
- 出典: https://myjunban.com/pricing

### Airウェイト（リクルート）
- 月額: 0円（ベーシック）/ 11,000円（スタンダード）
- SMS呼び出し: 有料プラン限定、**1通あたりの具体的な単価は非公開**
- ベーシック（無料）プランではSMS不可
- 出典: https://airregi.jp/wait/cost/

### EPARK
- 料金: 非公開（要問い合わせ）
- SMS通知: 詳細な単価は非公開
- 出典: https://www.epg.co.jp/service/price-epark/

### matoca（マトカ）
- 初期費用: 15,000円〜
- 月額: 10,000円〜
- LINE通知が中心、SMS単価は非公開
- 出典: https://junbanmachi.jp/

### Waitwhile（海外・参考）
- 月額: $31〜/月（Starter）、$196/月（Business）
- SMS: Twilio経由の従量課金
  - 日本向け送信: **$0.08131/セグメント（約12.2円）**
  - 韓国向け: $0.04782/セグメント
  - 米国向け: $0.01377/セグメント
- メッセージクレジット制（$0.02/クレジット、別途購入）
- 出典: https://help.waitwhile.com/en/articles/9566821-how-much-do-sms-cost

## 2. 一般的なSMS送信サービス（日本国内）

### 料金相場
- 1通あたり **6円〜15円** が相場
- 安価なもの: 6円〜（SMSLINK、Cuenote SMS）
- 中価格帯: 8〜11円（CM.com: 8.68円、KDDI Message Cast: 9.35円税込）
- 高価格帯: 要問い合わせ（メディアSMS、空電プッシュ等）
- 出典: https://www.aspicjapan.org/asu/article/2060

### 主要サービス単価
| サービス | 1通あたり | 初期費用 | 月額基本料 |
|---------|----------|---------|-----------|
| SMSLINK | 6円〜 | 0円 | 0円 |
| Cuenote SMS | 6円〜 | 0円 | 0円 |
| CM.com | 8.68円〜 | 0円 | 5,000〜10,000円 |
| KDDI Message Cast | 9.35円（税込）〜 | 要問合せ | 要問合せ |
| メディアSMS | 要問合せ | 要問合せ | 要問合せ |
| 空電プッシュ | 要問合せ | 要問合せ | 要問合せ |

## 3. Queue Callの実コスト（Twilio経由）

### Twilio日本向けSMS送信コスト
- 送信: 約$0.0855/セグメント ≒ **約13円/通**
- 受信: 約$0.0088/セグメント ≒ 約1.3円/通
- 電話番号維持費: 約$1.15/月（約170円/月）
- ※為替レート: 1USD = 150円で計算

### 現在のQueue Call設定
- SMS残高チャージ: 20円/通
- Twilio実費: 約13円/通
- Stripe手数料(3.6%): 約0.72円/通
- **純利益: 約6.28円/通（利益率31.4%）**

## 4. 海外の順番待ちシステムの料金比較（ScanQueue記事より）

### ScanQueue
- Free: $0, Growth: $99/月, Pro: $249/月
- SMS: Growth以上に含まれる（追加料金なし）
- 出典: https://scanqueue.com/blog/queue-management-pricing-comparison

### Waitwhile
- Free: $0 (100 visits/月), Plus: $29/月, Pro: $59/月, Business: $299/月
- SMS: プランにより異なる。従量課金あり。日本向け$0.08131/セグメント
- 出典: https://waitwhile.com/pricing/

### Qminder
- Starter: $229/月, Business: $379/月, Enterprise: カスタム
- SMS: 別途課金。iPadハードウェア必須（$400〜$600）
- 出典: https://www.qminder.com/pricing/

### NextMe
- Free: $0 (100 SMS/月), Starter: $49.99/月 (3,000 SMS/月), Business: $79.99/月 (5,000 SMS/月)
- SMS: 各プランに含まれる。超過分は$0.02/SMS
- 無料プランでも月100通SMS付き
- 出典: https://nextmeapp.com/pricing/

### Qmatic
- Cloud: ~$300+/月, Enterprise: $500+/月
- SMS: 別途課金。ハードウェア費用$1,000〜$10,000+
- 出典: https://scanqueue.com/blog/queue-management-pricing-comparison

### 海外サービスの比較表（ScanQueue記事より）
| Feature | ScanQueue | Waitwhile | Qminder | NextMe | Qmatic |
|---------|-----------|-----------|---------|--------|--------|
| Free tier | Yes | Yes(limited) | No | Yes | No |
| Entry paid plan | $99 | $29 | $229 | $55 | ~$300+ |
| SMS included | Yes(Growth+) | Varies | Extra | Extra | Extra |
| Hardware required | No | No | iPad | No | Yes |
| Contract | Month-to-month | Month-to-month | Annual | Month-to-month | Annual |

---

### 25円/通に値上げした場合
- SMS残高チャージ: 25円/通
- Twilio実費: 約13円/通
- Stripe手数料(3.6%): 約0.9円/通
- **純利益: 約11.1円/通（利益率44.4%）**

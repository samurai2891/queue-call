import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";

export default function Privacy() {
  return (
    <AnimatedPage>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container py-4 flex items-center gap-3">
            <Link href="/">
              <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
                トップに戻る
              </button>
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="container py-8 max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">プライバシーポリシー</h1>
          <p className="text-sm text-muted-foreground mb-8">最終更新日: 2026年2月28日</p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">1. はじめに</h2>
              <p className="text-muted-foreground leading-relaxed">
                合同会社Asobe（以下「当社」）は、Queue Call（以下「本サービス」）の提供にあたり、
                お客様の個人情報の保護を重要な責務と認識し、以下のとおりプライバシーポリシーを定めます。
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">2. 収集する情報</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                本サービスでは、以下の情報を収集する場合があります。
              </p>
              
              <h3 className="text-lg font-medium mb-2">2.1 店舗オーナー・スタッフの情報</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
                <li>アカウント登録時の氏名、メールアドレス</li>
                <li>店舗名、所在地、連絡先等の店舗情報</li>
                <li>ログイン認証に関する情報</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">2.2 来店客の情報</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
                <li>順番待ち受付時の人数、備考等の入力情報</li>
                <li>SMS通知を利用する場合の電話番号</li>
                <li>Web Push通知を利用する場合のブラウザ購読情報</li>
                <li>予約時の氏名、電話番号、メールアドレス</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">2.3 自動的に収集される情報</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>IPアドレス、ブラウザの種類、アクセス日時</li>
                <li>Cookie及びセッション情報</li>
                <li>サービスの利用状況に関するログデータ</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">3. 情報の利用目的</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                収集した情報は、以下の目的で利用します。
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>順番待ち管理サービスの提供・運営</li>
                <li>SMS・Web Push等による通知の送信</li>
                <li>ユーザー認証およびセキュリティの確保</li>
                <li>サービスの改善・新機能の開発</li>
                <li>お問い合わせへの対応</li>
                <li>利用規約に違反する行為への対応</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">4. 情報の第三者提供</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                当社は、以下の場合を除き、お客様の個人情報を第三者に提供しません。
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>お客様の同意がある場合</li>
                <li>法令に基づく場合</li>
                <li>人の生命、身体または財産の保護のために必要な場合</li>
                <li>サービス提供に必要な業務委託先（以下に記載）への提供</li>
              </ul>

              <h3 className="text-lg font-medium mt-4 mb-2">4.1 外部サービスの利用</h3>
              <p className="text-muted-foreground leading-relaxed mb-2">
                本サービスでは、以下の外部サービスを利用しています。各サービスのプライバシーポリシーについては、
                それぞれのリンク先をご確認ください。
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Twilio（SMS通知の送信）</li>
                <li>Stripe（決済処理）</li>
                <li>Amazon Web Services（データの保管・処理）</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">5. データの保管と削除</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                当社は、お客様の情報を以下の方針に基づき管理します。
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>順番待ちチケットデータ：完了・キャンセル後90日で自動削除されます</li>
                <li>SMS送信履歴：送信後6ヶ月で自動削除されます</li>
                <li>アカウント情報：アカウント削除のご依頼をいただいた場合、速やかに削除いたします</li>
                <li>すべてのデータは暗号化された通信（SSL/TLS）を通じて送受信されます</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">6. Cookieの使用</h2>
              <p className="text-muted-foreground leading-relaxed">
                本サービスでは、ユーザー認証およびセッション管理のためにCookieを使用しています。
                Cookieはブラウザの設定により無効にすることができますが、その場合、本サービスの一部機能が
                利用できなくなる場合があります。また、サービス改善のためのアクセス解析にCookieを使用する
                場合があります。
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">7. お客様の権利</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                お客様は、ご自身の個人情報について以下の権利を有します。
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>個人情報の開示、訂正、削除の請求</li>
                <li>個人情報の利用停止の請求</li>
                <li>SMS通知のオプトアウト（配信停止）</li>
                <li>Web Push通知の解除</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                上記のご請求は、下記のお問い合わせ先までご連絡ください。
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">8. 安全管理措置</h2>
              <p className="text-muted-foreground leading-relaxed">
                当社は、個人情報の漏洩、滅失、毀損を防止するため、適切な安全管理措置を講じます。
                これには、SSL/TLSによる通信の暗号化、アクセス制御、定期的なセキュリティ監査が含まれます。
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">9. プライバシーポリシーの変更</h2>
              <p className="text-muted-foreground leading-relaxed">
                当社は、必要に応じて本プライバシーポリシーを変更することがあります。
                重要な変更がある場合は、本サービス上で通知いたします。
                変更後のプライバシーポリシーは、本ページに掲載した時点で効力を生じます。
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">10. お問い合わせ</h2>
              <p className="text-muted-foreground leading-relaxed">
                本プライバシーポリシーに関するお問い合わせは、下記までご連絡ください。
              </p>
              <div className="mt-4 p-4 rounded-lg bg-muted/50 border">
                <p className="font-medium">合同会社Asobe</p>
                <p className="text-muted-foreground text-sm mt-1">
                  〒651-0086 兵庫県神戸市中央区磯辺通1丁目1-18 カサベラ国際プラザビル 707号室
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  メール: <a href="mailto:contact@asobe-create.com" className="text-primary hover:underline">contact@asobe-create.com</a>
                </p>
              </div>
            </section>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t bg-muted/30 mt-12">
          <div className="container py-6 text-center text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-4 mb-2">
              <Link href="/terms" className="hover:text-foreground transition-colors">利用規約</Link>
              <span>|</span>
              <span className="font-medium">プライバシーポリシー</span>
            </div>
            <p>&copy; {new Date().getFullYear()} 合同会社Asobe. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </AnimatedPage>
  );
}

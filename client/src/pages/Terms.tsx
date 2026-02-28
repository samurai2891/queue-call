import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";

export default function Terms() {
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
          <h1 className="text-3xl font-bold mb-2">利用規約</h1>
          <p className="text-sm text-muted-foreground mb-8">最終更新日: 2026年2月28日</p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第1条（適用）</h2>
              <p className="text-muted-foreground leading-relaxed">
                本規約は、合同会社Asobe（以下「当社」）が提供するQueue Call（以下「本サービス」）の利用に関する
                条件を定めるものです。本サービスを利用するすべてのユーザー（以下「利用者」）は、
                本規約に同意したものとみなされます。
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第2条（定義）</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                本規約において、以下の用語は次の意味で使用します。
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>「店舗オーナー」：本サービスにアカウント登録し、店舗を管理する利用者</li>
                <li>「スタッフ」：店舗オーナーから権限を付与され、店舗の運営を行う利用者</li>
                <li>「来店客」：順番待ちの受付や予約を行う利用者</li>
                <li>「チケット」：順番待ちの受付番号および関連情報</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第3条（サービス内容）</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                本サービスは、飲食店等の店舗における順番待ち管理を支援するサービスであり、
                以下の機能を提供します。
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>順番待ちチケットの発行・管理</li>
                <li>リアルタイムの待ち状況表示</li>
                <li>SMS・Web Pushによる呼び出し通知</li>
                <li>キオスク端末・呼び出しボードの表示</li>
                <li>予約管理機能</li>
                <li>メニュー表示機能</li>
                <li>店舗ブランディングのカスタマイズ</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第4条（アカウント登録）</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>店舗オーナーは、当社所定の方法によりアカウント登録を行うものとします。</li>
                <li>登録情報は正確かつ最新の情報を提供するものとし、変更があった場合は速やかに更新するものとします。</li>
                <li>アカウントの管理責任は利用者にあり、第三者への譲渡・貸与はできません。</li>
                <li>アカウント情報の不正利用により生じた損害について、当社は一切の責任を負いません。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第5条（利用料金）</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>本サービスの基本機能は無料でご利用いただけます。</li>
                <li>SMS通知機能はプリペイド方式の有料サービスです。料金は別途定める料金表に従います。</li>
                <li>有料サービスの決済はStripeを通じて行われます。</li>
                <li>一度購入されたSMSクレジットの返金は、法令に定める場合を除き、原則として行いません。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第6条（禁止事項）</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                利用者は、本サービスの利用にあたり、以下の行為を行ってはなりません。
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>法令または公序良俗に違反する行為</li>
                <li>当社または第三者の知的財産権、プライバシー権、名誉等を侵害する行為</li>
                <li>本サービスのサーバーやネットワークに過度な負荷をかける行為</li>
                <li>本サービスの運営を妨害する行為</li>
                <li>不正アクセスまたはその試み</li>
                <li>他の利用者のアカウントを不正に使用する行為</li>
                <li>虚偽の情報を登録する行為</li>
                <li>SMS通知機能を迷惑メッセージの送信に利用する行為</li>
                <li>本サービスを本来の目的以外に使用する行為</li>
                <li>その他、当社が不適切と判断する行為</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第7条（サービスの停止・変更）</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>当社は、以下の場合に本サービスの全部または一部を停止することができます。
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                    <li>システムの保守・点検を行う場合</li>
                    <li>天災、停電等の不可抗力により提供が困難な場合</li>
                    <li>その他、当社が必要と判断した場合</li>
                  </ul>
                </li>
                <li>当社は、本サービスの内容を予告なく変更・追加・廃止することがあります。</li>
                <li>サービスの停止・変更により利用者に生じた損害について、当社は一切の責任を負いません。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第8条（データの取り扱い）</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>利用者が本サービスに登録したデータの所有権は、利用者に帰属します。</li>
                <li>当社は、サービス提供に必要な範囲でデータを利用します。</li>
                <li>完了・キャンセル済みのチケットデータは、作成から90日後に自動的に削除されます。</li>
                <li>アカウント削除時、関連するすべてのデータは速やかに削除されます。</li>
                <li>個人情報の取り扱いについては、別途定めるプライバシーポリシーに従います。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第9条（知的財産権）</h2>
              <p className="text-muted-foreground leading-relaxed">
                本サービスに関する著作権、商標権その他の知的財産権は、当社または正当な権利者に帰属します。
                利用者は、本サービスの利用により、これらの権利を取得するものではありません。
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第10条（免責事項）</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>当社は、本サービスの完全性、正確性、有用性等について保証しません。</li>
                <li>本サービスの利用により利用者に生じた損害について、当社の故意または重過失による場合を除き、
                  当社は一切の責任を負いません。</li>
                <li>当社が責任を負う場合であっても、その賠償額は利用者が過去12ヶ月間に当社に支払った
                  利用料金の総額を上限とします。</li>
                <li>通信環境やデバイスの問題に起因するサービスの不具合について、当社は責任を負いません。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第11条（利用者の責任）</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>店舗オーナーは、本サービスを利用して収集した来店客の個人情報を適切に管理する責任を負います。</li>
                <li>店舗オーナーは、SMS通知機能の利用にあたり、関連する法令（特定電子メール法等）を遵守するものとします。</li>
                <li>利用者間のトラブルについて、当社は一切の責任を負いません。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第12条（アカウントの停止・削除）</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>当社は、利用者が本規約に違反した場合、事前の通知なくアカウントを停止または削除できます。</li>
                <li>利用者は、いつでもアカウントの削除を当社に申請できます。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第13条（規約の変更）</h2>
              <p className="text-muted-foreground leading-relaxed">
                当社は、必要に応じて本規約を変更することがあります。
                変更後の規約は、本サービス上に掲載した時点で効力を生じます。
                重要な変更がある場合は、事前に本サービス上で通知いたします。
                変更後も本サービスの利用を継続した場合、変更後の規約に同意したものとみなされます。
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第14条（準拠法・管轄裁判所）</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>本規約は、日本法に準拠し、日本法に従って解釈されるものとします。</li>
                <li>本規約に関する紛争については、神戸地方裁判所を第一審の専属的合意管轄裁判所とします。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 border-b pb-2">第15条（お問い合わせ）</h2>
              <p className="text-muted-foreground leading-relaxed">
                本規約に関するお問い合わせは、下記までご連絡ください。
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
              <span className="font-medium">利用規約</span>
              <span>|</span>
              <Link href="/privacy" className="hover:text-foreground transition-colors">プライバシーポリシー</Link>
            </div>
            <p>&copy; {new Date().getFullYear()} 合同会社Asobe. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </AnimatedPage>
  );
}

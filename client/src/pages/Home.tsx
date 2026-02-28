import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Users, 
  Bell, 
  Monitor, 
  Settings, 
  QrCode, 
  Globe, 
  Smartphone,
  ArrowRight,
  Store,
  Loader2,
  BarChart3,
  Check,
  X,
  MessageSquare,
  Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [storeSlug, setStoreSlug] = useState("");

  const { data: myStores, isLoading: storesLoading } = trpc.store.getMyStores.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const handleStoreAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (storeSlug.trim()) {
      navigate(`/s/${storeSlug.trim().toLowerCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">Queue Call</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isAuthenticated ? (
              <>
                <Button variant="outline" className="active:scale-[0.97] transition-transform" onClick={() => navigate('/admin/dashboard')}>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  ダッシュボード
                </Button>
                <Button variant="outline" className="active:scale-[0.97] transition-transform" onClick={() => navigate('/admin/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  店舗設定
                </Button>
                <span className="text-sm text-muted-foreground">{user?.name}</span>
              </>
            ) : (
              <Button className="active:scale-[0.97] transition-transform" onClick={() => window.location.href = getLoginUrl()}>
                ログイン
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <AnimatedPage variant="fade-up" delay={50}>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              順番待ちを
              <span className="text-primary">スマート</span>に
            </h1>
          </AnimatedPage>
          <AnimatedPage variant="fade-up" delay={150}>
            <p className="text-lg text-muted-foreground">
              飲食店向けの順番待ち・呼び出しシステム。
              お客様はスマホで受付、リアルタイムで状況確認。
              スタッフは効率的に待ちリストを管理できます。
            </p>
          </AnimatedPage>
          
          {/* Store Access Form */}
          <AnimatedCard delay={250} hoverEffect={false} className="max-w-md mx-auto mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">店舗にアクセス</CardTitle>
                <CardDescription>店舗IDを入力して順番待ちページへ</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleStoreAccess} className="flex gap-2">
                  <Input
                    placeholder="店舗ID（例: demo-store）"
                    value={storeSlug}
                    onChange={(e) => setStoreSlug(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" className="active:scale-[0.97] transition-transform" disabled={!storeSlug.trim()}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </AnimatedCard>
        </div>
      </section>

      {/* My Stores Section (if logged in) */}
      {isAuthenticated && (
        <section className="container py-8">
          <AnimatedPage variant="fade-up" delay={100}>
            <h2 className="text-2xl font-bold mb-6">あなたの店舗</h2>
          </AnimatedPage>
          {storesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !myStores || myStores.length === 0 ? (
            <AnimatedCard delay={200} hoverEffect={false}>
              <Card className="bg-muted/30">
                <CardContent className="py-8 text-center">
                  <Store className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground mb-4">まだ店舗がありません</p>
                  <Button className="active:scale-[0.97] transition-transform" onClick={() => navigate('/admin/settings')}>
                    店舗を作成する
                  </Button>
                </CardContent>
              </Card>
            </AnimatedCard>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myStores.map((store, i) => (
                <AnimatedCard key={store.id} delay={150 + i * 80}>
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Store className="h-5 w-5" />
                        {store.name}
                      </CardTitle>
                      <CardDescription>/s/{store.slug}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" className="active:scale-[0.97] transition-transform" onClick={() => navigate(`/s/${store.slug}`)}>
                          店舗トップ
                        </Button>
                        <Button size="sm" variant="outline" className="active:scale-[0.97] transition-transform" onClick={() => navigate(`/s/${store.slug}/staff`)}>
                          スタッフ
                        </Button>
                        {store.kioskKey && (
                          <Button size="sm" variant="outline" className="active:scale-[0.97] transition-transform" onClick={() => navigate(`/s/${store.slug}/kiosk?key=${store.kioskKey}`)}>
                            キオスク
                          </Button>
                        )}
                        {store.boardKey && (
                          <Button size="sm" variant="outline" className="active:scale-[0.97] transition-transform" onClick={() => navigate(`/s/${store.slug}/board?key=${store.boardKey}`)}>
                            ボード
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </AnimatedCard>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Features Section */}
      <section className="container py-16">
        <AnimatedPage variant="fade-up" delay={100}>
          <h2 className="text-2xl font-bold text-center mb-12">主な機能</h2>
        </AnimatedPage>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Smartphone className="h-8 w-8" />}
            title="スマホで簡単受付"
            description="QRコードをスキャンするだけで順番待ちに登録。来店人数やメモも入力可能です。"
            delay={200}
          />
          <FeatureCard
            icon={<Bell className="h-8 w-8" />}
            title="リアルタイム通知"
            description="Web Push通知やSMSで呼び出しをお知らせ。待ち時間を有効活用できます。"
            delay={280}
          />
          <FeatureCard
            icon={<Monitor className="h-8 w-8" />}
            title="店頭ディスプレイ"
            description="キオスクモードでセルフ受付、呼び出しボードで現在の番号を大画面表示。"
            delay={360}
          />
          <FeatureCard
            icon={<QrCode className="h-8 w-8" />}
            title="QRコード対応"
            description="テーブルや入口にQRコードを設置。お客様は簡単にアクセスできます。"
            delay={440}
          />
          <FeatureCard
            icon={<Globe className="h-8 w-8" />}
            title="多言語対応"
            description="日本語、英語、韓国語、中国語（簡体/繁体）に対応。インバウンド対応も万全。"
            delay={520}
          />
          <FeatureCard
            icon={<Settings className="h-8 w-8" />}
            title="柔軟な設定"
            description="通知設定、自動スキップ、順番調整など、店舗に合わせてカスタマイズ可能。"
            delay={600}
          />
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container py-16 md:py-24" id="pricing">
        <AnimatedPage variant="fade-up" delay={100}>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">シンプルな料金プラン</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              店舗の規模に合わせて選べる3つのプラン。
              すべてのプランでWeb Push通知が無料で使えます。
            </p>
          </div>
        </AnimatedPage>

        {/* Plan Cards */}
        <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {/* Free Plan */}
          <AnimatedCard delay={200}>
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Free</CardTitle>
                <CardDescription>まずは試してみたい方に</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">¥0</span>
                  <span className="text-muted-foreground ml-1">/月</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  <PlanFeature included>月間50人まで</PlanFeature>
                  <PlanFeature included>Web Push通知</PlanFeature>
                  <PlanFeature included>多言語対応（5言語）</PlanFeature>
                  <PlanFeature included>スタッフ1名</PlanFeature>
                  <PlanFeature included>基本分析（当日のみ）</PlanFeature>
                  <PlanFeature>SMS通知</PlanFeature>
                  <PlanFeature>予約機能</PlanFeature>
                  <PlanFeature>営業時間制御</PlanFeature>
                  <PlanFeature>ブランディング</PlanFeature>
                </ul>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="w-full mt-6 active:scale-[0.97] transition-transform"
                  onClick={() => window.location.href = getLoginUrl()}
                >
                  無料で始める
                </Button>
              </CardContent>
            </Card>
          </AnimatedCard>

          {/* Standard Plan */}
          <AnimatedCard delay={300}>
            <Card className="h-full flex flex-col border-primary border-2 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-3 py-1 text-sm">
                  おすすめ
                </Badge>
              </div>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Standard</CardTitle>
                <CardDescription>本格的に運用したい店舗に</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">¥1,500</span>
                  <span className="text-muted-foreground ml-1">/月</span>
                  <p className="text-sm text-muted-foreground mt-1">税込 ¥1,650</p>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  <PlanFeature included highlight>並べる人数 無制限</PlanFeature>
                  <PlanFeature included>Web Push通知</PlanFeature>
                  <PlanFeature included>SMS通知（残高別途）</PlanFeature>
                  <PlanFeature included>予約機能</PlanFeature>
                  <PlanFeature included>多言語対応（5言語）</PlanFeature>
                  <PlanFeature included>スタッフ3名</PlanFeature>
                  <PlanFeature included>分析ダッシュボード（30日間）</PlanFeature>
                  <PlanFeature included>営業時間制御</PlanFeature>
                  <PlanFeature included>カスタムカラー</PlanFeature>
                  <PlanFeature included>メールサポート</PlanFeature>
                </ul>
                <Button 
                  size="lg" 
                  className="w-full mt-6 active:scale-[0.97] transition-transform"
                  onClick={() => window.location.href = getLoginUrl()}
                >
                  申し込む
                </Button>
              </CardContent>
            </Card>
          </AnimatedCard>

          {/* Pro Plan */}
          <AnimatedCard delay={400}>
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Pro</CardTitle>
                <CardDescription>大規模店舗・チェーン向け</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">¥3,500</span>
                  <span className="text-muted-foreground ml-1">/月</span>
                  <p className="text-sm text-muted-foreground mt-1">税込 ¥3,850</p>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  <PlanFeature included highlight>並べる人数 無制限</PlanFeature>
                  <PlanFeature included>Web Push通知</PlanFeature>
                  <PlanFeature included>SMS通知（残高別途）</PlanFeature>
                  <PlanFeature included>予約機能</PlanFeature>
                  <PlanFeature included>多言語対応（5言語）</PlanFeature>
                  <PlanFeature included highlight>スタッフ 無制限</PlanFeature>
                  <PlanFeature included highlight>分析ダッシュボード（90日間+CSV）</PlanFeature>
                  <PlanFeature included>営業時間制御</PlanFeature>
                  <PlanFeature included highlight>フルカスタムブランディング</PlanFeature>
                  <PlanFeature included highlight>優先メールサポート</PlanFeature>
                </ul>
                <Button 
                  variant="outline"
                  size="lg" 
                  className="w-full mt-6 active:scale-[0.97] transition-transform"
                  onClick={() => window.location.href = getLoginUrl()}
                >
                  申し込む
                </Button>
              </CardContent>
            </Card>
          </AnimatedCard>
        </div>

        {/* SMS Pricing Note */}
        <AnimatedPage variant="fade-up" delay={500}>
          <div className="max-w-3xl mx-auto mt-12">
            <Card className="bg-muted/30">
              <CardContent className="py-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">SMS通知について</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      SMS通知はStandard・Proプランでご利用いただけます。
                      料金は<span className="font-semibold text-foreground">1通25円</span>のプリペイド方式で、
                      事前にチャージした残高から消費されます。
                      Web Push通知はすべてのプランで<span className="font-semibold text-foreground">無料</span>でご利用いただけます。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </AnimatedPage>

        {/* Comparison with competitors */}
        <AnimatedPage variant="fade-up" delay={600}>
          <div className="max-w-3xl mx-auto mt-8">
            <Card className="bg-muted/30">
              <CardContent className="py-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">業界最安クラスの料金</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      一般的な順番待ちシステムは月額5,000円〜22,000円が相場です。
                      Queue Callは月額<span className="font-semibold text-foreground">1,500円</span>から、
                      SMS通知・予約機能・分析ダッシュボードなどフル機能をご利用いただけます。
                      初期費用・解約金は一切かかりません。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </AnimatedPage>
      </section>

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="container py-16">
          <AnimatedPage variant="zoom-fade" delay={200}>
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="py-12 text-center space-y-4">
                <h2 className="text-2xl font-bold">今すぐ始めましょう</h2>
                <p className="opacity-90">
                  ログインして店舗を作成し、順番待ちシステムを導入しましょう。
                </p>
                <Button 
                  size="lg" 
                  variant="secondary"
                  className="active:scale-[0.97] transition-transform"
                  onClick={() => window.location.href = getLoginUrl()}
                >
                  無料で始める
                </Button>
              </CardContent>
            </Card>
          </AnimatedPage>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container py-8 text-center text-sm text-muted-foreground">
          <p>Queue Call - 順番待ち呼び出しシステム</p>
          <p className="mt-2">PWA対応 | 多言語対応 | リアルタイム更新</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Link href="/terms" className="hover:text-foreground transition-colors">利用規約</Link>
            <span>|</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">プライバシーポリシー</Link>
          </div>
          <p className="mt-2">&copy; {new Date().getFullYear()} 合同会社Asobe. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description,
  delay = 0
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
  delay?: number;
}) {
  return (
    <AnimatedCard delay={delay}>
      <Card className="h-full">
        <CardHeader>
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-2">
            {icon}
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </AnimatedCard>
  );
}

function PlanFeature({ 
  children, 
  included = false,
  highlight = false
}: { 
  children: React.ReactNode; 
  included?: boolean;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      {included ? (
        <Check className={`h-4 w-4 shrink-0 ${highlight ? 'text-primary' : 'text-green-600'}`} />
      ) : (
        <X className="h-4 w-4 shrink-0 text-muted-foreground/40" />
      )}
      <span className={`text-sm ${!included ? 'text-muted-foreground/60' : ''} ${highlight ? 'font-semibold text-primary' : ''}`}>
        {children}
      </span>
    </li>
  );
}

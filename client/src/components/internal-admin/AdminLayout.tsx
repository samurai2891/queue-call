import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Activity,
  Building2,
  CircleAlert,
  CreditCard,
  Gauge,
  Loader2,
  Shield,
  TestTube2,
  Ticket,
  Users,
} from "lucide-react";

type AdminLayoutProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { href: "/internal-admin", label: "概要", icon: Gauge },
  { href: "/internal-admin/users", label: "ユーザー", icon: Users },
  { href: "/internal-admin/stores", label: "店舗", icon: Building2 },
  { href: "/internal-admin/tickets", label: "チケット", icon: Ticket },
  { href: "/internal-admin/revenue", label: "収益", icon: CreditCard },
  { href: "/internal-admin/system", label: "システム", icon: Activity },
  { href: "/internal-admin/test-accounts", label: "テストアカウント", icon: TestTube2 },
];

function SidebarLink({
  href,
  label,
  icon: Icon,
  currentPath,
}: NavItem & { currentPath: string }) {
  const isActive =
    href === "/internal-admin"
      ? currentPath === href
      : currentPath === href || currentPath.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

export function AdminLayout({ title, description, children }: AdminLayoutProps) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>内部管理へアクセスするにはログインが必要です</CardTitle>
            <CardDescription>
              認証後に `INTERNAL_ADMIN_IDS` に含まれるアカウントだけが利用できます。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => (window.location.href = getLoginUrl())}>
              ログイン
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user.isInternalAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-6 md:p-8">
            <Empty className="border rounded-2xl">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleAlert className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>この画面へのアクセス権がありません</EmptyTitle>
                <EmptyDescription>
                  内部管理画面は allowlist に登録された社内アカウントだけが利用できます。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="sm:flex-row sm:justify-center">
                <Button asChild>
                  <Link href="/">ホームへ戻る</Link>
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.12),_transparent_40%),linear-gradient(to_bottom,_hsl(var(--background)),_hsl(var(--muted)/0.35))]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r bg-background/90 p-6 backdrop-blur md:block">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Queue Call</div>
            <div className="text-xs text-muted-foreground">内部管理</div>
          </div>
        </div>
        <nav className="mt-8 space-y-2">
          {navItems.map(item => (
            <SidebarLink key={item.href} currentPath={location} {...item} />
          ))}
        </nav>
      </aside>

      <div className="md:pl-72">
        <header className="border-b bg-background/80 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Internal Admin Console</p>
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
              <div className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                {user.openId}
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto md:hidden">
              {navItems.map(item => (
                <SidebarLink key={item.href} currentPath={location} {...item} />
              ))}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

type KpiCardProps = {
  title: string;
  value: string;
  description?: string;
  secondaryValue?: string;
  icon: LucideIcon;
  loading?: boolean;
};

export function KpiCard({
  title,
  value,
  description,
  secondaryValue,
  icon: Icon,
  loading = false,
}: KpiCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription>{title}</CardDescription>
            <CardTitle className="mt-2 text-2xl tracking-tight">
              {loading ? <Skeleton className="h-8 w-28" /> : value}
            </CardTitle>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          <>
            {description ? (
              <div className="text-sm text-muted-foreground">{description}</div>
            ) : null}
            {secondaryValue ? (
              <div className="mt-2 text-xs font-medium text-muted-foreground">
                {secondaryValue}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

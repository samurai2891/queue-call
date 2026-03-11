import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Wrench } from "lucide-react";
import { AdminLayout } from "./AdminLayout";

type InternalAdminPlaceholderProps = {
  title: string;
  description: string;
};

export function InternalAdminPlaceholder({
  title,
  description,
}: InternalAdminPlaceholderProps) {
  return (
    <AdminLayout title={title} description={description}>
      <Card>
        <CardContent className="p-6">
          <Empty className="rounded-2xl border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wrench className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>{title} は Phase 1 の骨格のみ実装済みです</EmptyTitle>
              <EmptyDescription>
                このページの実データ表示と操作機能は次フェーズで追加します。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

type QueryErrorAlertProps = {
  message: string;
};

export function QueryErrorAlert({ message }: QueryErrorAlertProps) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>データを取得できません</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

import { Switch } from "@/components/ui/switch";

type IncludeTestToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function IncludeTestToggle({
  checked,
  onCheckedChange,
}: IncludeTestToggleProps) {
  return (
    <label className="inline-flex items-center gap-3 rounded-full border bg-background/80 px-4 py-2 text-sm shadow-sm">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <span className="font-medium">テストデータを含める</span>
    </label>
  );
}

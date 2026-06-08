import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4 animate-fadeIn">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 animate-float">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">{description}</p>
      {action && (
        <Button
          onClick={action.onClick}
          className="mt-6 rounded-xl shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

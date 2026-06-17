import * as React from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface MonthPickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
  className?: string;
}

export function MonthPicker({ date, onDateChange, className }: MonthPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(date.getFullYear());

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(viewYear, monthIndex, 1);
    onDateChange(newDate);
    setOpen(false);
  };

  React.useEffect(() => {
    if (open) setViewYear(date.getFullYear());
  }, [open, date]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-[160px] justify-start text-left font-normal rounded-xl border-border/60 hover:border-primary/30 transition-colors shadow-sm", className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          {format(date, "MMMM yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-4 rounded-2xl border-border/60 shadow-lg" align="end">
        <div className="flex items-center justify-between mb-4 bg-muted/30 p-1 rounded-xl">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-background"
            onClick={() => setViewYear(viewYear - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-semibold text-sm tabular-nums tracking-tight">{viewYear}</div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-background"
            onClick={() => setViewYear(viewYear + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {months.map((month, i) => {
            const isSelected = date.getFullYear() === viewYear && date.getMonth() === i;
            return (
              <Button
                key={month}
                variant={isSelected ? "default" : "ghost"}
                className={cn(
                  "h-10 rounded-xl font-medium transition-all duration-200",
                  isSelected 
                    ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-sm" 
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                )}
                onClick={() => handleMonthSelect(i)}
              >
                {month}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

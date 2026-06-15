import * as React from "react";
import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  value?: string | null;
  onChange?: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", className }: DatePickerProps) {
  const date = value ? parseISO(value) : undefined;
  const [open, setOpen] = React.useState(false);

  const setSelectedDate = (next?: Date) => {
    if (!onChange) return;
    if (!next) {
      onChange("");
      return;
    }
    onChange(format(next, "yyyy-MM-dd"));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date && !isNaN(date.getTime()) ? format(date, "yyyy-MM-dd") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-border/60" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setSelectedDate}
          initialFocus
        />
        <div className="flex items-center justify-between border-t border-border/60 p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg"
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
          <div className="flex items-center gap-2">
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg text-muted-foreground"
                onClick={() => setSelectedDate(undefined)}
              >
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

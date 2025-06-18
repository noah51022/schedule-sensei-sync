import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  dateRange: { start: Date; end: Date };
}

export const CalendarView = ({ selectedDate, onDateSelect, dateRange }: CalendarViewProps) => {
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  const isInRange = (date: Date) => {
    return date >= dateRange.start && date <= dateRange.end;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') {
      newMonth.setMonth(currentMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(currentMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateMonth('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateMonth('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Range: {dateRange.start.toLocaleDateString()} - {dateRange.end.toLocaleDateString()}
        </p>
      </div>
      
      <div className="p-4">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => date && onDateSelect(date)}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          className="w-full"
          modifiers={{
            inRange: isInRange,
            outside: (date) => !isInRange(date)
          }}
          modifiersStyles={{
            inRange: { 
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              borderRadius: '0.375rem'
            },
            outside: { 
              opacity: 0.3,
              pointerEvents: 'none'
            }
          }}
        />
      </div>
      
      <div className="p-4 border-t border-border bg-muted/50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Selected:</span>
          <span className="font-medium text-foreground">
            {selectedDate.toLocaleDateString('en-US', { 
              weekday: 'short',
              month: 'short', 
              day: 'numeric' 
            })}
          </span>
        </div>
      </div>
    </div>
  );
};
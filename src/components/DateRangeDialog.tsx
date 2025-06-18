import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { addDays } from "date-fns";

interface DateRangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRangeSelect: (range: { start: Date; end: Date }) => void;
  currentRange: { start: Date; end: Date };
}

export const DateRangeDialog = ({
  open,
  onOpenChange,
  onRangeSelect,
  currentRange,
}: DateRangeDialogProps) => {
  const [startDate, setStartDate] = useState<Date | undefined>(currentRange.start);
  const [endDate, setEndDate] = useState<Date | undefined>(currentRange.end);

  const handleSave = () => {
    if (startDate && endDate) {
      onRangeSelect({ start: startDate, end: endDate });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Select Date Range</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Start Date</label>
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              disabled={(date) => date < new Date() || (endDate ? date > endDate : false)}
              initialFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">End Date</label>
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={setEndDate}
              disabled={(date) => date < (startDate || new Date())}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!startDate || !endDate}>
            Save Range
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 
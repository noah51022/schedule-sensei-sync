import { useState } from "react";
import { cn } from "@/lib/utils";

interface TimeSlot {
  hour: number;
  available: number; // Number of people available (0-10)
  total: number;
}

interface AvailabilityGridProps {
  selectedDate: Date;
  timeSlots: TimeSlot[];
}

export const AvailabilityGrid = ({ selectedDate, timeSlots }: AvailabilityGridProps) => {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const getAvailabilityColor = (available: number, total: number) => {
    if (total === 0) return "bg-muted";
    const percentage = available / total;
    if (percentage >= 0.8) return "bg-green-500";
    if (percentage >= 0.6) return "bg-green-400";
    if (percentage >= 0.4) return "bg-yellow-400";
    if (percentage >= 0.2) return "bg-orange-400";
    return "bg-red-400";
  };

  return (
    <div className="p-6 bg-card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          {selectedDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
          })}
        </h3>
        <p className="text-sm text-muted-foreground">Group availability overview</p>
      </div>
      
      <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
        {timeSlots.map((slot, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border transition-all duration-200 cursor-pointer",
              "hover:border-primary hover:shadow-sm",
              hoveredSlot === index && "border-primary shadow-sm"
            )}
            onMouseEnter={() => setHoveredSlot(index)}
            onMouseLeave={() => setHoveredSlot(null)}
          >
            <div className="flex items-center space-x-3">
              <div className="text-sm font-medium text-foreground min-w-[80px]">
                {formatHour(slot.hour)}
              </div>
              <div
                className={cn(
                  "w-4 h-4 rounded-full",
                  getAvailabilityColor(slot.available, slot.total)
                )}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                {slot.available}/{slot.total} available
              </span>
              {slot.available === slot.total && slot.total > 0 && (
                <div className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  Perfect Match!
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 p-3 bg-muted rounded-lg">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Availability</span>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <span>Low</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
              <span>Medium</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>High</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
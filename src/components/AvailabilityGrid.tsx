import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Button } from "./ui/button";
import { toast } from "./ui/use-toast";

interface TimeSlot {
  hour: number;
  available: number;
  total: number;
  isUserAvailable: boolean;
}

interface AvailabilityGridProps {
  selectedDate: Date;
  eventId: string;
  availabilityVersion: number;
}

export const AvailabilityGrid = ({ selectedDate, eventId, availabilityVersion }: AvailabilityGridProps) => {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const getAvailabilityColor = (available: number, total: number, isUserAvailable: boolean) => {
    if (total === 0) return "bg-muted";
    const percentage = available / total;
    if (isUserAvailable) return "bg-primary";
    if (percentage >= 0.8) return "bg-green-500";
    if (percentage >= 0.6) return "bg-green-400";
    if (percentage >= 0.4) return "bg-yellow-400";
    if (percentage >= 0.2) return "bg-orange-400";
    return "bg-red-400";
  };

  const fetchAvailability = async () => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];

      // Fetch all availability for this date and event
      const { data: availabilities, error } = await supabase
        .from('availability')
        .select('user_id, start_hour, end_hour')
        .eq('event_id', eventId)
        .eq('date', dateStr);

      if (error) throw error;

      // Initialize time slots
      const slots: TimeSlot[] = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        available: 0,
        total: 0,
        isUserAvailable: false
      }));

      // Process availabilities
      availabilities?.forEach(availability => {
        for (let hour = availability.start_hour; hour < availability.end_hour; hour++) {
          slots[hour].total++;
          slots[hour].available++;
          if (availability.user_id === user?.id) {
            slots[hour].isUserAvailable = true;
          }
        }
      });

      setTimeSlots(slots);
    } catch (error) {
      console.error('Error fetching availability:', error);
      toast({
        title: "Error",
        description: "Failed to load availability data",
        variant: "destructive"
      });
    }
  };

  const toggleAvailability = async (hour: number) => {
    if (!user) return;
    setIsLoading(true);

    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const isCurrentlyAvailable = timeSlots[hour].isUserAvailable;

      if (isCurrentlyAvailable) {
        // Remove availability
        const { error } = await supabase
          .from('availability')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .eq('start_hour', hour);

        if (error) throw error;
      } else {
        // Add availability
        const { error } = await supabase
          .from('availability')
          .insert({
            event_id: eventId,
            user_id: user.id,
            date: dateStr,
            start_hour: hour,
            end_hour: hour + 1
          });

        if (error) throw error;
      }

      // Refresh availability data
      await fetchAvailability();

      toast({
        title: "Success",
        description: isCurrentlyAvailable
          ? "Availability removed"
          : "Availability added",
      });
    } catch (error) {
      console.error('Error updating availability:', error);
      toast({
        title: "Error",
        description: "Failed to update availability",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [selectedDate, eventId, user?.id, availabilityVersion]);

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
        <p className="text-sm text-muted-foreground">Click on a time slot to toggle your availability</p>
      </div>

      <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
        {timeSlots.map((slot, index) => (
          <Button
            key={index}
            variant="outline"
            className={cn(
              "flex items-center justify-between p-3 h-auto",
              "hover:border-primary hover:shadow-sm",
              hoveredSlot === index && "border-primary shadow-sm",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
            disabled={isLoading}
            onClick={() => toggleAvailability(slot.hour)}
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
                  getAvailabilityColor(slot.available, slot.total, slot.isUserAvailable)
                )}
              />
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                {slot.available}/{slot.total || 1} available
              </span>
              {slot.available === slot.total && slot.total > 0 && (
                <div className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  Perfect Match!
                </div>
              )}
            </div>
          </Button>
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
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-primary"></div>
              <span>Your Slots</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
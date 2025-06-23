import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Button } from "./ui/button";
import { toast } from "./ui/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface TimeSlot {
  hour: number;
  available: number;
  total: number;
  isUserAvailable: boolean;
  userSlotName?: string; // Name of the user's slot (if any)
  userAvailabilityType?: 'available' | 'unavailable' | 'busy' | 'tentative'; // User's availability type
  slotNames?: string[]; // Names of all slots for this hour
  slotDetails?: { name?: string; availability_type?: 'available' | 'unavailable' | 'busy' | 'tentative' }[]; // Detailed slot info for tooltips
}

interface AvailabilityGridProps {
  selectedDate: Date;
  eventId: string;
  availabilityVersion: number;
  onAvailabilityChange: () => void;
}

export const AvailabilityGrid = ({ selectedDate, eventId, availabilityVersion, onAvailabilityChange }: AvailabilityGridProps) => {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const getAvailabilityColor = (available: number, total: number, isUserAvailable: boolean, userAvailabilityType?: 'available' | 'unavailable' | 'busy' | 'tentative') => {
    if (total === 0) return "bg-muted";

    // If user has availability, show color based on their type
    if (isUserAvailable) {
      switch (userAvailabilityType) {
        case 'available': return "bg-green-500";
        case 'unavailable': return "bg-red-500";
        case 'busy': return "bg-yellow-500";
        case 'tentative': return "bg-gray-500";
        default: return "bg-primary"; // fallback for existing data
      }
    }

    // For other users' availability, use the existing logic
    const percentage = available / total;
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
        .select('user_id, start_hour, end_hour, name, availability_type')
        .eq('event_id', eventId)
        .eq('date', dateStr);

      if (error) throw error;

      // Initialize time slots
      const slots: TimeSlot[] = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        available: 0,
        total: 0,
        isUserAvailable: false,
        slotNames: []
      }));

      // Process availabilities
      availabilities?.forEach(availability => {
        for (let hour = availability.start_hour; hour < availability.end_hour; hour++) {
          slots[hour].total++;
          slots[hour].available++;
          if (availability.user_id === user?.id) {
            slots[hour].isUserAvailable = true;
            if (availability.name) {
              slots[hour].userSlotName = availability.name;
            }
            if (availability.availability_type) {
              slots[hour].userAvailabilityType = availability.availability_type;
            }
          }
          // Collect all slot names for this hour
          if (availability.name && !slots[hour].slotNames?.includes(availability.name)) {
            slots[hour].slotNames?.push(availability.name);
          }
          // Collect detailed slot info for tooltips
          if (!slots[hour].slotDetails) {
            slots[hour].slotDetails = [];
          }
          const existingDetail = slots[hour].slotDetails?.find(detail =>
            detail.name === availability.name && detail.availability_type === availability.availability_type
          );
          if (!existingDetail) {
            slots[hour].slotDetails?.push({
              name: availability.name,
              availability_type: availability.availability_type
            });
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

      // Optimistically update the UI immediately
      const updatedSlots = [...timeSlots];
      updatedSlots[hour] = {
        ...updatedSlots[hour],
        isUserAvailable: !isCurrentlyAvailable,
        available: isCurrentlyAvailable ? Math.max(0, updatedSlots[hour].available - 1) : updatedSlots[hour].available + 1
      };
      setTimeSlots(updatedSlots);

      if (isCurrentlyAvailable) {
        // First, get existing availability slots to handle overlapping scenarios
        const { data: existingSlots } = await supabase
          .from('availability')
          .select('*')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .eq('date', dateStr);

        // First try direct deletion for exact matches (hourly slots)
        const { error: directError, count } = await supabase
          .from('availability')
          .delete({ count: 'exact' })
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .eq('start_hour', hour)
          .eq('end_hour', hour + 1);

        // If direct deletion didn't work or found no matches, we need to handle slot splitting
        if (directError || count === 0) {
          if (!existingSlots) {
            throw new Error('Could not fetch existing slots');
          }

          // Find slots that overlap with the hour we want to remove
          const overlappingSlots = existingSlots.filter(slot =>
            slot.start_hour < hour + 1 && slot.end_hour > hour
          );

          // Process each overlapping slot
          for (const slot of overlappingSlots) {
            // Delete the original slot
            const { error: deleteError } = await supabase
              .from('availability')
              .delete()
              .eq('id', slot.id);

            if (deleteError) {
              throw deleteError;
            }

            // Create the remaining parts
            const newSlots = [];

            // Part before the removed hour
            if (slot.start_hour < hour) {
              newSlots.push({
                event_id: eventId,
                user_id: user.id,
                date: dateStr,
                start_hour: slot.start_hour,
                end_hour: hour
              });
            }

            // Part after the removed hour
            if (slot.end_hour > hour + 1) {
              newSlots.push({
                event_id: eventId,
                user_id: user.id,
                date: dateStr,
                start_hour: hour + 1,
                end_hour: slot.end_hour
              });
            }

            // Insert the remaining parts
            if (newSlots.length > 0) {
              const { error: insertError } = await supabase
                .from('availability')
                .insert(newSlots);

              if (insertError) {
                throw insertError;
              }
            }
          }
        }
      } else {
        // Add availability
        const insertData = {
          event_id: eventId,
          user_id: user.id,
          date: dateStr,
          start_hour: hour,
          end_hour: hour + 1
        };

        const { error } = await supabase
          .from('availability')
          .insert(insertData);

        if (error) {
          // Revert optimistic update on error
          setTimeSlots(timeSlots);
          throw error;
        }
      }

      // Refresh availability data
      onAvailabilityChange();

      // Also directly refresh the local state to ensure immediate update
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

      <TooltipProvider>
        <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
          {timeSlots.slice(8).map((slot) => (
            <Tooltip key={slot.hour}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "flex items-center justify-between p-3 h-auto",
                    "hover:border-primary hover:shadow-sm",
                    hoveredSlot === slot.hour && "border-primary shadow-sm",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                  disabled={isLoading}
                  onClick={() => toggleAvailability(slot.hour)}
                  onMouseEnter={() => setHoveredSlot(slot.hour)}
                  onMouseLeave={() => setHoveredSlot(null)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-sm font-medium text-foreground min-w-[80px]">
                      {formatHour(slot.hour)}
                    </div>
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full",
                        getAvailabilityColor(slot.available, slot.total, slot.isUserAvailable, slot.userAvailabilityType)
                      )}
                    />
                    {slot.userSlotName && (
                      <div className={cn(
                        "px-2 py-1 text-xs rounded-full max-w-[120px] truncate",
                        slot.userAvailabilityType === 'available' && "bg-green-100 text-green-800",
                        slot.userAvailabilityType === 'unavailable' && "bg-red-100 text-red-800",
                        slot.userAvailabilityType === 'busy' && "bg-yellow-100 text-yellow-800",
                        slot.userAvailabilityType === 'tentative' && "bg-gray-100 text-gray-800",
                        !slot.userAvailabilityType && "bg-blue-100 text-blue-800" // fallback
                      )}>
                        {slot.userAvailabilityType === 'available' && '✅ '}
                        {slot.userAvailabilityType === 'unavailable' && '❌ '}
                        {slot.userAvailabilityType === 'busy' && '🔒 '}
                        {slot.userAvailabilityType === 'tentative' && '❓ '}
                        {slot.userSlotName}
                      </div>
                    )}
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
              </TooltipTrigger>
              <TooltipContent>
                <div className="max-w-[250px]">
                  <div className="font-medium mb-1">{formatHour(slot.hour)} - Details:</div>
                  <div className="text-sm space-y-1">
                    <div>Total participants: {slot.total || 0}</div>
                    <div>Available: {slot.available}</div>

                    {slot.isUserAvailable && (
                      <div className="pt-1 border-t border-border">
                        <div className="font-medium text-xs">Your status:</div>
                        <div className="flex items-center space-x-1 text-xs">
                          {slot.userAvailabilityType === 'available' && <span>✅ Available</span>}
                          {slot.userAvailabilityType === 'unavailable' && <span>❌ Unavailable</span>}
                          {slot.userAvailabilityType === 'busy' && <span>🔒 Busy</span>}
                          {slot.userAvailabilityType === 'tentative' && <span>❓ Tentative</span>}
                          {!slot.userAvailabilityType && <span>✅ Available</span>}
                          {slot.userSlotName && <span>- {slot.userSlotName}</span>}
                        </div>
                      </div>
                    )}

                    {(slot.slotDetails && slot.slotDetails.length > 0) && (
                      <div className="pt-1 border-t border-border">
                        <div className="font-medium text-xs mb-1">All time slots:</div>
                        {slot.slotDetails.map((detail, index) => (
                          <div key={index} className="flex items-center space-x-1 text-xs">
                            {detail.availability_type === 'available' && <span>✅</span>}
                            {detail.availability_type === 'unavailable' && <span>❌</span>}
                            {detail.availability_type === 'busy' && <span>🔒</span>}
                            {detail.availability_type === 'tentative' && <span>❓</span>}
                            {!detail.availability_type && <span>✅</span>}
                            <span>{detail.name || 'Unnamed slot'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      <div className="mt-4 p-3 bg-muted rounded-lg">
        <div className="text-xs">
          <span className="text-muted-foreground font-medium mb-2 block">Your Status Types:</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>✅ Available</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span>❌ Unavailable</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span>🔒 Busy</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
              <span>❓ Tentative</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
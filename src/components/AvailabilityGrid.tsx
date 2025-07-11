import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Button } from "./ui/button";
import { toast } from "./ui/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Info } from "lucide-react";

interface ParticipantDetail {
  user_id: string;
  display_name?: string;
  name?: string;
  availability_type?: 'available' | 'unavailable' | 'busy' | 'tentative';
}

interface TimeSlot {
  hour: number;
  available: number;
  total: number;
  isUserAvailable: boolean;
  userSlotName?: string; // Name of the user's slot (if any)
  userAvailabilityType?: 'available' | 'unavailable' | 'busy' | 'tentative'; // User's availability type
  slotNames?: string[]; // Names of all slots for this hour
  slotDetails?: { name?: string; availability_type?: 'available' | 'unavailable' | 'busy' | 'tentative' }[]; // Detailed slot info for tooltips
  participantDetails?: ParticipantDetail[]; // Participant information with names
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
        .select(`
          user_id, 
          start_hour, 
          end_hour, 
          name, 
          availability_type
        `)
        .eq('event_id', eventId)
        .eq('date', dateStr);

      if (error) throw error;

      // Get unique user IDs to fetch profile information
      const userIds = [...new Set(availabilities?.map(a => a.user_id) || [])];

      // Fetch profile information separately
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);

        if (profilesError) {
          console.warn('Error fetching profiles:', profilesError);
          // Continue without profile data rather than failing completely
        } else {
          profiles = profilesData || [];
        }
      }

      // Create a map for quick profile lookups
      const profileMap = new Map(profiles.map(p => [p.user_id, p]));

      // Initialize time slots
      const slots: TimeSlot[] = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        available: 0,
        total: 0,
        isUserAvailable: false,
        slotNames: [],
        participantDetails: []
      }));

      // Process availabilities
      availabilities?.forEach(availability => {
        for (let hour = availability.start_hour; hour < availability.end_hour; hour++) {
          slots[hour].total++;
          // Only count as available if the availability type is 'available' or 'tentative' (or null for backward compatibility)
          if (availability.availability_type === 'available' || availability.availability_type === 'tentative' || !availability.availability_type) {
            slots[hour].available++;
          }
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

          // Collect participant details for this hour
          if (!slots[hour].participantDetails) {
            slots[hour].participantDetails = [];
          }
          const existingParticipant = slots[hour].participantDetails?.find(p => p.user_id === availability.user_id);
          if (!existingParticipant) {
            const profile = profileMap.get(availability.user_id);
            slots[hour].participantDetails?.push({
              user_id: availability.user_id,
              display_name: profile?.display_name || 'Anonymous User',
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
    <div className="p-6 bg-card w-full max-w-3xl">
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

      <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto w-full">
        {timeSlots.slice(8).map((slot) => (
          <div key={slot.hour} className="flex items-center gap-3 w-full">
            <Button
              variant="outline"
              className={cn(
                "flex items-center justify-between p-3 h-auto flex-1 min-w-0",
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

              <div className="flex items-center space-x-2 min-w-0">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {slot.available}/{slot.total || 1} available
                </span>
                <div className="flex items-center justify-center min-w-[20px]">
                  {slot.available === slot.total && slot.total > 0 && (
                    <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center" title="Perfect Match!">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  )}
                </div>
              </div>
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-2 h-auto shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-3">
                  <div className="font-medium text-sm">{formatHour(slot.hour)} - Details</div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total participants:</span>
                      <span className="font-medium">{slot.total || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Available:</span>
                      <span className="font-medium text-green-600">{slot.available}</span>
                    </div>
                  </div>

                  {slot.isUserAvailable && (
                    <div className="pt-2 border-t border-border">
                      <div className="font-medium text-xs mb-1">Your status:</div>
                      <div className="flex items-center space-x-2 text-xs">
                        {slot.userAvailabilityType === 'available' && <span className="text-green-600">✅ Available</span>}
                        {slot.userAvailabilityType === 'unavailable' && <span className="text-red-600">❌ Unavailable</span>}
                        {slot.userAvailabilityType === 'busy' && <span className="text-yellow-600">🔒 Busy</span>}
                        {slot.userAvailabilityType === 'tentative' && <span className="text-gray-600">❓ Tentative</span>}
                        {!slot.userAvailabilityType && <span className="text-green-600">✅ Available</span>}
                        {slot.userSlotName && <span className="text-muted-foreground">- {slot.userSlotName}</span>}
                      </div>
                    </div>
                  )}

                  {slot.participantDetails && slot.participantDetails.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <div className="font-medium text-xs mb-2">Participants ({slot.participantDetails.length}):</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {slot.participantDetails.map((participant, index) => (
                          <div key={`${participant.user_id}-${index}`} className="flex items-center justify-between text-xs p-1 rounded bg-muted/50">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                {participant.display_name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <span className="font-medium">{participant.display_name}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              {participant.availability_type === 'available' && <span className="text-green-600">✅</span>}
                              {participant.availability_type === 'unavailable' && <span className="text-red-600">❌</span>}
                              {participant.availability_type === 'busy' && <span className="text-yellow-600">🔒</span>}
                              {participant.availability_type === 'tentative' && <span className="text-gray-600">❓</span>}
                              {!participant.availability_type && <span className="text-green-600">✅</span>}
                              {participant.name && (
                                <span className="text-muted-foreground text-xs max-w-20 truncate">
                                  {participant.name}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Click on the time slot to toggle your availability
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ))}
      </div>

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
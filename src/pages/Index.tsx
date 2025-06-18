import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarHeader } from "@/components/CalendarHeader";
import { CalendarView } from "@/components/CalendarView";
import { AvailabilityGrid } from "@/components/AvailabilityGrid";
import { ChatInterface } from "@/components/ChatInterface";
import { DateRangeDialog } from "@/components/DateRangeDialog";
import RecommendedTimes from "@/components/RecommendedTimes";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "@/components/ui/use-toast";
import { Participant } from "@/components/ParticipantsPopover";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isDateRangeDialogOpen, setIsDateRangeDialogOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);

  // Initialize with current date and a week range
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const [dateRange, setDateRange] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create or fetch event when date range changes
  useEffect(() => {
    const setupEvent = async () => {
      if (!user) return;

      try {
        setIsLoading(true);

        // Try to find an existing event for this date range
        const { data: existingEvents, error: fetchError } = await supabase
          .from('events')
          .select('id')
          .eq('creator_id', user.id)
          .gte('start_date', dateRange.start.toISOString().split('T')[0])
          .lte('end_date', dateRange.end.toISOString().split('T')[0])
          .limit(1);

        if (fetchError) throw fetchError;

        let currentEventId: string | null = null;

        if (existingEvents && existingEvents.length > 0) {
          currentEventId = existingEvents[0].id;
        } else {
          // Create a new event
          const { data: newEvent, error: createError } = await supabase
            .from('events')
            .insert({
              creator_id: user.id,
              title: `Availability for ${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`,
              start_date: dateRange.start.toISOString().split('T')[0],
              end_date: dateRange.end.toISOString().split('T')[0]
            })
            .select('id')
            .single();

          if (createError) throw createError;
          if (newEvent) currentEventId = newEvent.id;
        }

        // Set the event ID first
        setEventId(currentEventId);

        // Only fetch participant count if we have an event ID
        if (currentEventId) {
          const { data: availabilityData, error: availabilityError } = await supabase
            .from('availability')
            .select('user_id')
            .eq('event_id', currentEventId);

          if (availabilityError) {
            console.warn('Error fetching availability for participant count:', availabilityError);
            setParticipants([]);
          } else if (availabilityData) {
            const uniqueUserIds = [...new Set(availabilityData.map(a => a.user_id))];

            if (uniqueUserIds.length > 0) {
              const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('user_id, display_name')
                .in('user_id', uniqueUserIds);

              if (profilesError) {
                console.warn('Error fetching participant profiles:', profilesError);
                // Fallback to showing user IDs or a generic name
                setParticipants(uniqueUserIds.map(id => ({ id, display_name: 'Participant' })));
              } else {
                const participantMap = new Map(profiles.map(p => [p.user_id, p.display_name]));
                setParticipants(uniqueUserIds.map(userId => ({
                  id: userId,
                  display_name: participantMap.get(userId) || 'Anonymous User'
                })));
              }
            } else {
              setParticipants([]);
            }
          }
        } else {
          setParticipants([]);
        }

        setAvailabilityVersion(v => v + 1);
      } catch (error) {
        console.error('Error setting up event:', error);
        toast({
          title: "Error",
          description: "Failed to set up the event",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    setupEvent();
  }, [dateRange, user]);

  const handleAvailabilityUpdate = async (message: string): Promise<{ success: boolean; slots?: any[]; error?: string }> => {
    if (!user || !eventId) {
      return { success: false, error: "User or event not found" };
    }

    try {
      // The AI will process this input through the Edge Function
      const { data, error } = await supabase.functions.invoke<{
        start_hour: number;
        end_hour: number;
      }[]>('chat-with-claude', {
        body: {
          message,
          date: selectedDate.toISOString()
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        return { success: false, error: `AI processing failed: ${error.message}` };
      }

      if (data && Array.isArray(data)) {
        // Update availability in the database
        for (const slot of data) {
          const { error: insertError } = await supabase.from('availability').insert({
            event_id: eventId,
            user_id: user.id,
            date: selectedDate.toISOString().split('T')[0],
            start_hour: slot.start_hour,
            end_hour: slot.end_hour
          });

          if (insertError) {
            console.error('Database insert error:', insertError);
            return { success: false, error: "Failed to save availability to database" };
          }
        }

        toast({
          title: "Success",
          description: "Your availability has been updated",
        });

        setAvailabilityVersion(v => v + 1);
        return { success: true, slots: data };
      } else {
        return { success: false, error: "No time slots were identified" };
      }
    } catch (error) {
      console.error('Error updating availability:', error);
      toast({
        title: "Error",
        description: "Failed to update availability",
        variant: "destructive"
      });
      return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" };
    }
  };

  const formatDateRange = () => {
    return `${dateRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${dateRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const handleDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setDateRange(newRange);
    // If the currently selected date is outside the new range,
    // update it to the start of the new range
    if (selectedDate < newRange.start || selectedDate > newRange.end) {
      setSelectedDate(newRange.start);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <CalendarHeader
        selectedRange={formatDateRange()}
        participants={participants}
        onRangeClick={() => setIsDateRangeDialogOpen(true)}
      />

      <DateRangeDialog
        open={isDateRangeDialogOpen}
        onOpenChange={setIsDateRangeDialogOpen}
        onRangeSelect={handleDateRangeChange}
        currentRange={dateRange}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto">
        <div className="lg:col-span-1">
          <CalendarView
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            dateRange={dateRange}
          />
        </div>

        <div className="lg:col-span-1">
          {eventId ? (
            <AvailabilityGrid
              selectedDate={selectedDate}
              eventId={eventId}
              availabilityVersion={availabilityVersion}
            />
          ) : (
            <div className="p-6 bg-card rounded-lg">
              <p className="text-muted-foreground">Loading availability...</p>
            </div>
          )}
        </div>
        <div className="lg:col-span-1">
          {eventId && (
            <RecommendedTimes eventId={eventId} participants={participants} />
          )}
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        <ChatInterface
          onAvailabilityUpdate={handleAvailabilityUpdate}
          selectedDate={selectedDate}
        />
      </div>
    </div>
  );
};

export default Index;
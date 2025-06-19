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

interface DailyAvailability {
  date: string; // YYYY-MM-DD
  slots: { start_hour: number; end_hour: number }[];
}

interface ClaudeFunctionResponse {
  action: 'add' | 'remove';
  dates: DailyAvailability[];
}

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

  // Fetches or creates a single global event for all users
  useEffect(() => {
    const setupEvent = async () => {
      if (!user) return;

      try {
        setIsLoading(true);

        // Fetch the single global event (the first one ever created)
        const { data: existingEvents, error: fetchError } = await supabase
          .from('events')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1);

        if (fetchError) throw fetchError;

        let currentEvent: Database['public']['Tables']['events']['Row'] | null = null;

        if (existingEvents && existingEvents.length > 0) {
          currentEvent = existingEvents[0];
        } else {
          // No event exists, so this user creates the first one.
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date();
          end.setDate(end.getDate() + 7);
          end.setHours(23, 59, 59, 999);

          const { data: newEvent, error: createError } = await supabase
            .from('events')
            .insert({
              creator_id: user.id,
              title: 'Team Availability Calendar',
              start_date: start.toISOString().split('T')[0],
              end_date: end.toISOString().split('T')[0]
            })
            .select('*')
            .single();

          if (createError) throw createError;
          currentEvent = newEvent;
        }

        if (currentEvent) {
          const currentEventId = currentEvent.id;
          setEventId(currentEventId);

          // Using UTC date strings and ensuring local time interpretation
          const startDate = new Date(currentEvent.start_date + 'T00:00:00');
          const endDate = new Date(currentEvent.end_date + 'T00:00:00');
          endDate.setHours(23, 59, 59, 999);

          setDateRange({ start: startDate, end: endDate });
          if (selectedDate < startDate || selectedDate > endDate) {
            setSelectedDate(startDate);
          }

          setAvailabilityVersion(v => v + 1); // Trigger initial participant fetch
        }
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
  }, [user]);

  useEffect(() => {
    if (!eventId) return;

    const fetchParticipants = async () => {
      // Fetch participant info for the global event
      const { data: availabilityData, error: availabilityError } = await supabase
        .from('availability')
        .select('user_id')
        .eq('event_id', eventId);

      if (availabilityError) {
        console.warn('Error fetching availability for participant count:', availabilityError);
        setParticipants([]);
        return;
      }

      if (availabilityData) {
        const uniqueUserIds = [...new Set(availabilityData.map(a => a.user_id).filter(id => id !== null))] as string[];

        if (uniqueUserIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', uniqueUserIds);

          if (profilesError) {
            console.warn('Error fetching participant profiles:', profilesError);
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
      } else {
        setParticipants([]);
      }
    };

    fetchParticipants();
  }, [eventId, availabilityVersion]);

  // Sets up realtime listeners for availability and event changes
  useEffect(() => {
    if (!eventId) return;

    const channel = supabase.channel(`global-event-updates-${eventId}`);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability', filter: `event_id=eq.${eventId}` },
        (payload) => {
          console.log('Availability change received!', payload);
          toast({
            title: "Calendar updated",
            description: "A team member's availability has changed.",
          });
          setAvailabilityVersion(v => v + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload) => {
          console.log('Event details change received!', payload);
          const newEvent = payload.new as Database['public']['Tables']['events']['Row'];
          const startDate = new Date(newEvent.start_date + 'T00:00:00');
          const endDate = new Date(newEvent.end_date + 'T00:00:00');
          endDate.setHours(23, 59, 59, 999);
          setDateRange({ start: startDate, end: endDate });
          toast({
            title: "Date range updated",
            description: "The event date range has been changed.",
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const handleAvailabilityUpdate = async (message: string): Promise<{ success: boolean; dates?: DailyAvailability[]; action?: 'add' | 'remove'; error?: string }> => {
    if (!user || !eventId) {
      return { success: false, error: "User or event not found" };
    }

    try {
      const { data, error } = await supabase.functions.invoke<ClaudeFunctionResponse>('chat-with-claude', {
        body: {
          message,
          date: selectedDate.toISOString()
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        return { success: false, error: `AI processing failed: ${error.message}` };
      }

      if (data && data.dates && Array.isArray(data.dates)) {
        if (data.action === 'remove') {
          // Handle removals
          const firstDate = data.dates[0]?.date;
          const lastDate = data.dates[data.dates.length - 1]?.date;
          const slots = data.dates[0]?.slots;

          if (!firstDate || !lastDate || !slots || slots.length === 0) {
            return { success: false, error: "No time slots were identified for removal" };
          }

          const { error: rpcError } = await supabase.rpc('delete_availability_slots', {
            p_event_id: eventId,
            p_user_id: user.id,
            p_start_date: firstDate,
            p_end_date: lastDate,
            p_slots: slots
          });

          if (rpcError) {
            console.error('Database remove error:', rpcError);
            return { success: false, error: "Failed to remove availability from database" };
          }

          toast({
            title: "Success",
            description: "Your availability has been removed.",
          });

        } else {
          // Handle additions (default action)
          for (const day of data.dates) {
            for (const slot of day.slots) {
              const { error: insertError } = await supabase.from('availability').insert({
                event_id: eventId,
                user_id: user.id,
                date: day.date,
                start_hour: slot.start_hour,
                end_hour: slot.end_hour
              });

              if (insertError) {
                console.error('Database insert error:', insertError);
                return { success: false, error: "Failed to save availability to database" };
              }
            }
          }

          toast({
            title: "Success",
            description: "Your availability has been updated",
          });
        }

        setAvailabilityVersion(v => v + 1);
        return { success: true, dates: data.dates, action: data.action };
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

  const handleDateRangeChange = async (newRange: { start: Date; end: Date }) => {
    if (!eventId) return;

    // Optimistically update UI
    setDateRange(newRange);
    if (selectedDate < newRange.start || selectedDate > newRange.end) {
      setSelectedDate(newRange.start);
    }

    // Persist change to the database
    const { error } = await supabase
      .from('events')
      .update({
        start_date: newRange.start.toISOString().split('T')[0],
        end_date: newRange.end.toISOString().split('T')[0]
      })
      .eq('id', eventId);

    if (error) {
      console.error('Failed to update date range:', error);
      toast({
        title: "Error",
        description: "Could not save the new date range.",
        variant: "destructive",
      });
      // Here you might want to revert the optimistic update
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
              onAvailabilityChange={() => setAvailabilityVersion(v => v + 1)}
            />
          ) : (
            <div className="p-6 bg-card rounded-lg">
              <p className="text-muted-foreground">Loading availability...</p>
            </div>
          )}
        </div>
        <div className="lg:col-span-1">
          {eventId && (
            <RecommendedTimes
              eventId={eventId}
              participants={participants}
              availabilityVersion={availabilityVersion}
            />
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
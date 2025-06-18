import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarHeader } from "@/components/CalendarHeader";
import { CalendarView } from "@/components/CalendarView";
import { AvailabilityGrid } from "@/components/AvailabilityGrid";
import { ChatInterface } from "@/components/ChatInterface";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

interface TimeSlot {
  hour: number;
  available: number;
  total: number;
}

interface ParsedSlots {
  start_time: string;
  end_time: string;
}

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  // Fetch availability data when selected date changes
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!user) return;

      try {
        setIsLoading(true);

        // Fetch participants count
        const { data: participants, error: participantsError } = await supabase
          .from('participants')
          .select('id')
          .eq('event_id', dateRange.start.toISOString());

        if (participantsError) throw participantsError;
        setParticipantCount(participants?.length || 0);

        // Fetch availability for the selected date
        const { data: availability, error: availabilityError } = await supabase
          .from('availability')
          .select('*')
          .eq('date', selectedDate.toISOString().split('T')[0]);

        if (availabilityError) throw availabilityError;

        // Process availability data into time slots
        const slots: TimeSlot[] = [];
        for (let hour = 9; hour <= 20; hour++) {
          const availableCount = availability?.filter(a => {
            const startHour = new Date(a.start_time).getHours();
            const endHour = new Date(a.end_time).getHours();
            return startHour <= hour && endHour > hour;
          }).length || 0;

          slots.push({
            hour,
            available: availableCount,
            total: participants?.length || 0
          });
        }

        setTimeSlots(slots);
      } catch (error) {
        console.error('Error fetching availability:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvailability();
  }, [selectedDate, user, dateRange.start]);

  const handleAvailabilityUpdate = async (availability: string) => {
    if (!user) return;

    try {
      // The AI will process this input through the Edge Function
      // The response will be used to update the availability in the database
      const { data: { parsed_slots }, error } = await supabase.functions.invoke<{
        parsed_slots: ParsedSlots[]
      }>('parse-availability', {
        body: {
          message: availability,
          date: selectedDate.toISOString()
        }
      });

      if (error) throw error;

      // Update availability in the database
      if (parsed_slots) {
        for (const slot of parsed_slots) {
          await supabase.from('availability').insert({
            user_id: user.id,
            date: selectedDate.toISOString().split('T')[0],
            start_time: slot.start_time,
            end_time: slot.end_time
          });
        }
      }
    } catch (error) {
      console.error('Error updating availability:', error);
    }
  };

  const formatDateRange = () => {
    return `${dateRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${dateRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  if (loading || !user) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <CalendarHeader
        selectedRange={formatDateRange()}
        participantCount={participantCount}
        onRangeClick={() => {
          // TODO: Implement date range selection dialog
          console.log('Range selection clicked');
        }}
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
          <AvailabilityGrid
            selectedDate={selectedDate}
            timeSlots={timeSlots}
          />
        </div>

        <div className="lg:col-span-1 h-[600px]">
          <ChatInterface onAvailabilityUpdate={handleAvailabilityUpdate} />
        </div>
      </div>
    </div>
  );
};

export default Index;
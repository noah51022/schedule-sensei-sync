import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from "@/integrations/supabase/types";
import { Participant } from './ParticipantsPopover'; // Assuming the type can be imported

interface RecommendedTimesProps {
  eventId: string;
  participants: Participant[];
}

type Availability = Database['public']['Tables']['availability']['Row'];

interface TimeSlot {
  date: string;
  startHour: number;
  endHour: number;
}

const RecommendedTimes: React.FC<RecommendedTimesProps> = ({ eventId, participants }) => {
  const [recommendedSlots, setRecommendedSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const findRecommendedTimes = async () => {
      if (!eventId || participants.length === 0) {
        setRecommendedSlots([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data: availabilityData, error } = await supabase
          .from('availability')
          .select('user_id, date, start_hour, end_hour')
          .eq('event_id', eventId);

        if (error) throw error;

        const totalParticipants = participants.length;
        if (totalParticipants === 0) {
          setRecommendedSlots([]);
          setIsLoading(false);
          return;
        }

        const availabilityByDate: { [key: string]: { [hour: number]: Set<string> } } = {};

        for (const entry of availabilityData) {
          if (!entry.date || !entry.user_id) continue;

          if (!availabilityByDate[entry.date]) {
            availabilityByDate[entry.date] = {};
          }

          for (let hour = entry.start_hour; hour < entry.end_hour; hour++) {
            if (!availabilityByDate[entry.date][hour]) {
              availabilityByDate[entry.date][hour] = new Set();
            }
            availabilityByDate[entry.date][hour].add(entry.user_id);
          }
        }

        const commonSlots: TimeSlot[] = [];
        for (const date in availabilityByDate) {
          let startHour: number | null = null;
          for (let hour = 0; hour <= 23; hour++) {
            const participantsForSlot = availabilityByDate[date][hour] || new Set();

            if (participantsForSlot.size === totalParticipants) {
              if (startHour === null) {
                startHour = hour;
              }
            } else {
              if (startHour !== null) {
                commonSlots.push({ date, startHour, endHour: hour });
                startHour = null;
              }
            }
          }
          if (startHour !== null) {
            commonSlots.push({ date, startHour, endHour: 24 });
          }
        }

        setRecommendedSlots(commonSlots);

      } catch (error) {
        console.error("Error fetching or processing availability:", error);
        setRecommendedSlots([]);
      } finally {
        setIsLoading(false);
      }
    };

    findRecommendedTimes();
  }, [eventId, participants]);

  const formatTime = (hour: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}:00 ${ampm}`;
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground mb-4">Recommended Times</h3>
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Calculating best times...</p>
        ) : recommendedSlots.length > 0 ? (
          recommendedSlots.map((slot, index) => (
            <div key={index} className="bg-muted p-2 rounded-md text-sm">
              <p className="font-medium">
                {new Date(slot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <p className="text-muted-foreground">
                {formatTime(slot.startHour)} - {formatTime(slot.endHour)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No common availability found for all participants.
          </p>
        )}
      </div>
    </div>
  );
};

export default RecommendedTimes; 
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from "@/integrations/supabase/types";
import { Participant } from './ParticipantsPopover'; // Assuming the type can be imported

interface RecommendedTimesProps {
  eventId: string;
  participants: Participant[];
  availabilityVersion: number;
}

interface TimeSlot {
  date: string;
  startHour: number;
  endHour: number;
}

interface GroupedSlot {
  startDate: string;
  endDate: string;
  startHour: number;
  endHour: number;
}

const RecommendedTimes: React.FC<RecommendedTimesProps> = ({ eventId, participants, availabilityVersion }) => {
  const [groupedSlots, setGroupedSlots] = useState<GroupedSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const findRecommendedTimes = async () => {
      if (!eventId || participants.length === 0) {
        setGroupedSlots([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data: availabilityData, error } = await supabase
          .from('availability')
          .select('user_id, date, start_hour, end_hour, name')
          .eq('event_id', eventId);

        if (error) throw error;

        const totalParticipants = participants.length;
        if (totalParticipants === 0) {
          setGroupedSlots([]);
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
        const sortedDates = Object.keys(availabilityByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        for (const date of sortedDates) {
          let startHour: number | null = null;
          for (let hour = 8; hour <= 23; hour++) {
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

        if (commonSlots.length === 0) {
          setGroupedSlots([]);
        } else {
          const newGroupedSlots: GroupedSlot[] = [];
          let currentGroup = {
            startDate: commonSlots[0].date,
            endDate: commonSlots[0].date,
            startHour: commonSlots[0].startHour,
            endHour: commonSlots[0].endHour,
          };

          for (let i = 1; i < commonSlots.length; i++) {
            const currentSlot = commonSlots[i];
            const prevGroupEndDate = new Date(currentGroup.endDate + 'T00:00:00');
            const currentDate = new Date(currentSlot.date + 'T00:00:00');
            const dayDifference = (currentDate.getTime() - prevGroupEndDate.getTime()) / (1000 * 60 * 60 * 24);
            const isSameTime = currentSlot.startHour === currentGroup.startHour && currentSlot.endHour === currentGroup.endHour;

            if (dayDifference === 1 && isSameTime) {
              currentGroup.endDate = currentSlot.date;
            } else {
              newGroupedSlots.push(currentGroup);
              currentGroup = {
                startDate: currentSlot.date,
                endDate: currentSlot.date,
                startHour: currentSlot.startHour,
                endHour: currentSlot.endHour,
              };
            }
          }
          newGroupedSlots.push(currentGroup);
          setGroupedSlots(newGroupedSlots);
        }

      } catch (error) {
        console.error("Error fetching or processing availability:", error);
        setGroupedSlots([]);
      } finally {
        setIsLoading(false);
      }
    };

    findRecommendedTimes();
  }, [eventId, participants, availabilityVersion]);

  const formatTime = (hour: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}:00 ${ampm}`;
  }

  const formatDateRange = (startDateStr: string, endDateStr: string) => {
    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T00:00:00');

    const singleDateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };

    if (startDateStr === endDateStr) {
      return startDate.toLocaleDateString('en-US', singleDateOptions);
    }

    const rangeStartOptions: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };
    let rangeEndOptions: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric' };

    if (startDate.getMonth() !== endDate.getMonth()) {
      rangeEndOptions = { weekday: 'long', month: 'short', day: 'numeric' };
    }

    return `${startDate.toLocaleDateString('en-US', rangeStartOptions)} - ${endDate.toLocaleDateString('en-US', rangeEndOptions)}`;
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold text-foreground mb-4">Recommended Times</h3>
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Calculating best times...</p>
        ) : groupedSlots.length > 0 ? (
          groupedSlots.map((slot, index) => (
            <div key={index} className="bg-muted p-2 rounded-md text-sm">
              <p className="font-medium">
                {formatDateRange(slot.startDate, slot.endDate)}
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
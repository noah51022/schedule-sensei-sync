import { Calendar, Users, MessageCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface CalendarHeaderProps {
  selectedRange: string;
  participantCount: number;
  onRangeClick: () => void;
}

export const CalendarHeader = ({
  selectedRange,
  participantCount,
  onRangeClick
}: CalendarHeaderProps) => {
  const { signOut, user } = useAuth();

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-dashed"
            onClick={onRangeClick}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {selectedRange}
          </Button>
          <div className="text-sm text-muted-foreground">
            {participantCount} participant{participantCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
};
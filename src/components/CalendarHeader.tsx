import { Calendar, Users, MessageCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface CalendarHeaderProps {
  selectedRange: string;
  participantCount: number;
  onRangeClick: () => void;
}

export const CalendarHeader = ({ selectedRange, participantCount, onRangeClick }: CalendarHeaderProps) => {
  const { signOut, user } = useAuth();

  return (
    <div className="flex items-center justify-between p-6 border-b border-border bg-card">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Schedule Sync</h1>
        </div>
        <div className="hidden md:flex items-center space-x-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="text-sm">{participantCount} participants</span>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          onClick={onRangeClick}
          className="flex items-center space-x-2"
        >
          <Calendar className="h-4 w-4" />
          <span className="hidden sm:inline">{selectedRange}</span>
        </Button>
        <Button
          variant="outline"
          onClick={signOut}
          className="flex items-center space-x-2"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </div>
  );
};
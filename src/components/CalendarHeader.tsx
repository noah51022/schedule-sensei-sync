import { Calendar as CalendarIcon, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ParticipantsPopover, Participant } from './ParticipantsPopover';

interface CalendarHeaderProps {
  selectedRange: string;
  onRangeClick: () => void;
  participants: Participant[];
}

export function CalendarHeader({ selectedRange, onRangeClick, participants }: CalendarHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 py-4">
      <div className="flex items-center gap-4">
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={onRangeClick}>
          <CalendarIcon className="h-4 w-4" />
          <span className="text-sm font-medium">{selectedRange}</span>
        </Button>
        <ParticipantsPopover participants={participants}>
          <Button size="sm" variant="ghost" className="h-8 gap-1">
            <span className="text-sm font-medium">{participants.length} {participants.length === 1 ? 'participant' : 'participants'}</span>
          </Button>
        </ParticipantsPopover>
      </div>
      <div>
        {user ? (
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign Out
            <LogOut className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/auth")}
          >
            Sign In
          </Button>
        )}
      </div>
    </header>
  );
}
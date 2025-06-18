import { Calendar, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface CalendarHeaderProps {
  selectedRange: string;
  participantCount: number;
  onRangeClick: () => void;
}

export const CalendarHeader = ({
  selectedRange,
  participantCount,
  onRangeClick,
}: CalendarHeaderProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="border-b">
      <div className="flex h-16 items-center justify-between px-4 max-w-7xl mx-auto">
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
            {participantCount} participant{participantCount !== 1 ? "s" : ""}
          </div>
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
      </div>
    </div>
  );
};
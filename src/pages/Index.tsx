import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarHeader } from "@/components/CalendarHeader";
import { CalendarView } from "@/components/CalendarView";
import { AvailabilityGrid } from "@/components/AvailabilityGrid";
import { ChatInterface } from "@/components/ChatInterface";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

// Mock data for demonstration
const mockTimeSlots = [
  { hour: 9, available: 8, total: 10 },
  { hour: 10, available: 7, total: 10 },
  { hour: 11, available: 9, total: 10 },
  { hour: 12, available: 5, total: 10 },
  { hour: 13, available: 6, total: 10 },
  { hour: 14, available: 10, total: 10 },
  { hour: 15, available: 8, total: 10 },
  { hour: 16, available: 7, total: 10 },
  { hour: 17, available: 9, total: 10 },
  { hour: 18, available: 6, total: 10 },
  { hour: 19, available: 10, total: 10 },
  { hour: 20, available: 5, total: 10 },
];

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date('2025-06-21'));
  const [dateRange] = useState({
    start: new Date('2025-06-20'),
    end: new Date('2025-06-25')
  });
  const [participantCount] = useState(10);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  const handleAvailabilityUpdate = (availability: string) => {
    console.log('New availability input:', availability);
    // This will be connected to AI parsing later
  };

  const formatDateRange = () => {
    return `${dateRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${dateRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between p-6 border-b border-border bg-card">
        <CalendarHeader
          selectedRange={formatDateRange()}
          participantCount={participantCount}
          onRangeClick={() => console.log('Range selection clicked')}
        />
        <Button variant="outline" onClick={handleSignOut} className="flex items-center space-x-2">
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto">
        {/* Calendar Section */}
        <div className="lg:col-span-1">
          <CalendarView
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            dateRange={dateRange}
          />
        </div>

        {/* Availability Grid */}
        <div className="lg:col-span-1">
          <AvailabilityGrid
            selectedDate={selectedDate}
            timeSlots={mockTimeSlots}
          />
        </div>

        {/* Chat Interface */}
        <div className="lg:col-span-1 h-[600px]">
          <ChatInterface onAvailabilityUpdate={handleAvailabilityUpdate} />
        </div>
      </div>

      {/* Info Section */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-3">Next Steps</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-medium text-foreground">🤖 AI Integration</h4>
              <p className="text-muted-foreground">
                Connect to Supabase to enable LLM-powered natural language parsing with Grok 3 or other AI models.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-foreground">📅 Export Features</h4>
              <p className="text-muted-foreground">
                Add iCalendar export functionality for confirmed events and calendar integration.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-foreground">👥 User Management</h4>
              <p className="text-muted-foreground">
                Implement user authentication and session management for up to 10 participants.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-foreground">🔄 Real-time Sync</h4>
              <p className="text-muted-foreground">
                Add real-time updates when participants share their availability.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
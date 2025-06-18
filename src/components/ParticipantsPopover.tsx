import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export type Participant = {
  id: string;
  display_name: string | null;
  // In a real app, you might have an avatar_url as well
  // avatar_url: string | null;
};

interface ParticipantsPopoverProps {
  participants: Participant[];
  children: React.ReactNode;
}

export function ParticipantsPopover({ participants, children }: ParticipantsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <p className="text-sm font-medium leading-none">
              {participants.length} {participants.length === 1 ? 'Participant' : 'Participants'}
            </p>
          </div>
          <div className="space-y-2">
            {participants.length > 0 ? (
              participants.map((p) => (
                <div key={p.id} className="flex items-center space-x-2">
                  <Avatar className="h-8 w-8">
                    {/* Placeholder for avatar image if you add it */}
                    {/* <AvatarImage src={p.avatar_url || undefined} alt={p.display_name || 'User'} /> */}
                    <AvatarFallback>
                      {p.display_name ? p.display_name.charAt(0).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{p.display_name || 'Anonymous User'}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No one has added their availability yet.</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
} 
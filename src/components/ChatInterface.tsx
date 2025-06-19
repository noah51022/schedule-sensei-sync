import { useState, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  role: 'user' | 'assistant';
}

interface DailyAvailability {
  date: string;
  slots: { start_hour: number; end_hour: number }[];
}

interface ChatInterfaceProps {
  onAvailabilityUpdate: (availability: string) => Promise<{ success: boolean; dates?: DailyAvailability[]; action?: 'add' | 'remove'; error?: string }>;
  selectedDate: Date;
}

export const ChatInterface = ({ onAvailabilityUpdate, selectedDate }: ChatInterfaceProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      text: `Hi! I'm your scheduling assistant. Tell me about your availability for ${selectedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      })} and I'll help you add it to your calendar. Try something like "I'm free from 9 AM to 5 PM" or "Available 2-4 PM and 6-8 PM".`,
      sender: 'bot',
      timestamp: new Date(),
      role: 'assistant'
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Update welcome message when selected date changes
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        text: `Hi! I'm your scheduling assistant. Tell me about your availability for ${selectedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric'
        })} and I'll help you add it to your calendar. Try something like "I'm free from 9 AM to 5 PM" or "Available 2-4 PM and 6-8 PM".`,
        sender: 'bot',
        timestamp: new Date(),
        role: 'assistant'
      }
    ]);
  }, [selectedDate]);

  const handleSendMessage = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to chat with the assistant.",
        variant: "destructive",
      });
      return;
    }

    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
      role: 'user'
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText("");
    setIsLoading(true);

    try {
      // Call the availability update function which uses the edge function
      const result = await onAvailabilityUpdate(currentInput);

      let botResponseText: string;

      if (result.success && result.dates) {
        if (result.dates.length === 0) {
          botResponseText = "I couldn't identify any specific dates or times in your message. Please try again, for example: 'I'm free on Monday from 10am to 2pm'.";
        } else {
          const { action, dates } = result;
          const verb = action === 'remove' ? 'removed' : 'added';
          const preposition = action === 'remove' ? 'from' : 'to';

          if (dates.length > 1) {
            const firstDay = new Date(dates[0].date + 'T00:00:00');
            const lastDay = new Date(dates[dates.length - 1].date + 'T00:00:00');
            const formattedSlots = dates[0].slots.map(slot => {
              if (slot.start_hour === 0 && slot.end_hour === 24) return "all day";
              const startTime = new Date();
              startTime.setHours(slot.start_hour, 0, 0, 0);
              const endTime = new Date();
              endTime.setHours(slot.end_hour, 0, 0, 0);
              return `${startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
            }).join(', ');

            botResponseText = `Perfect! I've ${verb} your availability from ${firstDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} for ${formattedSlots}. Is there anything else?`;
          } else {
            const day = new Date(dates[0].date + 'T00:00:00');
            const formattedSlots = dates[0].slots.map(slot => {
              if (slot.start_hour === 0 && slot.end_hour === 24) return "all day";
              const startTime = new Date();
              startTime.setHours(slot.start_hour, 0, 0, 0);
              const endTime = new Date();
              endTime.setHours(slot.end_hour, 0, 0, 0);
              return `${startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
            }).join(', ');

            botResponseText = `Perfect! I've ${verb} your availability for ${day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}: ${formattedSlots}. Is there anything else you'd like to change?`;
          }
        }
      } else {
        botResponseText = result.error || "I had trouble understanding that. Could you please try again with a specific time range? For example: 'I'm free from 9 AM to 5 PM' or '2-4 PM and 6-8 PM'";
      }

      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: botResponseText,
        sender: 'bot',
        timestamp: new Date(),
        role: 'assistant'
      };

      setMessages(prev => [...prev, botResponse]);
    } catch (error) {
      console.error('Error in chat:', error);
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I encountered an error while processing your request. Please try again.",
        sender: 'bot',
        timestamp: new Date(),
        role: 'assistant'
      };
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isChatDisabled = isLoading || !user;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-foreground flex items-center space-x-2">
          <Bot className="h-5 w-5 text-primary" />
          <span>Schedule Assistant</span>
        </h3>
        <p className="text-sm text-muted-foreground">Share your availability in natural language</p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center text-muted-foreground py-8">
              <p>Start a conversation by sharing your availability.</p>
              <p className="text-sm mt-2">Example: "I'm free Monday 9 AM - 5 PM"</p>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start space-x-3 ${message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
            >
              <div className={`p-2 rounded-full ${message.sender === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
                }`}>
                {message.sender === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div className={`max-w-[80%] ${message.sender === 'user' ? 'text-right' : 'text-left'
                }`}>
                <div className={`p-3 rounded-lg ${message.sender === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
                  }`}>
                  <p className="text-sm">{message.text}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border">
        <div className="flex space-x-2">
          <Input
            placeholder={user ? "e.g., I'm free Saturday 2-5 PM..." : "Please sign in to use the chat"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={isChatDisabled}
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            disabled={isChatDisabled}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Try: "I'm available Monday 9 AM - 5 PM" or "Busy Tuesday afternoon"
        </p>
      </div>
    </div>
  );
};
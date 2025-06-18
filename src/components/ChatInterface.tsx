import { useState } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  role: 'user' | 'assistant';
}

interface ChatInterfaceProps {
  onAvailabilityUpdate: (availability: string) => void;
}

export const ChatInterface = ({ onAvailabilityUpdate }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
      role: 'user'
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      // First, try to update availability
      await onAvailabilityUpdate(inputText);

      // Add a success message
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: "I've updated your availability. Is there anything else you'd like to share?",
        sender: 'bot',
        timestamp: new Date(),
        role: 'assistant'
      };
      setMessages(prev => [...prev, botResponse]);
    } catch (error) {
      console.error('Error updating availability:', error);
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: "I had trouble understanding that time slot. Could you please try again with a specific time range? For example: 'I'm free from 9 AM to 5 PM' or '2-4 PM and 6-8 PM'",
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
            placeholder="e.g., I'm free Saturday 2-5 PM..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            disabled={isLoading}
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
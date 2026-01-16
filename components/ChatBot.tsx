import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X, Minimize2, Maximize2, Loader2, Bot, User } from 'lucide-react';
import { NeoButton, NeoCard } from './NeoUi';
import { chatWithGemini } from '../services/geminiService';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface ChatBotProps {
  transcriptContext: string;
}

export const ChatBot: React.FC<ChatBotProps> = ({ transcriptContext }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleChat = () => setIsOpen(!isOpen);
  const toggleMinimize = () => setIsMinimized(!isMinimized);

  useEffect(() => {
    if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMsg = inputValue;
    setInputValue('');
    const newHistory = [...messages, { role: 'user' as const, text: userMsg }];
    setMessages(newHistory);
    setIsLoading(true);

    try {
        // Format history for API
        const apiHistory = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

        const response = await chatWithGemini(apiHistory, userMsg, transcriptContext);
        setMessages([...newHistory, { role: 'model', text: response }]);
    } catch (e) {
        setMessages([...newHistory, { role: 'model', text: "Error: Could not connect to Gemini." }]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={toggleChat}
        className="fixed bottom-6 right-6 w-16 h-16 bg-neo-pink border-2 border-black dark:border-white shadow-neo dark:shadow-neo-white flex items-center justify-center rounded-full z-40 hover:scale-105 transition-transform"
      >
        <MessageCircle size={32} fill="white" className="text-black" />
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 z-40 transition-all duration-300 ${isMinimized ? 'w-72 h-auto' : 'w-80 md:w-96 h-[500px]'}`}>
      <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border-white shadow-neo-lg dark:shadow-neo-lg-white h-full flex flex-col text-black dark:text-white">
        {/* Header */}
        <div className="bg-neo-black text-white p-3 flex justify-between items-center border-b-2 border-black dark:border-white cursor-pointer" onClick={toggleMinimize}>
            <div className="flex items-center gap-2">
                <Bot size={20} className="text-neo-green" />
                <span className="font-bold uppercase tracking-wider">AI Assistant</span>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); toggleMinimize(); }} className="hover:text-neo-yellow">
                    {isMinimized ? <Maximize2 size={16}/> : <Minimize2 size={16}/>}
                </button>
                <button onClick={(e) => { e.stopPropagation(); toggleChat(); }} className="hover:text-neo-pink">
                    <X size={18} />
                </button>
            </div>
        </div>

        {/* Body */}
        {!isMinimized && (
            <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-zinc-900">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-400 text-sm mt-8">
                            <p className="mb-2">👋 Hi! I'm Gemini.</p>
                            <p>Ask me anything about your transcript or video.</p>
                        </div>
                    )}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-3 border-2 border-black dark:border-white shadow-sm text-sm ${
                                msg.role === 'user' 
                                ? 'bg-neo-blue text-white rounded-tl-xl rounded-tr-xl rounded-bl-xl dark:border-white' 
                                : 'bg-white dark:bg-zinc-800 text-black dark:text-white rounded-tr-xl rounded-br-xl rounded-bl-xl'
                            }`}>
                                <div className="flex items-center gap-1 mb-1 opacity-70 text-[10px] font-bold uppercase">
                                    {msg.role === 'user' ? <User size={10}/> : <Bot size={10}/>}
                                    {msg.role === 'user' ? 'You' : 'Gemini'}
                                </div>
                                <div className="whitespace-pre-wrap">{msg.text}</div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white dark:bg-zinc-800 p-3 border-2 border-black dark:border-white rounded-xl">
                                <Loader2 className="animate-spin w-4 h-4 dark:text-white" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Footer */}
                <div className="p-3 bg-white dark:bg-neo-dark-card border-t-2 border-black dark:border-white">
                    <div className="relative">
                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask Gemini..."
                            className="w-full pl-3 pr-10 py-2 bg-gray-100 dark:bg-zinc-800 border-2 border-black dark:border-white focus:outline-none focus:bg-white dark:focus:bg-zinc-700 resize-none text-sm h-10 min-h-[40px] max-h-24 placeholder:text-gray-400 dark:text-white"
                        />
                        <button 
                            onClick={handleSend}
                            disabled={isLoading || !inputValue.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-black dark:text-white hover:text-neo-blue dark:hover:text-neo-blue disabled:opacity-30"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
};
import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { NeoButton, NeoCard } from './NeoUi';

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  isProcessing: boolean;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecordingComplete, isProcessing }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Fix: Use the actual mime type of the recording, default to webm if missing
        const type = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        onRecordingComplete(blob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
      
      timerRef.current = window.setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please grant permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  return (
    <NeoCard className="w-full max-w-md mx-auto text-center space-y-4 bg-white dark:bg-neo-dark-card text-black dark:text-white">
      <h2 className="text-2xl font-black uppercase border-b-2 border-black dark:border-white pb-2 mb-4">Record Audio</h2>
      
      <div className="text-6xl font-mono font-bold my-8 tabular-nums">
        {Math.floor(duration / 60).toString().padStart(2, '0')}:
        {(duration % 60).toString().padStart(2, '0')}
      </div>

      <div className="flex justify-center gap-4">
        {!isRecording ? (
          <NeoButton 
            onClick={startRecording} 
            variant="primary"
            disabled={isProcessing}
            className="flex items-center gap-2 w-full justify-center"
          >
             {isProcessing ? <Loader2 className="animate-spin" /> : <Mic />}
             {isProcessing ? 'Processing...' : 'Start Record'}
          </NeoButton>
        ) : (
          <NeoButton 
            onClick={stopRecording} 
            variant="danger"
            className="flex items-center gap-2 w-full justify-center animate-pulse"
          >
            <Square fill="currentColor" /> Stop
          </NeoButton>
        )}
      </div>
      
      {isProcessing && (
         <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-2 uppercase tracking-widest">
            AI is Transcribing...
         </div>
      )}
    </NeoCard>
  );
};
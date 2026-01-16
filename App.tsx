import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Bookmark, Scissors, Download, RotateCcw, FastForward, Upload, Loader2, XCircle, Video, FileAudio, ScanEye } from 'lucide-react';
import { AudioRecorder } from './components/AudioRecorder';
import { LinkImporter } from './components/LinkImporter';
import { NeoButton, NeoCard, NeoBadge, NeoProgressBar, NeoModal } from './components/NeoUi';
import { Header } from './components/Header';
import { LoginPage } from './components/LoginPage';
import { ChatBot } from './components/ChatBot';
import { ThemeToggle } from './components/ThemeToggle';
import { transcribeAudio, analyzeVideoFrames } from './services/geminiService';
import { TranscriptData, PlaybackSpeed, Bookmark as BookmarkType, User, Project } from './types';
import { blobToBase64, formatTime, sliceAudioBuffer, resampleAndSliceAudio } from './utils/audioUtils';
import { extractVideoFrames } from './utils/videoUtils';
import { initGoogleServices, handleGoogleLogin, saveToDrive, listDriveProjects, loadFromDrive } from './services/driveService';

const CHUNK_DURATION = 600; // 10 minutes

const App: React.FC = () => {
  // --- Global State ---
  const [user, setUser] = useState<User | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [view, setView] = useState<'login' | 'workspace'>('login');
  
  // --- Workspace State ---
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'audio' | 'video'>('audio');
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(PlaybackSpeed.Normal);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState("");
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [selectedSegmentIndices, setSelectedSegmentIndices] = useState<Set<number>>(new Set());

  // --- AI Analysis State ---
  const [isVideoAnalyzing, setIsVideoAnalyzing] = useState(false);
  const [videoAnalysisResult, setVideoAnalysisResult] = useState<string | null>(null);

  // Use a generic media element ref
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptHoverRef = useRef(false);

  // --- Initialization ---
  useEffect(() => {
    // Load recents from local storage
    const savedRecents = localStorage.getItem('neo_recents');
    if (savedRecents) {
      setRecentProjects(JSON.parse(savedRecents));
    }

    // Init Google Scripts
    initGoogleServices().catch(console.error);

    // Cleanup AudioContext on unmount
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Update Recents helper
  const addToRecents = (proj: Project) => {
    const updated = [proj, ...recentProjects.filter(p => p.id !== proj.id)].slice(0, 10);
    setRecentProjects(updated);
    localStorage.setItem('neo_recents', JSON.stringify(updated));
  };

  // --- Auth Handlers ---
  const handleLogin = async () => {
    try {
      const u = await handleGoogleLogin();
      setUser(u);
      setView('workspace');
    } catch (e) {
      console.error("Login failed", e);
      alert("Login failed. Check console for details.");
    }
  };

  const handleGuest = () => {
    setView('workspace');
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentProject(null);
    setAudioUrl(null);
    setTranscript(null);
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    setView('login');
  };

  // --- Project Management ---
  const handleNewProject = () => {
    if (confirm("Create new project? Unsaved changes will be lost.")) {
       setAudioUrl(null);
       setTranscript(null);
       setBookmarks([]);
       setCurrentProject(null);
       if (audioContextRef.current) {
           audioContextRef.current.close();
           audioContextRef.current = null;
       }
    }
  };

  const handleSave = async () => {
    if (!transcript) {
        alert("Nothing to save!");
        return;
    }

    const projData: Project = {
        id: currentProject?.id || `local_${Date.now()}`,
        name: currentProject?.name || `Project ${new Date().toLocaleString()}`,
        lastModified: Date.now(),
        transcript: transcript,
        bookmarks: bookmarks,
        mediaType: mediaType,
        sourceType: user && currentProject?.sourceType === 'drive' ? 'drive' : 'local'
    };

    if (projData.sourceType === 'drive' && user?.accessToken) {
        // Save to Drive
        try {
            const driveId = await saveToDrive(projData, user.accessToken);
            const updatedProj = { ...projData, id: driveId };
            setCurrentProject(updatedProj);
            addToRecents(updatedProj);
            alert("Saved to Google Drive!");
        } catch (e) {
            console.error(e);
            alert("Failed to save to Drive.");
        }
    } else {
        // Save Local (Download JSON)
        const blob = new Blob([JSON.stringify(projData)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${projData.name}.neoscriber`;
        a.click();
        
        setCurrentProject(projData);
        addToRecents(projData);
    }
  };

  const handleOpenLocal = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.neoscriber';
      input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          try {
              const text = await file.text();
              const proj = JSON.parse(text) as Project;
              loadProject(proj);
          } catch (err) {
              alert("Invalid project file");
          }
      };
      input.click();
  };

  const handleOpenDrive = async () => {
      if (!user?.accessToken) return;
      try {
          const files = await listDriveProjects(user.accessToken);
          if (files.length === 0) {
              alert("No .neoscriber files found in Drive.");
              return;
          }
          const choice = prompt("Enter File Index to load:\n" + files.map((f, i) => `${i}: ${f.name}`).join("\n"));
          if (choice && files[parseInt(choice)]) {
             const fileId = files[parseInt(choice)].id;
             const proj = await loadFromDrive(fileId, user.accessToken);
             loadProject({ ...proj, sourceType: 'drive' });
          }
      } catch (e) {
          console.error(e);
          alert("Error accessing Drive");
      }
  };

  const loadProject = (proj: Project) => {
      setTranscript(proj.transcript);
      setBookmarks(proj.bookmarks);
      setMediaType(proj.mediaType);
      setCurrentProject(proj);
      addToRecents(proj);
      setAudioUrl(null); 
      alert(`Project "${proj.name}" loaded.\nPlease re-upload or link matching ${proj.mediaType} to continue.`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const type = file.type.startsWith('video/') ? 'video' : 'audio';
      setMediaType(type);
      
      if (!currentProject) {
          setCurrentProject({
              id: `local_${Date.now()}`,
              name: file.name,
              lastModified: Date.now(),
              transcript: null,
              bookmarks: [],
              mediaType: type,
              sourceType: 'local'
          });
      }
      
      await processAudioBlob(file);
    }
  };

  const handleLinkImport = async (url: string) => {
    setIsProcessing(true);
    setProcessingStatus("Connecting to URL...");
    setProcessingProgress(10);

    try {
      const fetchUrl = url;
      setProcessingStatus(`Fetching media from: ${url.split('/')[2]}...`);
      
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}. Note: Social media links often require a specialized extractor or proxy due to security policies.`);
      }

      const contentType = response.headers.get('Content-Type') || '';
      const type = contentType.includes('video') ? 'video' : 'audio';
      setMediaType(type);

      const blob = await response.blob();
      
      if (!currentProject) {
          setCurrentProject({
              id: `remote_${Date.now()}`,
              name: url.split('/').pop()?.split('?')[0] || "Imported Project",
              lastModified: Date.now(),
              transcript: null,
              bookmarks: [],
              mediaType: type,
              sourceType: 'local'
          });
      }

      await processAudioBlob(blob);
    } catch (e: any) {
      console.error("Link import failed", e);
      setIsProcessing(false);
      alert(`Import failed: ${e.message}\n\nTip: For YouTube or Social Media, the browser's security blocks direct access. This tool works best with direct links to .mp4, .mp3, or .m4a files.`);
    }
  };

  const stopProcessing = () => {
      if (abortController) {
          abortController.abort();
          setAbortController(null);
      }
      setIsProcessing(false);
      setProcessingStatus("Stopped by user");
  };

  const processAudioBlob = async (blob: Blob) => {
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStatus("Initializing Engine...");
    setAudioUrl(URL.createObjectURL(blob));
    if (!transcript) {
        setTranscript({ segments: [] });
    }
    
    const isRelinking = transcript && transcript.segments.length > 0;
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const arrayBuffer = await blob.arrayBuffer();
      if (controller.signal.aborted) return;

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      setProcessingStatus("Decoding media track...");
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = context;

      const decodedBuffer = await context.decodeAudioData(arrayBuffer);
      
      audioBufferRef.current = decodedBuffer;
      setDuration(decodedBuffer.duration);

      if (isRelinking) {
           setIsProcessing(false);
           setProcessingStatus("Media linked.");
           return;
      }

      const totalChunks = Math.ceil(decodedBuffer.duration / CHUNK_DURATION);
      let currentSegments: any[] = [];

      for (let i = 0; i < totalChunks; i++) {
        if (controller.signal.aborted) break;
        const startTime = i * CHUNK_DURATION;
        const endTime = Math.min((i + 1) * CHUNK_DURATION, decodedBuffer.duration);
        
        setProcessingStatus(`Transcribing part ${i + 1} of ${totalChunks}...`);
        setProcessingProgress(((i) / totalChunks) * 100);

        try {
            const chunkBlob = await resampleAndSliceAudio(decodedBuffer, startTime, endTime);
            const base64 = await blobToBase64(chunkBlob);
            if (controller.signal.aborted) break;
            const result = await transcribeAudio(base64);
            const adjustedSegments = result.segments.map(s => ({
                ...s,
                start: s.start + startTime,
                end: s.end + startTime
            }));
            currentSegments = [...currentSegments, ...adjustedSegments];
            setTranscript({ segments: currentSegments });
        } catch (chunkError) {
            console.error(`Error processing chunk ${i + 1}`, chunkError);
            setProcessingStatus(`Error in part ${i+1}. Skipping segment.`);
            currentSegments.push({
                start: startTime,
                end: endTime,
                text: `[TRANSCRIPTION FAILED FOR THIS SEGMENT: ${formatTime(startTime)} - ${formatTime(endTime)}]`
            });
            setTranscript({ segments: currentSegments });
        }
      }

      if (!controller.signal.aborted) {
          setProcessingProgress(100);
          setProcessingStatus("Complete");
          setTimeout(() => setIsProcessing(false), 500);
      }
    } catch (e: any) {
      console.error("Processing failed", e);
      let msg = "Error processing file.";
      if (e.message && (e.message.toLowerCase().includes("decode") || e.message.toLowerCase().includes("encoding"))) {
          msg = "Unable to decode audio data. Link content may be inaccessible.";
      }
      setProcessingStatus(msg);
    } finally {
        setAbortController(null);
    }
  };

  const handleAnalyzeVideo = async () => {
      if (mediaType !== 'video' || !mediaRef.current) return;
      const videoEl = mediaRef.current as HTMLVideoElement;
      
      setIsVideoAnalyzing(true);
      try {
          const frames = await extractVideoFrames(videoEl, 5);
          if (frames.length === 0) throw new Error("Could not extract frames");
          const result = await analyzeVideoFrames(frames);
          setVideoAnalysisResult(result);
      } catch (e) {
          console.error(e);
          alert("Failed to analyze video.");
      } finally {
          setIsVideoAnalyzing(false);
      }
  };

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      const time = mediaRef.current.currentTime;
      setCurrentTime(time);
      if (transcript && !transcriptHoverRef.current) {
         const activeIndex = transcript.segments.findIndex(s => time >= s.start && time <= s.end);
         if (activeIndex !== -1) {
             const el = document.getElementById(`seg-${activeIndex}`);
             if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
         }
      }
    }
  };

  const changeSpeed = () => {
    const speeds = [1, 1.5, 2, 3];
    const nextSpeed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(nextSpeed);
    if (mediaRef.current) mediaRef.current.playbackRate = nextSpeed;
  };

  const addBookmark = () => {
    const newBookmark: BookmarkType = {
      id: Date.now().toString(),
      timestamp: currentTime,
      note: `Bookmark at ${formatTime(currentTime)}`,
      createdAt: new Date().toISOString(),
    };
    setBookmarks([...bookmarks, newBookmark]);
  };

  const toggleSegmentSelection = (index: number) => {
    const newSet = new Set(selectedSegmentIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedSegmentIndices(newSet);
  };

  const handleCutExport = async () => {
    if (selectedSegmentIndices.size === 0 || !audioBufferRef.current || !audioContextRef.current || !transcript) return;
    const sortedIndices = Array.from(selectedSegmentIndices).sort((a: number, b: number) => a - b);
    const startIdx = sortedIndices[0];
    const endIdx = sortedIndices[sortedIndices.length - 1];
    const transcriptStart = transcript.segments[startIdx].start;
    const transcriptEnd = transcript.segments[endIdx].end;

    try {
        const wavBlob = sliceAudioBuffer(audioBufferRef.current, transcriptStart, transcriptEnd, audioContextRef.current);
        const audioLink = document.createElement('a');
        audioLink.href = URL.createObjectURL(wavBlob);
        audioLink.download = `clip_${formatTime(transcriptStart)}.wav`;
        audioLink.click();
    } catch (e) {
        alert("Failed to create clip.");
    }
  };
  
  const downloadFullTranscript = () => {
      if (!transcript || transcript.segments.length === 0) return;
      const textContent = transcript.segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n');
      const textBlob = new Blob([textContent], { type: 'text/plain' });
      const textLink = document.createElement('a');
      textLink.href = URL.createObjectURL(textBlob);
      textLink.download = `transcript_${currentProject?.name || 'export'}.txt`;
      textLink.click();
  };

  if (view === 'login') {
      return (
        <>
            <LoginPage onLoginGoogle={handleLogin} onGuest={handleGuest} />
            <ThemeToggle />
        </>
      );
  }

  const getTranscriptText = () => {
      if (!transcript) return "";
      return transcript.segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join("\n");
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] dark:bg-neo-dark text-black dark:text-white pb-32 transition-colors duration-200">
      <Header 
        user={user}
        currentProject={currentProject}
        onLogin={() => setView('login')}
        onLogout={handleLogout}
        onNew={handleNewProject}
        onSave={handleSave}
        onSaveAs={handleSave}
        onOpenLocal={handleOpenLocal}
        onOpenDrive={handleOpenDrive}
        recentProjects={recentProjects}
        onOpenRecent={(p) => loadProject(p)}
      />

      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        {!audioUrl ? (
            <div className="flex flex-col items-center justify-center h-auto min-h-[50vh]">
                {transcript ? (
                    <NeoCard className="text-center p-8 bg-neo-yellow dark:bg-neo-yellow text-black dark:text-black">
                        <h2 className="text-2xl font-black mb-4 text-black">Project Loaded</h2>
                        <p className="mb-6 font-mono text-black">Re-upload or paste link to continue.</p>
                        <div className="flex flex-col md:flex-row gap-4 justify-center">
                            <label className="cursor-pointer">
                                <input type="file" accept="audio/*,video/*" className="hidden" onChange={handleFileUpload} />
                                <div className="bg-white hover:bg-gray-50 text-black border-2 border-black shadow-neo px-6 py-3 font-bold flex items-center justify-center gap-2">
                                    <Upload size={20} /> Select File
                                </div>
                            </label>
                            <NeoButton variant="secondary" onClick={() => setTranscript(null)} className="px-6 py-3">Clear Project</NeoButton>
                        </div>
                    </NeoCard>
                ) : (
                    <div className="flex flex-col items-center w-full max-w-2xl">
                        <AudioRecorder onRecordingComplete={processAudioBlob} isProcessing={isProcessing} />
                        
                        <div className="my-8 flex items-center gap-4 w-full px-4 text-gray-400 dark:text-gray-500">
                            <div className="h-0.5 bg-black/10 dark:bg-white/10 flex-1"></div>
                            <span className="font-black text-xs uppercase tracking-widest">Methods</span>
                            <div className="h-0.5 bg-black/10 dark:bg-white/10 flex-1"></div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full px-4">
                            {/* Method 1: Upload */}
                            <label className="cursor-pointer group">
                                <input type="file" accept="audio/*,video/*" className="hidden" onChange={handleFileUpload} />
                                <NeoCard className="h-full flex flex-col items-center justify-center gap-4 py-8 bg-white dark:bg-neo-dark-card hover:bg-neo-yellow dark:hover:bg-neo-yellow group-hover:-translate-y-1 group-active:translate-y-0 transition-all cursor-pointer group-hover:text-black">
                                    <Upload size={32} className="text-neo-pink" />
                                    <span className="font-black uppercase tracking-wider text-sm">Upload Local File</span>
                                    <p className="text-[10px] opacity-60 text-center font-bold">WAV, MP3, MP4, MOV</p>
                                </NeoCard>
                            </label>

                            {/* Method 2: Link */}
                            <div className="group">
                                <LinkImporter onImport={handleLinkImport} isProcessing={isProcessing} />
                            </div>
                        </div>

                        <div className="mt-12 text-center text-gray-500 dark:text-gray-400 font-mono text-sm">
                            <div className="flex flex-col gap-1 text-xs">
                                <span className="font-bold text-black bg-neo-green px-2 py-0.5 self-center inline-block transform rotate-1 border border-black shadow-neo-sm">Gemini 3.0 Pro Powered</span>
                                <span className="mt-2 opacity-50">Transcribes, summarizes, and answers questions from your media.</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Controls (Left) */}
                <div className="lg:col-span-1 space-y-6">
                    <NeoCard className="sticky top-24 z-20">
                        <h3 className="font-black text-xl mb-4 uppercase flex items-center gap-2">
                            {mediaType === 'video' ? <Video size={24}/> : <FileAudio size={24}/>}
                            Control Deck
                        </h3>
                        
                        {mediaType === 'video' ? (
                            <div className="relative">
                                <video
                                    ref={mediaRef as React.RefObject<HTMLVideoElement>}
                                    src={audioUrl || ''}
                                    onTimeUpdate={handleTimeUpdate}
                                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                                    onEnded={() => setIsPlaying(false)}
                                    className="w-full border-2 border-black dark:border-white bg-black aspect-video object-contain shadow-neo-sm dark:shadow-neo-sm-white"
                                    onClick={togglePlay}
                                    crossOrigin="anonymous" 
                                />
                            </div>
                        ) : (
                            <audio 
                                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                                src={audioUrl || ''} 
                                onTimeUpdate={handleTimeUpdate}
                                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                                onEnded={() => setIsPlaying(false)}
                                className="hidden"
                            />
                        )}

                        <div 
                            className="w-full h-6 bg-gray-200 dark:bg-zinc-700 border-2 border-black dark:border-white mb-4 relative cursor-pointer group mt-4"
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                if(mediaRef.current) mediaRef.current.currentTime = (x / rect.width) * duration;
                            }}
                        >
                            <div 
                                className="h-full bg-neo-pink border-r-2 border-black dark:border-white transition-all duration-100"
                                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            />
                        </div>
                        
                        <div className="flex justify-between text-xs font-mono font-bold mb-4 opacity-70">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>

                        <div className="flex justify-center gap-4 mb-6">
                            <button onClick={() => { if(mediaRef.current) mediaRef.current.currentTime -= 10; }} className="p-2 border-2 border-black dark:border-white hover:bg-gray-100 dark:hover:bg-zinc-800 shadow-neo-sm dark:shadow-neo-sm-white active:shadow-none transition-all"><RotateCcw size={20} /></button>
                            <button onClick={togglePlay} className="w-16 h-16 flex items-center justify-center bg-neo-yellow border-2 border-black dark:border-white shadow-neo dark:shadow-neo-white rounded-full active:shadow-none active:translate-y-1 transition-all">
                                {isPlaying ? <Pause size={32} fill="black" className="text-black" /> : <Play size={32} fill="black" className="text-black ml-1" />}
                            </button>
                            <button onClick={() => { if(mediaRef.current) mediaRef.current.currentTime += 10; }} className="p-2 border-2 border-black dark:border-white hover:bg-gray-100 dark:hover:bg-zinc-800 shadow-neo-sm dark:shadow-neo-sm-white active:shadow-none transition-all"><FastForward size={20} /></button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <NeoButton variant="secondary" onClick={changeSpeed} className="text-xs py-2">Speed: {speed}x</NeoButton>
                            <NeoButton variant="secondary" onClick={addBookmark} className="text-xs py-2 flex items-center justify-center gap-1"><Bookmark size={14} /> Mark</NeoButton>
                            
                            {mediaType === 'video' && (
                                <NeoButton 
                                    variant="warning" 
                                    onClick={handleAnalyzeVideo} 
                                    disabled={isVideoAnalyzing}
                                    className="text-xs py-2 col-span-2 flex items-center justify-center gap-2"
                                >
                                    {isVideoAnalyzing ? <Loader2 className="animate-spin" size={14}/> : <ScanEye size={14} />}
                                    {isVideoAnalyzing ? 'Analyzing...' : 'Analyze Visuals'}
                                </NeoButton>
                            )}

                            <NeoButton variant="success" disabled={selectedSegmentIndices.size === 0} onClick={handleCutExport} className={`text-xs py-2 col-span-2 flex items-center justify-center gap-2 ${selectedSegmentIndices.size === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <Scissors size={14} /> Export Clip ({selectedSegmentIndices.size})
                            </NeoButton>
                        </div>
                    </NeoCard>

                    {bookmarks.length > 0 && (
                        <NeoCard>
                            <h3 className="font-black text-lg mb-2 uppercase border-b-2 border-black dark:border-white pb-1">Bookmarks</h3>
                            <ul className="space-y-2 max-h-48 overflow-y-auto">
                                {bookmarks.map(bm => (
                                    <li key={bm.id} className="flex justify-between items-center text-sm group">
                                        <span className="font-mono bg-gray-100 dark:bg-zinc-800 px-1 border border-black dark:border-white">{formatTime(bm.timestamp)}</span>
                                        <button onClick={() => { if(mediaRef.current) mediaRef.current.currentTime = bm.timestamp; }} className="text-neo-blue font-bold hover:underline">Jump</button>
                                    </li>
                                ))}
                            </ul>
                        </NeoCard>
                    )}
                </div>

                {/* Transcript (Right) */}
                <div className="lg:col-span-2">
                    <div className="flex justify-between items-end mb-4 gap-4">
                        <h2 className="text-3xl font-black uppercase">Transcript</h2>
                        {(transcript && transcript.segments.length > 0) && (
                            <NeoButton variant="secondary" onClick={downloadFullTranscript} className="text-xs py-1 px-3 flex items-center gap-2">
                                <Download size={16}/> {isProcessing ? 'Save Partial' : 'Download Txt'}
                            </NeoButton>
                        )}
                    </div>
                    
                    {isProcessing && (
                        <div className="mb-4 bg-white dark:bg-zinc-900 border-2 border-black dark:border-white p-4 shadow-neo-sm dark:shadow-neo-sm-white animate-pulse">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2"><Loader2 className="animate-spin" size={18} /><span className="font-bold text-sm uppercase">{processingStatus}</span></div>
                                <button onClick={stopProcessing} className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1"><XCircle size={14}/> STOP</button>
                            </div>
                            <NeoProgressBar progress={processingProgress} />
                        </div>
                    )}
                    
                    {!isProcessing && processingStatus.startsWith("Unable") && (
                        <div className="mb-4 bg-neo-pink text-white border-2 border-black dark:border-white p-4 shadow-neo-sm dark:shadow-neo-sm-white font-bold">
                            {processingStatus}
                        </div>
                    )}

                    <div 
                        className="bg-white dark:bg-neo-dark-card border-4 border-black dark:border-white shadow-neo-lg dark:shadow-neo-lg-white h-[70vh] overflow-y-auto relative transition-colors duration-200"
                        onMouseEnter={() => transcriptHoverRef.current = true}
                        onMouseLeave={() => transcriptHoverRef.current = false}
                        ref={transcriptRef}
                    >
                        {transcript && transcript.segments.length > 0 ? (
                            <div className="p-6 space-y-1">
                                {transcript.segments.map((seg, idx) => {
                                    const isActive = currentTime >= seg.start && currentTime <= seg.end;
                                    const isSelected = selectedSegmentIndices.has(idx);
                                    const isError = seg.text.includes("[TRANSCRIPTION FAILED");
                                    return (
                                        <div 
                                            key={idx}
                                            id={`seg-${idx}`}
                                            onClick={() => !isError && toggleSegmentSelection(idx)}
                                            className={`p-3 transition-colors duration-200 cursor-pointer border-l-4 border-transparent 
                                                ${isActive ? 'bg-neo-yellow text-black border-black dark:border-black' : 'hover:bg-gray-50 dark:hover:bg-zinc-800'} 
                                                ${isSelected ? 'bg-neo-blue/30 border-neo-blue' : ''} 
                                                ${isError ? 'bg-red-50 border-red-500 text-red-600' : ''}`}
                                        >
                                            <div className="flex gap-3">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); if(mediaRef.current) { mediaRef.current.currentTime = seg.start; mediaRef.current.play(); setIsPlaying(true); }}}
                                                    className={`font-mono text-xs font-bold mt-1 shrink-0 ${isActive ? 'text-black/60' : 'text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white'}`}
                                                >
                                                    {formatTime(seg.start)}
                                                </button>
                                                <p className={`text-lg leading-relaxed ${isActive ? 'font-bold' : 'font-medium opacity-90'}`}>{seg.text}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="h-4" />
                            </div>
                        ) : (
                            <div className="p-12 text-center text-gray-400 dark:text-gray-500 font-bold uppercase h-full flex flex-col items-center justify-center">
                                {isProcessing ? <p>Transcription in progress...</p> : <p>No transcript available.</p>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        <NeoModal 
            isOpen={!!videoAnalysisResult} 
            onClose={() => setVideoAnalysisResult(null)}
            title="Video Analysis"
        >
            <div className="whitespace-pre-wrap leading-relaxed">
                {videoAnalysisResult}
            </div>
            <div className="mt-6 flex justify-end">
                <NeoButton onClick={() => setVideoAnalysisResult(null)}>Close</NeoButton>
            </div>
        </NeoModal>

        <ChatBot transcriptContext={getTranscriptText()} />
        <ThemeToggle />
      </main>
    </div>
  );
};

export default App;
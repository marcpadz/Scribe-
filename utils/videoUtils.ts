export const extractVideoFrames = async (videoElement: HTMLVideoElement, count: number = 5): Promise<string[]> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const duration = videoElement.duration;
  const frames: string[] = [];

  if (!ctx) return [];

  // Set canvas dimensions to video dimensions (downscale if too large to save bandwidth)
  const MAX_WIDTH = 640;
  const scale = Math.min(1, MAX_WIDTH / videoElement.videoWidth);
  canvas.width = videoElement.videoWidth * scale;
  canvas.height = videoElement.videoHeight * scale;

  const originalTime = videoElement.currentTime;
  const wasPaused = videoElement.paused;

  // Pause to prevent audio glitches during seeking
  if (!wasPaused) videoElement.pause();

  try {
    for (let i = 0; i < count; i++) {
      // Sample evenly across the video (avoiding very start/end if possible)
      const time = (duration / (count + 1)) * (i + 1);
      videoElement.currentTime = time;
      
      await new Promise<void>(resolve => {
        const onSeek = () => {
          videoElement.removeEventListener('seeked', onSeek);
          resolve();
        };
        videoElement.addEventListener('seeked', onSeek);
      });
      
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      // Use JPEG with quality 0.7 to reduce payload size
      const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      frames.push(base64);
    }
  } catch (e) {
      console.error("Error extracting frames", e);
  } finally {
    // Restore state
    videoElement.currentTime = originalTime;
    if (!wasPaused) videoElement.play();
  }

  return frames;
};
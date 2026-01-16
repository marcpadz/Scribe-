export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
};

// Helper to slice an AudioBuffer and encode it to WAV for download
// Now defaults to original sample rate, but can be used for export
export const sliceAudioBuffer = (
  buffer: AudioBuffer,
  startTime: number,
  endTime: number,
  audioContext: AudioContext
): Blob => {
  const startSample = Math.floor(startTime * buffer.sampleRate);
  const endSample = Math.floor(endTime * buffer.sampleRate);
  const length = endSample - startSample;

  if (length <= 0) {
      // Return empty blob if invalid
      return new Blob([], { type: "audio/wav" });
  }

  const newBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    length,
    buffer.sampleRate
  );

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const channelData = buffer.getChannelData(i);
    const newChannelData = newBuffer.getChannelData(i);
    for (let j = 0; j < length; j++) {
      newChannelData[j] = channelData[startSample + j];
    }
  }

  return bufferToWav(newBuffer);
};

// Advanced slicer that resamples to 16kHz Mono for API efficiency
export const resampleAndSliceAudio = async (
  sourceBuffer: AudioBuffer,
  startTime: number,
  endTime: number,
  targetSampleRate = 16000
): Promise<Blob> => {
    const duration = endTime - startTime;
    if (duration <= 0) throw new Error("Invalid duration");

    // Use OfflineAudioContext to resample
    const offlineCtx = new OfflineAudioContext(
        1, // Mono
        duration * targetSampleRate,
        targetSampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = sourceBuffer;
    source.connect(offlineCtx.destination);
    
    // Start playback at the correct offset
    // Note: second param is 'when' (0), third is 'offset' (startTime), fourth is 'duration'
    source.start(0, startTime, duration);

    const renderedBuffer = await offlineCtx.startRendering();
    return bufferToWav(renderedBuffer);
}

// Simple WAV encoder
const bufferToWav = (abuffer: AudioBuffer): Blob => {
  const numOfChan = abuffer.numberOfChannels;
  const length = abuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while (pos < abuffer.length) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};
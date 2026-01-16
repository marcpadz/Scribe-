export interface TranscriptSegment {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface TranscriptData {
  segments: TranscriptSegment[];
}

export interface Bookmark {
  id: string;
  timestamp: number;
  note: string;
  createdAt: string;
}

export enum PlaybackSpeed {
  Normal = 1,
  Fast = 1.5,
  Double = 2,
  Triple = 3,
}

export interface Project {
  id: string; // UUID or Drive ID
  name: string;
  lastModified: number;
  transcript: TranscriptData | null;
  bookmarks: Bookmark[];
  mediaType: 'audio' | 'video';
  // Note: We cannot persist the Blob easily in JSON/Drive without large upload overhead.
  // We will prompt user to re-link media if missing in current session.
  sourceType: 'local' | 'drive'; 
}

export interface User {
  name: string;
  email: string;
  picture?: string;
  accessToken?: string;
}
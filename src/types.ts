export interface GeneratedAssets {
  video_hooks: string[];
  video_titles: string[];
  captions: string[];
  scripts: string[];
  hashtags: string[];
  retention_hooks: string[];
}

export interface GenerationRequest {
  topic: string;
  url: string;
  transcript: string;
  notes: string;
  tone: string;
  targetAudience: string;
  platform: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  request: GenerationRequest;
  assets: GeneratedAssets;
}

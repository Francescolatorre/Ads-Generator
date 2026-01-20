
export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export interface Placement {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  description: string;
}

export interface AdChannel {
  id: string;
  name: string;
  icon: string;
  placements: Placement[];
}

export interface AdVariant {
  id: string;
  placementId: string;
  placementName: string;
  imageUrl: string;
  aspectRatio: AspectRatio;
  status: 'pending' | 'generating' | 'completed' | 'error';
  error?: string;
}

export interface Briefing {
  style: string;
  focus: string;
  tone: string;
  cta: string;
}

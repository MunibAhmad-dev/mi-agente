export type TConnectorProvider = 'github' | 'huggingface';

export interface TConnectorStatus {
  provider: TConnectorProvider;
  label: string;
  connected: boolean;
  meta: {
    username?: string;
    avatarUrl?: string;
    name?: string;
  } | null;
}

export interface TConnectorSearchResult {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  private?: boolean;
  type?: 'model' | 'dataset' | 'space';
  stars?: number;
  likes?: number;
  downloads?: number;
  language?: string | null;
  updatedAt?: string;
  defaultBranch?: string;
}

export interface TConnectorSearchResponse {
  results: TConnectorSearchResult[];
}

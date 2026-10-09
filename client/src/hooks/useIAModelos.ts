import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Provider {
  id: string;
  label: string;
  reachable: boolean;
  models: string[];
  knownModels?: string[];
  chatUrl: string;
  envKey?: string;
  signupUrl?: string;
  modelCount?: number;
  healthState?: { ok: boolean; failCount: number } | null;
  description?: string;
}

export interface HardwareInfo {
  cpu: { model: string; cores: number; speedMHz: number };
  ram: { totalGB: number; usedGB: number; freeGB: number };
  gpu: { name: string; vramGB: number } | null;
  vramGB: number | null;
  os: { platform: string; version: string };
}

export interface HFModel {
  id: string;
  name: string;
  organization: string;
  description: string;
  params: string;
  license: string;
  downloads: number;
  likes: number;
  vramEstimateGB: number;
  tags: string[];
  url: string;
  source: 'huggingface';
}

export interface GHRepo {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  description: string;
  stars: number;
  license: string;
  language: string;
  url: string;
  topics: string[];
  source: 'github';
}

export interface Recommendation {
  providerId: string;
  providerLabel: string;
  modelId: string;
  chatUrl: string;
  score: number;
  reason: string;
  fallbacks: { providerId: string; modelId: string }[];
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useProviders() {
  return useQuery<{ providers: Provider[]; summary: { total: number; reachable: number; totalModels: number } }>({
    queryKey: ['ia-modelos', 'providers'],
    queryFn: () => axios.get('/api/ia-modelos/providers').then((r) => r.data),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useRefreshProviders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => axios.post('/api/ia-modelos/providers/refresh').then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ia-modelos'] });
    },
  });
}

export function useHardware() {
  return useQuery<HardwareInfo>({
    queryKey: ['ia-modelos', 'hardware'],
    queryFn: () => axios.get('/api/ia-modelos/hardware').then((r) => r.data),
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useCompatibilityCheck() {
  return useMutation({
    mutationFn: (req: { vramGB?: number; ramGB?: number; params?: string }) =>
      axios.post('/api/ia-modelos/hardware/check', req).then((r) => r.data),
  });
}

export function useHFSearch(query: string, enabled: boolean) {
  return useQuery<{ results: HFModel[]; query: string }>({
    queryKey: ['ia-modelos', 'hf', query],
    queryFn: () => axios.get(`/api/ia-modelos/models/huggingface?q=${encodeURIComponent(query)}&limit=20`).then((r) => r.data),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useGHSearch(query: string, enabled: boolean) {
  return useQuery<{ results: GHRepo[]; query: string }>({
    queryKey: ['ia-modelos', 'gh', query],
    queryFn: () => axios.get(`/api/ia-modelos/models/github?q=${encodeURIComponent(query)}&limit=20`).then((r) => r.data),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useRecommendation(task: string) {
  return useQuery<{ recommendation: Recommendation; fallbackChain: unknown[] }>({
    queryKey: ['ia-modelos', 'recommend', task],
    queryFn: () =>
      axios.get(`/api/ia-modelos/models/recommended?task=${task}&preferFree=true`).then((r) => r.data),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useFavorites() {
  const qc = useQueryClient();
  const query = useQuery<{ favorites: string[] }>({
    queryKey: ['ia-modelos', 'favorites'],
    queryFn: () => axios.get('/api/ia-modelos/models/favorites').then((r) => r.data),
  });
  const add = useMutation({
    mutationFn: (modelId: string) => axios.post('/api/ia-modelos/models/favorites', { modelId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-modelos', 'favorites'] }),
  });
  const remove = useMutation({
    mutationFn: (modelId: string) =>
      axios.delete(`/api/ia-modelos/models/favorites/${encodeURIComponent(modelId)}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-modelos', 'favorites'] }),
  });
  return { query, add, remove };
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['ia-modelos', 'status'],
    queryFn: () => axios.get('/api/ia-modelos/system/status').then((r) => r.data),
    staleTime: 30 * 1000,
    retry: 1,
  });
}

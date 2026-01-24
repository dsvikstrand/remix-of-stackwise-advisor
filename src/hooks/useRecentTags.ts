import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTags } from '@/lib/tagging';

const MAX_RECENT = 8;

function getStorageKey(userId?: string) {
  if (!userId) return null;
  return `stacklab-recent-tags:${userId}`;
}

function loadTags(storageKey: string | null): string[] {
  if (!storageKey) return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    return [];
  }
  return [];
}

function saveTags(storageKey: string | null, tags: string[]) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(tags));
  } catch {
    // ignore storage errors
  }
}

export function useRecentTags() {
  const { user } = useAuth();
  const storageKey = useMemo(() => getStorageKey(user?.id), [user?.id]);
  const [recentTags, setRecentTags] = useState<string[]>([]);

  useEffect(() => {
    setRecentTags(loadTags(storageKey));
  }, [storageKey]);

  const addRecentTags = useCallback(
    (tags: string[]) => {
      if (!storageKey) return [] as string[];
      const normalized = normalizeTags(tags);
      if (normalized.length === 0) return recentTags;

      const merged = [...normalized, ...recentTags.filter((tag) => !normalized.includes(tag))]
        .slice(0, MAX_RECENT);

      setRecentTags(merged);
      saveTags(storageKey, merged);
      return merged;
    },
    [storageKey, recentTags]
  );

  return { recentTags, addRecentTags };
}
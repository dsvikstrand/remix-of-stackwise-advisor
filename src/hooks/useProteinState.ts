import { useState, useCallback, useEffect } from 'react';
import {
  ProteinState,
  ShakeRecipe,
  ShakeItem,
  ProteinAnalysis,
  DEFAULT_PROTEIN_STATE,
} from '@/types/stacklab';

const STORAGE_KEY = 'stacklab-protein-shakes';

function loadState(): ProteinState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load protein state:', e);
  }
  return DEFAULT_PROTEIN_STATE;
}

function saveState(state: ProteinState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save protein state:', e);
  }
}

function generateShakeName(): string {
  const adjectives = ['Power', 'Ultra', 'Mighty', 'Supreme', 'Epic', 'Elite', 'Prime', 'Mega', 'Hyper', 'Super'];
  const nouns = ['Shake', 'Blend', 'Mix', 'Fusion', 'Formula', 'Stack', 'Builder', 'Pump', 'Surge', 'Rush'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

export function useProteinState() {
  const [state, setState] = useState<ProteinState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const createShake = useCallback((): ShakeRecipe => {
    const newShake: ShakeRecipe = {
      id: `shake-${Date.now()}`,
      name: generateShakeName(),
      items: [],
      totalProtein: 0,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, currentShake: newShake }));
    return newShake;
  }, []);

  const addItem = useCallback((item: ShakeItem) => {
    setState((prev) => {
      if (!prev.currentShake) return prev;
      // Prevent duplicates
      if (prev.currentShake.items.some((i) => i.proteinId === item.proteinId)) {
        return prev;
      }
      const updatedItems = [...prev.currentShake.items, item];
      const totalProtein = updatedItems.reduce((sum, i) => sum + i.gramsProtein, 0);
      return {
        ...prev,
        currentShake: { ...prev.currentShake, items: updatedItems, totalProtein },
      };
    });
  }, []);

  const updateItem = useCallback((itemId: string, updates: Partial<ShakeItem>) => {
    setState((prev) => {
      if (!prev.currentShake) return prev;
      const updatedItems = prev.currentShake.items.map((i) =>
        i.id === itemId ? { ...i, ...updates } : i
      );
      const totalProtein = updatedItems.reduce((sum, i) => sum + i.gramsProtein, 0);
      return {
        ...prev,
        currentShake: { ...prev.currentShake, items: updatedItems, totalProtein },
      };
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setState((prev) => {
      if (!prev.currentShake) return prev;
      const updatedItems = prev.currentShake.items.filter((i) => i.id !== itemId);
      const totalProtein = updatedItems.reduce((sum, i) => sum + i.gramsProtein, 0);
      return {
        ...prev,
        currentShake: { ...prev.currentShake, items: updatedItems, totalProtein },
      };
    });
  }, []);

  const updateShakeName = useCallback((name: string) => {
    setState((prev) => {
      if (!prev.currentShake) return prev;
      return {
        ...prev,
        currentShake: { ...prev.currentShake, name },
      };
    });
  }, []);

  const saveAnalysis = useCallback((analysis: ProteinAnalysis) => {
    setState((prev) => {
      if (!prev.currentShake) return prev;
      const updatedShake = { ...prev.currentShake, analysis };
      // Add to history (limit to 20)
      const existingIndex = prev.history.findIndex((h) => h.id === updatedShake.id);
      let newHistory: ShakeRecipe[];
      if (existingIndex >= 0) {
        newHistory = [...prev.history];
        newHistory[existingIndex] = updatedShake;
      } else {
        newHistory = [updatedShake, ...prev.history].slice(0, 20);
      }
      return {
        ...prev,
        currentShake: updatedShake,
        history: newHistory,
      };
    });
  }, []);

  const clearCurrentShake = useCallback(() => {
    setState((prev) => ({ ...prev, currentShake: null }));
  }, []);

  const loadFromHistory = useCallback((shakeId: string) => {
    setState((prev) => {
      const shake = prev.history.find((h) => h.id === shakeId);
      if (!shake) return prev;
      // Clone as new shake
      const cloned: ShakeRecipe = {
        ...shake,
        id: `shake-${Date.now()}`,
        createdAt: new Date().toISOString(),
        analysis: undefined,
      };
      return { ...prev, currentShake: cloned };
    });
  }, []);

  const deleteFromHistory = useCallback((shakeId: string) => {
    setState((prev) => ({
      ...prev,
      history: prev.history.filter((h) => h.id !== shakeId),
    }));
  }, []);

  const resetAll = useCallback(() => {
    setState(DEFAULT_PROTEIN_STATE);
  }, []);

  return {
    currentShake: state.currentShake,
    history: state.history,
    createShake,
    addItem,
    updateItem,
    removeItem,
    updateShakeName,
    saveAnalysis,
    clearCurrentShake,
    loadFromHistory,
    deleteFromHistory,
    resetAll,
  };
}

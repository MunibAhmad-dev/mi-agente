/**
 * Discovery Button
 * ===============
 * 
 * Botón para abrir el panel de búsqueda de Discovery.
 */

import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { DiscoverySearchPanel } from './DiscoverySearchPanel';
import type { DiscoverySearchResult } from '@librechat/data-provider';

interface DiscoveryButtonProps {
  onSelectResult?: (result: DiscoverySearchResult) => void;
}

export function DiscoveryButton({ onSelectResult }: DiscoveryButtonProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const handleSelect = (result: DiscoverySearchResult) => {
    onSelectResult?.(result);
    setIsPanelOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsPanelOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg 
                   bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-medium
                   hover:from-blue-600 hover:to-purple-600 transition-all
                   shadow-sm hover:shadow-md"
        title="Buscar plugins y skills"
      >
        <Sparkles className="w-4 h-4" />
        <span className="hidden sm:inline">Discovery</span>
      </button>

      <DiscoverySearchPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSelect={handleSelect}
      />
    </>
  );
}

export default DiscoveryButton;

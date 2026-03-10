'use client';

import { useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * Hook for modal maximize/minimize state.
 * Returns isMaximized boolean + toggleMaximize function.
 * 
 * Use the global `.modal-maximized` class on your modal container:
 *   className={`${styles.modal} ${isMaximized ? 'modal-maximized' : ''}`}
 */
export function useModalResize() {
  const [isMaximized, setIsMaximized] = useState(false);
  return {
    isMaximized,
    toggleMaximize: () => setIsMaximized(prev => !prev),
  };
}

/**
 * Resize toggle button for modal headers.
 * Place next to the close (X) button.
 * 
 * @param {boolean} isMaximized - Current maximize state
 * @param {() => void} onToggle - Toggle function from useModalResize
 * @param {string} [className] - CSS class for styling (typically same as closeButton)
 * @param {number} [size=18] - Icon size
 */
export function ModalResizeButton({ isMaximized, onToggle, className, size = 18 }) {
  return (
    <button className={className} onClick={onToggle} type="button">
      {isMaximized ? <Minimize2 size={size} /> : <Maximize2 size={size} />}
    </button>
  );
}

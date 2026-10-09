import React from 'react';

/**
 * OllamaIcon — icono de Ollama (llama) en SVG vectorial.
 * Usa currentColor para adaptarse al tema claro/oscuro del cliente.
 */
const OllamaIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  function OllamaIcon({ ...props }, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {/* orejas */}
        <path d="M8.5 6.8 L7 3 L10.3 5" />
        <path d="M15.5 6.8 L17 3 L13.7 5" />
        {/* hocico */}
        <path d="M12 12.8 C7.9 12.8 5.7 13.9 5.7 15.7 C5.7 17.8 8.3 19.3 12 19.3 C15.7 19.3 18.3 17.8 18.3 15.7 C18.3 13.9 16.1 12.8 12 12.8 Z" />
        {/* cabeza */}
        <circle cx="12" cy="10" r="5.5" />
        {/* ojos */}
        <circle cx="9.75" cy="8.75" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="14.25" cy="8.75" r="0.8" fill="currentColor" stroke="none" />
        {/* fosas nasales */}
        <circle cx="10.5" cy="14.75" r="0.45" fill="currentColor" stroke="none" />
        <circle cx="13.5" cy="14.75" r="0.45" fill="currentColor" stroke="none" />
      </svg>
    );
  },
);

export default OllamaIcon;

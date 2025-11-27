import React from 'react';
import { StyleType, FORMATTING_OPTIONS } from '../types';

interface StyleSelectorProps {
  selected: StyleType;
  onSelect: (style: StyleType) => void;
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({ selected, onSelect }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
      {FORMATTING_OPTIONS.map((option) => (
        <button
          key={option.id}
          onClick={() => onSelect(option.id)}
          className={`
            relative p-4 text-left border rounded-lg transition-all duration-200
            ${selected === option.id 
              ? 'border-ink-900 bg-paper-100 shadow-md ring-1 ring-ink-900' 
              : 'border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm'
            }
          `}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className={`font-serif font-bold ${selected === option.id ? 'text-ink-900' : 'text-gray-700'}`}>
              {option.name}
            </h3>
            <div className={`w-3 h-3 rounded-full ${option.previewColor}`}></div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            {option.description}
          </p>
        </button>
      ))}
    </div>
  );
};
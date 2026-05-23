import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

const TagInput = ({ label, placeholder, tags, setTags }) => {
  const [input, setInput] = useState('');

  const addTag = (e) => {
    e.preventDefault();
    const value = input.trim();
    if (value && !tags.includes(value)) {
      setTags([...tags, value]);
      setInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      addTag(e);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {tags.map((tag, index) => (
          <span 
            key={index} 
            className="flex items-center gap-1.5 px-3 py-1 bg-brand-50 text-brand-700 border border-brand-100 rounded-full text-xs font-bold"
          >
            {tag}
            <button 
              type="button" 
              onClick={() => removeTag(tag)}
              className="hover:text-brand-900 transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <p className="text-xs text-gray-400 italic">No amenities added yet.</p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
        />
        <button
          type="button"
          onClick={addTag}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
};

export default TagInput;

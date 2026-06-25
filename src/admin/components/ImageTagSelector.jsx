import { Tag, Check } from 'lucide-react';

const IMAGE_TAGS = [
  "EXTERIOR", "HOTEL_ENTRANCE", "LOBBY", "RECEPTION", "CORRIDOR",
  "ELEVATOR", "PARKING", "GARDEN", "TERRACE", "ROOFTOP",
  "LOUNGE_AREA", "BUSINESS_CENTER", "CONFERENCE_HALL", "BANQUET_HALL"
];

const formatTag = (tag) => {
  return tag
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const ImageTagSelector = ({ selectedTags = [], onChange }) => {
  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter(t => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Tag className="h-4 w-4" />
        Classification Tags
      </label>
      <div className="flex flex-wrap gap-2">
        {IMAGE_TAGS.map(tag => {
          const isActive = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`
                px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all
                ${isActive 
                  ? 'bg-brand-600 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
              `}
            >
              {isActive && <Check className="inline-block h-3 w-3 mr-1" />}
              {formatTag(tag)}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400">Select at least one tag to improve guest search visibility.</p>
    </div>
  );
};

export default ImageTagSelector;

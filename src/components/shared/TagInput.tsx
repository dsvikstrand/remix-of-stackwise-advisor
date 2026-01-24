import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeTag, MAX_TAGS } from '@/lib/tagging';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  maxTags?: number;
  disabled?: boolean;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  maxTags = MAX_TAGS,
  disabled,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const canAddMore = value.length < maxTags;

  const filteredSuggestions = useMemo(() => {
    const query = normalizeTag(inputValue);
    if (!query) return [];
    return suggestions
      .filter((tag) => tag.includes(query))
      .filter((tag) => !value.includes(tag))
      .slice(0, 6);
  }, [inputValue, suggestions, value]);

  const addTag = (raw: string) => {
    if (!canAddMore) return;
    const slug = normalizeTag(raw);
    if (!slug || value.includes(slug)) return;
    onChange([...value, slug].slice(0, maxTags));
    setInputValue('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (inputValue.trim()) addTag(inputValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            #{tag}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              onClick={() => removeTag(tag)}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
      </div>

      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={canAddMore ? 'Add tag (press Enter)' : 'Tag limit reached'}
        disabled={disabled || !canAddMore}
      />

      {filteredSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filteredSuggestions.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addTag(tag)}
              disabled={disabled}
            >
              #{tag}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
import { Search, X } from 'lucide-react';
import { useRef } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export default function SearchInput({ value, onChange, placeholder = 'Search...', className = '', autoFocus }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="input-field pl-9 pr-8"
      />
      {value && (
        <button
          onClick={() => { onChange(''); ref.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

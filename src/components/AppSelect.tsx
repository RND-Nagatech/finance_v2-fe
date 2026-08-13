import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AppSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
};

export function AppSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Pilih data',
  disabled = false,
  triggerClassName,
  contentClassName,
}: AppSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          'h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 shadow-none outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-60',
          triggerClassName,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className={cn(
          'z-[150] max-h-64 overflow-y-auto rounded-md border-slate-200 bg-white text-slate-800 shadow-md',
          contentClassName,
        )}
      >
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

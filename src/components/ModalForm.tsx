import { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ModalFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  contentClassName?: string;
}

export function ModalForm({ open, onOpenChange, title, children, contentClassName }: ModalFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto bg-white sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl",
        contentClassName
      )}>
        <DialogHeader className="pr-6">
          <DialogTitle className="text-2xl font-bold text-slate-900">
            {title}
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

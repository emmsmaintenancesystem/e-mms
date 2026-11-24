import React from 'react';
import { STATUS_META, TicketStatus } from '../types/api';

interface StatusBadgeProps {
  status: TicketStatus;
  short?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  short = false,
  className = '',
}) => {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.badgeClass} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
      <span>{short ? meta.shortLabel : meta.label}</span>
    </span>
  );
};

import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import { TicketPhoto, formatFileSizeKB } from '../types/api';

interface PhotoLightboxProps {
  photo: TicketPhoto | null;
  onClose: () => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ photo, onClose }) => {
  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 no-print"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full bg-[#121420] border border-[#1E2235] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2235]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F3F5FA]">
            <span>
              {photo.photo_type === 'before'
                ? 'รูปภาพก่อนซ่อม (จุดที่ชำรุด)'
                : 'รูปภาพหลังซ่อม (ผลการดำเนินงาน)'}
            </span>
            {photo.file_size_bytes > 0 && (
              <span className="text-xs text-[#9BA3B8] font-normal">
                ({formatFileSizeKB(photo.file_size_bytes)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={photo.public_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#5A8BFF] hover:underline px-2 py-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              เปิดแท็บใหม่
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#171A29] hover:bg-[#1E2235] text-[#F3F5FA]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="bg-[#090A10] flex items-center justify-center max-h-[78vh] overflow-auto p-3">
          <img
            src={photo.public_url}
            alt="รูปภาพงานซ่อม"
            className="max-h-[72vh] w-auto object-contain rounded-lg"
          />
        </div>
      </div>
    </div>
  );
};

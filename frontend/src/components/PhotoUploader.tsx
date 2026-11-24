import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  CompressedPhotoItem,
  compressImageToWebP,
} from '../lib/imageCompressor';
import { formatFileSizeKB } from '../types/api';

interface PhotoUploaderProps {
  photos: CompressedPhotoItem[];
  onChange: (photos: CompressedPhotoItem[]) => void;
  minPhotos?: number;
  maxPhotos?: number;
  label?: string;
  helperText?: string;
  required?: boolean;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  photos,
  onChange,
  minPhotos = 1,
  maxPhotos = 3,
  label = 'รูปภาพประกอบ (1–3 รูป)',
  helperText = 'ระบบจะบีบอัดเป็น WebP อัตโนมัติ (≤ 150 KB/รูป) และล้างข้อมูลพิกัด GPS/EXIF ออกทั้งหมดเพื่อคุ้มครองความเป็นส่วนตัว (PDPA)',
  required = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setErrorMsg(null);
    const remainingSlots = maxPhotos - photos.length;
    if (remainingSlots <= 0) {
      setErrorMsg(`สามารถแนบรูปภาพได้สูงสุดไม่เกิน ${maxPhotos} รูป`);
      e.target.value = '';
      return;
    }

    const filesToProcess = Array.from(fileList).slice(0, remainingSlots);
    setIsCompressing(true);

    try {
      const newlyCompressed: CompressedPhotoItem[] = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        const compressed = await compressImageToWebP(
          filesToProcess[i],
          photos.length + i + 1
        );
        newlyCompressed.push(compressed);
      }
      onChange([...photos, ...newlyCompressed]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบีบอัดรูปภาพ'
      );
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (id: string) => {
    const target = photos.find((p) => p.id === id);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }
    onChange(photos.filter((p) => p.id !== id));
    setErrorMsg(null);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="block text-sm font-semibold text-[#F3F5FA]">
          {label}{' '}
          {required && <span className="text-[#FF7A1A] font-bold">*</span>}
        </label>
        <span className="text-xs font-medium text-[#9BA3B8]">
          แนบแล้ว {photos.length} / {maxPhotos} รูป
          {minPhotos > 0 ? ` (ขั้นต่ำ ${minPhotos} รูป)` : ''}
        </span>
      </div>

      {/* Preview Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {photos.map((item, idx) => (
            <div
              key={item.id}
              className="relative group bg-[#090A10] border border-[#1E2235] rounded-xl overflow-hidden"
            >
              <div className="aspect-video bg-[#090A10] relative overflow-hidden">
                <img
                  src={item.previewUrl}
                  alt={`รูปที่ ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-2 left-2 bg-[#090A10]/85 text-[#F3F5FA] text-xs font-semibold px-2 py-0.5 rounded-md border border-[#1E2235]">
                  รูปที่ {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(item.id)}
                  className="absolute top-2 right-2 bg-rose-600/90 hover:bg-rose-500 text-white p-1.5 rounded-lg shadow transition-colors"
                  title="ลบรูปนี้"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between text-[#9BA3B8]">
                  <span className="truncate max-w-[140px]" title={item.originalName}>
                    {item.width}×{item.height}px
                  </span>
                  <span className="text-emerald-400 font-semibold">
                    {formatFileSizeKB(item.originalBytes)} →{' '}
                    {formatFileSizeKB(item.compressedBytes)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[#5A8BFF]">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>WebP • ล้างพิกัด EXIF/GPS แล้ว</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dropzone / Button */}
      {photos.length < maxPhotos && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple={maxPhotos - photos.length > 1}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            disabled={isCompressing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-[#1E2235] hover:border-[#2F6BFF] bg-[#090A10]/70 hover:bg-[#2F6BFF]/5 rounded-xl p-5 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isCompressing ? (
              <>
                <Loader2 className="w-7 h-7 text-[#2F6BFF] animate-spin" />
                <span className="text-sm font-medium text-[#F3F5FA]">
                  กำลังบีบอัดเป็น WebP และล้างข้อมูล EXIF/GPS...
                </span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[#2F6BFF]">
                  <Camera className="w-6 h-6" />
                  <ImagePlus className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-[#F3F5FA]">
                  กดเพื่อถ่ายรูป หรือเลือกรูปภาพจากเครื่อง (เพิ่มได้อีก{' '}
                  {maxPhotos - photos.length} รูป)
                </span>
                <span className="text-xs text-[#9BA3B8] text-center max-w-md">
                  {helperText}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {errorMsg && (
        <p className="text-xs text-[#FF7A1A] font-medium bg-[#FF7A1A]/10 border border-[#FF7A1A]/30 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}
    </div>
  );
};

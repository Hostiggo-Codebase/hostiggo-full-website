'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Lightbulb, Trash2, Loader2, Star, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import WizardShell from '../_components/WizardShell';
import { useListingDraft } from '@/context/ListingDraftContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_PHOTOS = 10;
const MIN_PHOTOS = 3;

export default function PhotosPage() {
  const { draft, update } = useListingDraft();
  const [photos, setPhotos] = useState<string[]>(draft.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const persist = (next: string[]) => {
    setPhotos(next);
    update({ photoUrls: next });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (picked.length === 0) {
      toast.error(room <= 0 ? 'You can upload up to 10 photos.' : 'Please choose image files.');
      return;
    }
    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of picked) {
        try {
          uploaded.push(await api.uploadPhoto(file));
        } catch (err) {
          console.error('[photos] upload failed:', err);
          toast.error(`Couldn't upload ${file.name}`);
        }
      }
      if (uploaded.length) {
        persist([...photos, ...uploaded]);
        toast.success(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} uploaded`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (url: string) => persist(photos.filter((p) => p !== url));
  const makePrimary = (url: string) => persist([url, ...photos.filter((p) => p !== url)]);

  return (
    <WizardShell
      step={8}
      title="Add some photos of your place"
      subtitle="Clear photos help guests book with confidence. The first photo is your cover."
      nextDisabled={photos.length < MIN_PHOTOS}
    >
      <div className="max-w-4xl mx-auto">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Upload area */}
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'border-2 border-dashed rounded-2xl p-6 sm:p-12 flex flex-col items-center justify-center bg-white transition-all cursor-pointer min-h-[280px] mb-8 group',
            dragOver ? 'border-figma-navy bg-figma-navy/5' : 'border-gray-300 hover:border-figma-navy/60 hover:bg-figma-navy/3',
            uploading && 'pointer-events-none opacity-70',
          )}
        >
          <div className="w-16 h-16 bg-figma-navy/5 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {uploading ? (
              <Loader2 className="w-8 h-8 text-figma-navy animate-spin" />
            ) : (
              <ImagePlus className="w-8 h-8 text-figma-navy" />
            )}
          </div>
          <p className="text-xl font-bold text-gray-800 mb-1">
            {uploading ? 'Uploading…' : 'Drag and drop up to 10 photos'}
          </p>
          <p className="text-sm text-gray-500 mb-6">or click to browse your files</p>
          <span className="bg-figma-navy text-white px-8 py-3 rounded-full text-sm font-semibold">
            Upload from gallery
          </span>
        </div>

        {/* Quick links */}
        <div className="flex items-center justify-between mb-6">
          <span className="flex items-center gap-2 text-figma-navy text-sm font-medium">
            <Lightbulb className="w-5 h-5" />
            Bright, landscape photos work best
          </span>
          <p className="text-sm text-gray-500">{photos.length} / {MAX_PHOTOS} photos uploaded</p>
        </div>

        {photos.length < MIN_PHOTOS && (
          <div className="flex gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Upload at least {MIN_PHOTOS} photos to continue -- you have {photos.length} so far.
            </p>
          </div>
        )}

        {/* Grid */}
        {photos.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">
            No photos yet. Add a few to make your listing stand out.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((url, i) => (
              <div
                key={url}
                className={cn(
                  'relative aspect-[4/3] rounded-2xl overflow-hidden shadow-card group',
                  i === 0 && 'col-span-2 md:col-span-2 aspect-[16/10]',
                )}
              >
                <Image fill src={url} alt={`Photo ${i + 1}`} sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
                {i === 0 && (
                  <div className="absolute top-3 left-3 bg-white/85 backdrop-blur-md px-3 py-1 rounded-full">
                    <span className="text-[11px] font-bold text-figma-navy uppercase tracking-wider">Cover</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  {i !== 0 && (
                    <button
                      onClick={() => makePrimary(url)}
                      title="Make cover"
                      className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-amber-500 shadow-lg hover:scale-110 transition-transform"
                    >
                      <Star className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => remove(url)}
                    title="Remove"
                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-red-500 shadow-lg hover:scale-110 transition-transform"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </WizardShell>
  );
}

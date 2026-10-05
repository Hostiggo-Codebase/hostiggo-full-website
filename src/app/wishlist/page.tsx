'use client';

import { formatINR } from '@/lib/format';
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  Heart,
  Star,
  ChevronDown,
  ArrowLeft,
  Plus,
  Edit2,
  Check,
  X,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import CopyrightBar from '@/components/layout/CopyrightBar';
import { cn } from '@/lib/utils';
import { api, mapWishlistListing } from '@/lib/api';
import { getRecentlyViewedIds, RECENTLY_VIEWED_EVENT } from '@/lib/recentlyViewed';
import { toast } from 'sonner';
import { allInNightlyPrice } from '@/lib/billing/invoice';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WishlistProperty {
  id: string;
  name: string;
  location: string;
  rating: number;
  reviews: number;
  price: number;
  nights: number;
  image: string;
  liked: boolean;
  group: string; // which wishlist group this belongs to
}

interface WishlistGroup {
  id: string;
  name: string;
  isDefault?: boolean; // default groups can't be renamed/removed
}

// ── Data ──────────────────────────────────────────────────────────────────────

const DEFAULT_GROUPS: WishlistGroup[] = [
  // 'all' is a client-side pseudo-group ("every saved listing"), not a real
  // categories row -- it must never be sent to the API as a category id.
  // It used to be labelled "Recent viewed" even though it only ever listed
  // saved items; real recently-viewed listings now have their own section.
  { id: 'all', name: 'All saved', isDefault: true },
];

// ── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmModal({
  groupName,
  onConfirm,
  onCancel,
}: {
  groupName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-[320px] mx-4 animate-slide-up">
        <p className="text-[15px] font-semibold text-gray-800 leading-relaxed mb-5">
          Confirm to remove <span className="text-figma-navy">&quot;{groupName}&quot;</span>{' '}
          from list?
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-[#004772] text-white text-[14px] font-semibold rounded-xl hover:bg-[#003a5c] active:scale-[0.98] transition-all"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-100 text-gray-600 text-[14px] font-semibold rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create New List Modal ─────────────────────────────────────────────────────

function CreateListModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && name.trim()) onConfirm(name.trim());
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [name, onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-[320px] mx-4 animate-slide-up">
        <h3 className="text-[16px] font-bold text-gray-900 mb-1">
          Create new wishlist
        </h3>
        <p className="text-[13px] text-gray-500 mb-4">
          Give your new wishlist a name
        </p>
        <input
          ref={inputRef}
          type="text"
          placeholder="e.g. Manali trip"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 transition-all mb-4"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="flex-1 py-2.5 bg-[#004772] text-white text-[14px] font-semibold rounded-xl hover:bg-[#003a5c] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Create
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-100 text-gray-600 text-[14px] font-semibold rounded-xl hover:bg-gray-200 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Group Dropdown ────────────────────────────────────────────────────────────

interface GroupDropdownProps {
  groups: WishlistGroup[];
  selected: string;
  onSelect: (id: string) => void;
  onRenameGroup: (id: string, newName: string) => void;
  onRemoveGroup: (id: string) => void;
}

function GroupDropdown({
  groups,
  selected,
  onSelect,
  onRenameGroup,
  onRemoveGroup,
}: GroupDropdownProps) {
  const [open, setOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setKebabOpen(null);
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setKebabOpen(null);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = groups.find((g) => g.id === selected) ?? groups[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setKebabOpen(null);
          setEditingId(null);
        }}
        className={cn(
          'flex items-center justify-between gap-2.5 border rounded-full px-4 py-2 text-[13px] sm:text-[14px] font-medium bg-white transition-all duration-200 select-none min-w-[150px] shadow-sm',
          open
            ? 'border-gray-800 text-gray-900 shadow-md ring-2 ring-gray-100'
            : 'border-gray-300 text-gray-700 hover:border-gray-400 hover:shadow',
        )}
      >
        <span className="flex-1 text-left truncate">{current?.name ?? 'Select'}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-500 transition-transform duration-200 flex-shrink-0',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] w-[220px] bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-fade-in-down overflow-visible">
          {groups.map((grp) => {
            const isSelected = grp.id === selected;
            const isEditing = editingId === grp.id;

            return (
              <div
                key={grp.id}
                className={cn(
                  'relative flex items-center justify-between gap-2 px-4 py-2.5 text-[13px] transition-colors duration-150 select-none',
                  isSelected
                    ? 'text-gray-900 font-semibold bg-gray-50'
                    : 'text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-800 cursor-pointer',
                )}
              >
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (editValue.trim()) {
                          onRenameGroup(grp.id, editValue.trim());
                        }
                        setEditingId(null);
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                    onBlur={() => {
                      if (editValue.trim() && editValue.trim() !== grp.name) {
                        onRenameGroup(grp.id, editValue.trim());
                      }
                      setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-gray-200/60 rounded-md outline-none px-2 py-1 text-[13px] font-medium text-gray-900 w-full min-w-0"
                    autoFocus
                  />
                ) : (
                  <>
                    {/* Left side: Group name & Green Checkmark (if selected) */}
                    <div
                      onClick={() => {
                        if (!isSelected) {
                          onSelect(grp.id);
                          setOpen(false);
                          setKebabOpen(null);
                        }
                      }}
                      className={cn(
                        'flex items-center gap-2 flex-1 min-w-0',
                        !isSelected && 'cursor-pointer',
                      )}
                    >
                      <span className="truncate">{grp.name}</span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>

                    {/* Right side: Three Dots button (pushed to right side for selected group) */}
                    {/* Rename/Remove only for real, user-created lists. The
                        built-in 'all' group used to show them too, and
                        "Remove" sent categoryId 'all' to the API, which
                        Postgres rejected: invalid input syntax for type
                        uuid: "all". */}
                    {isSelected && !grp.isDefault && (
                      <div
                        className="relative ml-auto flex items-center"
                        ref={kebabOpen === grp.id ? kebabRef : undefined}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setKebabOpen((prev) =>
                              prev === grp.id ? null : grp.id,
                            );
                          }}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 transition-colors"
                          aria-label="Wishlist options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {/* Kebab Popover */}
                        {kebabOpen === grp.id && (
                          <div
                            className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 w-[124px] bg-white rounded-xl py-1.5 z-[200] border border-gray-100 animate-fade-in-down"
                            style={{
                              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setKebabOpen(null);
                                setEditingId(grp.id);
                                setEditValue(grp.name);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors text-left"
                            >
                              <Pencil
                                className="w-3.5 h-3.5 text-gray-500"
                                strokeWidth={1.8}
                              />
                              <span>Rename</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setKebabOpen(null);
                                setOpen(false);
                                onRemoveGroup(grp.id);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-red-400 hover:bg-red-50/60 transition-colors text-left"
                            >
                              <Trash2
                                className="w-3.5 h-3.5 text-red-400"
                                strokeWidth={1.8}
                              />
                              <span>Remove</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Wishlist Card ─────────────────────────────────────────────────────────────

interface WishlistCardProps {
  property: WishlistProperty;
  editMode: boolean;
  onToggleHeart: () => void;
  onRemove: () => void;
  onClick: () => void;
  removing: boolean;
  showHeart?: boolean;
}

function WishlistCard({
  property,
  editMode,
  onToggleHeart,
  onRemove,
  onClick,
  removing,
  showHeart = true,
}: WishlistCardProps) {
  const [imgErr, setImgErr] = useState(false);
  const FALLBACK = '/placeholder.svg';

  return (
    <div
      className={cn(
        'bg-white rounded-2xl overflow-hidden border border-gray-100 cursor-pointer group transition-all duration-300 flex flex-col',
        removing
          ? 'opacity-0 scale-90 pointer-events-none'
          : 'opacity-100 scale-100',
        'hover:shadow-lg hover:-translate-y-0.5',
      )}
      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}
      onClick={!editMode ? onClick : undefined}
    >
      {/* Image */}
      <div className="relative overflow-hidden aspect-[4/3] w-full">
        <Image
          fill
          src={imgErr ? FALLBACK : property.image}
          alt={property.name}
          onError={() => setImgErr(true)}
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Edit mode: ❌ remove icon */}
        {editMode ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-150 z-10"
            aria-label="Remove stay"
          >
            <X className="w-3.5 h-3.5 text-gray-600" strokeWidth={2.5} />
          </button>
        ) : !showHeart ? null : (
          /* Normal mode: heart icon */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleHeart();
            }}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-150"
            aria-label="Toggle wishlist"
          >
            <Heart
              className={cn(
                'w-3.5 h-3.5 transition-colors duration-200',
                property.liked
                  ? 'fill-rose-500 text-rose-500'
                  : 'text-gray-400 fill-transparent',
              )}
            />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900 mb-0.5 leading-snug line-clamp-1">
            {property.name}
          </h3>
          <p className="text-[11.5px] text-gray-400 mb-2.5 leading-none">
            {property.location}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-3">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
            <span className="text-[12px] font-bold text-gray-700">
              {property.rating}
            </span>
            <span className="text-[11px] text-gray-400">
              · {property.reviews} reviews
            </span>
          </div>

          <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1">
            <span className="text-[12px] font-extrabold text-gray-900">
              {formatINR(allInNightlyPrice(property.price))}
            </span>
            <span className="text-[11px] text-gray-400">
              / night incl. taxes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WishlistPage() {
  const [groups, setGroups] = useState<WishlistGroup[]>(DEFAULT_GROUPS);
  const [properties, setProperties] = useState<WishlistProperty[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [editMode, setEditMode] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmRemoveGroup, setConfirmRemoveGroup] =
    useState<WishlistGroup | null>(null);

  const router = useRouter();
  const { userId, loading: isLoading } = useAuth();

  // Recently viewed (see src/lib/recentlyViewed.ts). Re-read whenever this
  // tab regains focus/visibility, another tab records a view (`storage`),
  // or this tab does (custom event) -- so it always reflects new views.
  const [recent, setRecent] = useState<WishlistProperty[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = getRecentlyViewedIds();
      if (ids.length === 0) {
        if (!cancelled) setRecent([]);
        return;
      }
      try {
        const res = await fetch(`/api/hotels?ids=${ids.join(',')}`, { cache: 'no-store' });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || 'Failed to load');
        const byId = new Map<string, WishlistProperty>(
          (payload.data ?? []).map((row: any) => {
            const mapped = mapWishlistListing(row);
            return [mapped.id, { ...mapped, liked: false }];
          }),
        );
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as WishlistProperty[];
        if (!cancelled) setRecent(ordered);
      } catch (error) {
        console.error('[wishlist] failed to load recently viewed:', error);
      }
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('storage', load);
    window.addEventListener(RECENTLY_VIEWED_EVENT, load);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', load);
      window.removeEventListener(RECENTLY_VIEWED_EVENT, load);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setGroups(DEFAULT_GROUPS);
      setProperties([]);
      return;
    }

    let mounted = true;

    const loadWishlist = async () => {
      try {
        const [categories, listings] = await Promise.all([
          api.wishlistCategories(userId),
          api.wishlistListings(userId, selectedGroup),
        ]);

        if (!mounted) return;
        const customGroups = categories.map((category: any) => ({
          id: category.id,
          name: category.name,
          isDefault: false,
        }));
        setGroups([...DEFAULT_GROUPS, ...customGroups]);
        setProperties(listings.map(mapWishlistListing));
      } catch (error) {
        console.error('[wishlist] failed to load:', error);
        if (mounted) setProperties([]);
      }
    };

    loadWishlist();

    return () => {
      mounted = false;
    };
  }, [userId, selectedGroup]);

  // Filter visible properties -- "all" shows everything
  const visibleProperties = properties.filter((p) => {
    if (selectedGroup === 'all') return p.liked;
    return p.liked && p.group === selectedGroup;
  });

  const toggleHeart = (id: string) => {
    removeProperty(id);
  };

  const removeProperty = (id: string) => {
    setRemovingIds((prev) => new Set(prev).add(id));
    const remove = async () => {
      try {
        if (userId) {
          await api.removeWishlistItem(
            userId,
            id,
            selectedGroup === 'all' ? undefined : selectedGroup,
          );
        }
        setProperties((prev) => prev.filter((p) => p.id !== id));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to remove wishlist item',
        );
      } finally {
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    };
    setTimeout(remove, 300);
  };

  // Group management
  const handleCreateGroup = async (name: string) => {
    if (!userId) {
      toast.error('Please sign in to create a wishlist');
      return;
    }

    try {
      const category = await api.createWishlistCategory(userId, name);
      setGroups((prev) => [
        ...prev,
        { id: category.id, name: category.name, isDefault: false },
      ]);
      setSelectedGroup(category.id);
      setShowCreateModal(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create wishlist',
      );
    }
  };

  const handleRenameGroup = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    if (!userId || groups.find((g) => g.id === id)?.isDefault) return;
    try {
      await api.renameWishlistCategory(id, newName.trim(), userId);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === id ? { ...g, name: newName.trim() } : g,
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to rename wishlist',
      );
    }
  };

  const handleRemoveGroupConfirm = async () => {
    if (!confirmRemoveGroup || !userId) return;
    if (confirmRemoveGroup.isDefault) {
      setConfirmRemoveGroup(null);
      return;
    }
    try {
      await api.deleteWishlistCategory(confirmRemoveGroup.id, userId);
      setGroups((prev) => prev.filter((g) => g.id !== confirmRemoveGroup.id));
      setProperties((prev) =>
        prev.filter((p) => p.group !== confirmRemoveGroup.id),
      );
      if (selectedGroup === confirmRemoveGroup.id) setSelectedGroup('all');
      setConfirmRemoveGroup(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to remove wishlist',
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header with Back Button */}
        <div className="flex items-center gap-3.5 mb-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm flex-shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1
            className={cn(
              'text-[28px] sm:text-[34px] font-extrabold tracking-tight transition-colors',
              editMode
                ? 'text-figma-navy underline decoration-2 underline-offset-4'
                : 'text-gray-900',
            )}
          >
            My wishlists
          </h1>
        </div>

        {/* Controls row -- only meaningful with an account */}
        {userId && (
        <div className="flex items-center gap-3 mb-8">
          {/* Group dropdown */}
          <GroupDropdown
            groups={groups}
            selected={selectedGroup}
            onSelect={setSelectedGroup}
            onRenameGroup={handleRenameGroup}
            onRemoveGroup={(id) => {
              const g = groups.find((g) => g.id === id);
              if (g) setConfirmRemoveGroup(g);
            }}
          />

          {/* Add new list */}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
            aria-label="Create new list"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Edit / Done button */}
          <div className="ml-auto">
            {editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="px-5 py-2 bg-[#004772] text-white text-[13px] font-bold rounded-full hover:bg-[#003a5c] transition-all shadow-sm"
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 cursor-pointer hover:text-gray-900 transition-colors"
              >
                <span>Edit</span>
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        )}

        {/* Cards section */}
        {!isLoading && !userId ? (
          <div className="text-center py-16 mb-14">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-gray-400 text-lg font-medium mb-1">
              Sign in to see your wishlist
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Your saved stays will show up here once you&apos;re signed in.
            </p>
            <button
              type="button"
              onClick={() => router.push('/signin?redirect=/wishlist')}
              className="bg-[#004772] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#003a5c] transition-colors shadow-sm"
            >
              Sign in
            </button>
          </div>
        ) : visibleProperties.length > 0 ? (
          <div className="mb-14">
            {/* Clean 4-column grid on large screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {visibleProperties.map((prop) => (
                <WishlistCard
                  key={prop.id}
                  property={prop}
                  editMode={editMode}
                  onToggleHeart={() => toggleHeart(prop.id)}
                  onRemove={() => removeProperty(prop.id)}
                  onClick={() => router.push(`/property/${prop.id}`)}
                  removing={removingIds.has(prop.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 max-w-4xl mx-auto py-12 mb-14 px-4">
            {/* Left Column: Illustration */}
            <div className="relative w-[368px] max-w-full h-[386px] flex-shrink-0">
              <Image
                src="/images/empty-states/woman-heart-wish.png"
                alt="Nothing saved yet"
                fill
                sizes="(max-width: 768px) 100vw, 368px"
                className="object-contain"
                priority
              />
            </div>

            {/* Right Column: Typography & Button */}
            <div className="text-left flex flex-col items-start">
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 italic mb-3">
                Nothing saved yet
              </h2>
              <p className="text-gray-600 text-base md:text-lg italic mb-8 max-w-sm">
                Explore and tap the heart icon to add your favourites here.
              </p>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="bg-[#0396EF] text-white px-10 py-3 rounded-xl font-bold hover:bg-blue-600 transition-colors shadow-sm"
              >
                Explore
              </button>
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <section className="mb-14" aria-labelledby="recently-viewed-heading">
            <h2
              id="recently-viewed-heading"
              className="text-[20px] sm:text-[22px] font-extrabold text-gray-900 mb-5"
            >
              Recently viewed
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {recent.map((prop) => (
                <WishlistCard
                  key={`recent-${prop.id}`}
                  property={prop}
                  editMode={false}
                  onToggleHeart={() => {}}
                  onRemove={() => {}}
                  showHeart={false}
                  onClick={() => router.push(`/property/${prop.id}`)}
                  removing={false}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Custom Graphical Banner replacing old "End of list" and Footer */}
      <div className="relative w-full h-[250px] overflow-visible mt-20 flex items-end isolate">
        {/* Left Leaf */}
        <img
          src="/images/empty-states/Green-grass-left.png"
          alt="Green grass left decoration"
          className="absolute bottom-0 left-0 w-48 md:w-72 object-contain -z-10 pointer-events-none"
        />

        {/* Right Leaf */}
        <img
          src="/images/empty-states/Green-grass-right.png"
          alt="Green grass right decoration"
          className="absolute bottom-0 right-0 w-48 md:w-72 object-contain -z-10 pointer-events-none"
        />

        {/* Center Woman */}
        <img
          src="/images/empty-states/woman-beach.png"
          alt="Woman on beach"
          className="absolute bottom-12 left-1/2 -translate-x-1/2 w-48 md:w-64 lg:w-[280px] h-auto object-contain z-10 pointer-events-none"
        />

        {/* Copyright Bar spanning entire width at absolute bottom */}
        <div className="w-full relative z-0">
          <CopyrightBar />
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateListModal
          onConfirm={handleCreateGroup}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
      {confirmRemoveGroup && (
        <ConfirmModal
          groupName={confirmRemoveGroup.name}
          onConfirm={handleRemoveGroupConfirm}
          onCancel={() => setConfirmRemoveGroup(null)}
        />
      )}
    </div>
  );
}

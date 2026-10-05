'use client';

import { formatINR } from '@/lib/format';
import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Check, IndianRupee } from 'lucide-react';
import WizardShell from '../_components/WizardShell';
import { cn } from '@/lib/utils';
import { useListingDraft } from '@/context/ListingDraftContext';
import { groupAddonsByCategory, type Addon } from '@/lib/services/addons-shared';

type Selection = { addon_id: number; price: number; includes: string };

export default function AddonsPage() {
  const { draft, update } = useListingDraft();
  const [catalog, setCatalog] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Record<number, Selection>>(() => {
    const initial: Record<number, Selection> = {};
    (draft.addonSelections ?? []).forEach((s) => {
      initial[s.addon_id] = s;
    });
    return initial;
  });

  useEffect(() => {
    let mounted = true;
    fetch('/api/addons')
      .then((res) => res.json())
      .then((json) => {
        if (mounted) setCatalog(json.data ?? []);
      })
      .catch((err) => console.error('[addons wizard step] failed to load catalog:', err))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    update({ addonSelections: Object.values(selections) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections]);

  const toggle = (addon: Addon) => {
    setSelections((prev) => {
      const next = { ...prev };
      if (next[addon.addon_id]) {
        delete next[addon.addon_id];
      } else {
        next[addon.addon_id] = { addon_id: addon.addon_id, price: 0, includes: '' };
      }
      return next;
    });
  };

  const setField = (addonId: number, field: 'price' | 'includes', value: string) => {
    setSelections((prev) => ({
      ...prev,
      [addonId]: {
        ...prev[addonId],
        [field]: field === 'price' ? Number(value) || 0 : value,
      },
    }));
  };

  const grouped = groupAddonsByCategory(catalog);
  const selectedCount = Object.keys(selections).length;

  return (
    <WizardShell
      step={7}
      title="Offer extra add-ons"
      subtitle="Optional paid extras guests can add to their booking, like breakfast or airport pickup. You can add, remove, or reprice these anytime after publishing from your listing settings."
    >
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      ) : catalog.length === 0 ? (
        <div className="text-center py-24 text-gray-500">
          No add-ons are available to offer right now. You can skip this step.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8 space-y-8">
            {Object.entries(grouped).map(([category, items]) => (
              <section key={category}>
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-figma-navy" />
                  {category}
                </h2>
                <div className="space-y-3">
                  {items.map((addon) => {
                    const active = Boolean(selections[addon.addon_id]);
                    return (
                      <div
                        key={addon.addon_id}
                        className={cn(
                          'bg-white border rounded-xl p-4 transition-all',
                          active
                            ? 'border-figma-navy ring-1 ring-figma-navy bg-figma-navy/4'
                            : 'border-gray-200',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(addon)}
                          className="w-full flex items-center justify-between text-left"
                        >
                          <span className="text-sm font-semibold text-gray-800">
                            {addon.name}
                          </span>
                          <span
                            className={cn(
                              'w-6 h-6 rounded-full border flex items-center justify-center transition-colors shrink-0',
                              active
                                ? 'bg-figma-navy border-figma-navy text-white'
                                : 'border-gray-300',
                            )}
                          >
                            {active && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>

                        {active && (
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="text-xs font-medium text-gray-600">
                              Price per booking
                              <div className="mt-1 flex items-center border border-gray-200 rounded-lg px-3 py-2">
                                <IndianRupee className="w-3.5 h-3.5 text-gray-400 mr-1" />
                                <input
                                  type="number"
                                  min={0}
                                  value={selections[addon.addon_id]?.price ?? 0}
                                  onChange={(e) =>
                                    setField(addon.addon_id, 'price', e.target.value)
                                  }
                                  className="w-full text-sm outline-none"
                                  placeholder="0"
                                />
                              </div>
                            </label>
                            <label className="text-xs font-medium text-gray-600">
                              What&apos;s included
                              <input
                                type="text"
                                value={selections[addon.addon_id]?.includes ?? ''}
                                onChange={(e) =>
                                  setField(addon.addon_id, 'includes', e.target.value)
                                }
                                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                                placeholder="e.g. Continental breakfast for 2"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="md:col-span-4 hidden md:block">
            <div className="sticky top-28">
              <div className="bg-white rounded-2xl shadow-card p-6 border border-gray-200">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                  Selected add-ons
                </div>
                {selectedCount === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    No add-ons selected yet - guests won&apos;t see any extras.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {Object.values(selections).map((s) => {
                      const addon = catalog.find((a) => a.addon_id === s.addon_id);
                      return (
                        <div
                          key={s.addon_id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-700">{addon?.name}</span>
                          <span className="font-semibold text-gray-800">{formatINR(s.price)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </WizardShell>
  );
}

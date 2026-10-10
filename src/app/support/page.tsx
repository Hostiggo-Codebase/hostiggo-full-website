'use client';

import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { AlertTriangle, Lightbulb, Smile, X, Lock, ChevronDown, type LucideIcon } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import SupportLiveChat from '@/components/features/SupportLiveChat';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Feedback length limit, counted on the trimmed text (what is saved).
const MAX_FEEDBACK_CHARS = 1000;

// Maps the on-screen action to the feedback.type stored in the DB.
const TYPE_MAP: Record<string, string> = {
  issue: 'report_issue',
  suggest: 'suggest_improvement',
  experience: 'share_experience',
};

const ACTIONS: { id: string; title: string; desc: string; icon: LucideIcon; tint: string }[] = [
  { id: 'issue', title: 'Report an issue', desc: 'Experiencing technical difficulties? Let us know so we can fix it immediately.', icon: AlertTriangle, tint: 'bg-red-50 text-red-500' },
  { id: 'suggest', title: 'Suggest improvement', desc: 'Have an idea to make Hostiggo better? We love hearing your creative thoughts.', icon: Lightbulb, tint: 'bg-sky-50 text-sky-600' },
  { id: 'experience', title: 'Share experience', desc: 'Tell us about your hosting journey. Your stories help us grow together.', icon: Smile, tint: 'bg-gray-100 text-figma-navy' },
];

const FAQ = [
  { q: 'How quickly do you respond to reports?', a: 'Our support team prioritizes critical technical issues with a response time of under 4 hours. General suggestions are reviewed weekly by our product team.' },
  { q: 'Can I track the status of my suggestion?', a: "Yes! If you select 'Suggest improvement', you'll receive email updates if your idea enters our development roadmap." },
];

export default function SupportPage() {
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState<number | null>(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { userId } = useAuth();
  // Only real characters count -- leading/trailing whitespace is dropped on
  // submit, and a box of only spaces is empty.
  const charCount = text.trim().length;

  // Closing with typed text asks first; an empty box just closes.
  const requestClose = () => {
    if (charCount > 0) setConfirmDiscard(true);
    else {
      setText('');
      setActive(null);
    }
  };
  const discard = () => {
    setConfirmDiscard(false);
    setText('');
    setActive(null);
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      toast.error('Please add a few details first.');
      return;
    }
    if (!active) return;
    setSubmitting(true);
    try {
      await api.submitFeedback({
        userId: userId ?? null,
        type: TYPE_MAP[active] ?? 'share_experience',
        category: null,
        description: text.trim().slice(0, MAX_FEEDBACK_CHARS),
      });
      toast.success('Thanks! Your feedback has been received.');
      setText('');
      setActive(null);
    } catch (err) {
      console.error('[support] feedback failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not send feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-figma-cream">
      <Navbar />
      <main className="container-main py-12">
        <section className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Feedback &amp; Support
          </h1>
          <p className="text-lg text-gray-500">
            We&apos;re here to ensure your experience is seamless. How can we help you today?
          </p>
        </section>

        <SupportLiveChat />

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                onClick={() => setActive(a.id)}
                className={cn(
                  'text-left p-6 rounded-2xl bg-white border shadow-card hover:shadow-card-hover transition-all flex flex-col items-start gap-4 h-full',
                  active === a.id ? 'border-figma-navy ring-1 ring-figma-navy' : 'border-gray-200',
                )}
              >
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', a.tint)}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">{a.title}</h3>
                  <p className="text-sm text-gray-500">{a.desc}</p>
                </div>
              </button>
            );
          })}
        </section>

        {active && (
          <div className="max-w-3xl mx-auto mb-16">
            <div className="bg-white p-8 rounded-3xl shadow-card border border-gray-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-figma-navy">
                  {ACTIONS.find((a) => a.id === active)?.title}
                </h2>
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Close feedback form"
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="feedback-text" className="block text-sm font-bold text-gray-800">
                    Describe your suggestion / issue
                  </label>
                  <div className="relative">
                    <textarea
                      id="feedback-text"
                      rows={6}
                      value={text}
                      onChange={(e) => {
                        const next = e.target.value;
                        // Cap at the limit of real characters; whitespace
                        // around the text doesn't use up the allowance.
                        if (next.trim().length <= MAX_FEEDBACK_CHARS) setText(next);
                        else setText(next.trimStart().slice(0, MAX_FEEDBACK_CHARS));
                      }}
                      placeholder="Tell us more details here..."
                      className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none resize-none"
                    />
                    <div className="absolute bottom-3 right-4 text-xs text-gray-400 font-medium">
                      {charCount}/{MAX_FEEDBACK_CHARS}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Lock className="w-4 h-4" />
                    Your feedback is encrypted and secure
                  </div>
                  <div className="flex w-full sm:w-auto gap-3">
                  <button
                    type="button"
                    onClick={requestClose}
                    className="flex-1 sm:flex-none px-6 py-4 border border-gray-200 text-gray-700 font-semibold rounded-2xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-[2] sm:flex-none px-10 py-4 bg-figma-navy text-white font-bold rounded-2xl shadow-md hover:bg-figma-navy/90 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {submitting ? 'Submitting…' : 'Submit Feedback'}
                  </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent className="bg-white text-gray-900 rounded-2xl w-[calc(100%-2rem)] max-w-md border-gray-200">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-bold text-gray-900">Discard your feedback?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-600">
                Your changes will not be saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border-gray-200 bg-white text-gray-800 hover:bg-gray-50">Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={discard} className="rounded-xl bg-red-600 text-white hover:bg-red-700">
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5 relative h-80 rounded-3xl overflow-hidden shadow-card">
            <Image
              fill
              src="/images/empty-states/confirmation-room.jpg"
              alt="Support"
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
              <p className="text-white text-xl font-bold">Always by your side.</p>
            </div>
          </div>
          <div className="lg:col-span-7 space-y-6 lg:pl-8">
            <h2 className="text-2xl font-bold text-gray-900">Common Questions</h2>
            <div className="space-y-2">
              {FAQ.map((f, i) => (
                <div key={i} className="border-b border-gray-200 pb-4">
                  <button
                    onClick={() => setOpen(open === i ? null : i)}
                    className="flex justify-between items-center w-full text-left text-base font-bold text-gray-800"
                  >
                    {f.q}
                    <ChevronDown
                      className={cn('w-5 h-5 transition-transform', open === i && 'rotate-180 text-figma-navy')}
                    />
                  </button>
                  {open === i && (
                    <p className="mt-3 text-gray-500 text-sm leading-relaxed">{f.a}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

'use client';

import { toast } from 'sonner';

/**
 * A mailto: link plus a "Copy" button. A bare mailto link does nothing
 * visible on a device with no default mail app (common on desktop browsers
 * with webmail), which testers reported as "the email doesn't open" -- the
 * copy button gives them the address either way.
 */
export default function EmailLink({
  email,
  className,
}: {
  email: string;
  className?: string;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email address copied');
    } catch {
      toast.error(`Couldn't copy. The address is ${email}`);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={`mailto:${email}`} className={className}>
        {email}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${email}`}
        className="text-xs font-medium text-figma-ink/60 border border-gray-200 rounded-full px-2.5 py-0.5 hover:bg-gray-50"
      >
        Copy
      </button>
    </span>
  );
}

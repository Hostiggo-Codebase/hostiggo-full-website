"use client";

import NextLink from "next/link";
import type { ComponentProps, MouseEvent } from "react";

type Props = ComponentProps<typeof NextLink>;

/**
 * Drop-in replacement for next/link used by the site header and footer.
 * Next's client navigation ignores a click on a link to the page you're
 * already on; testers expected that to refresh the page, so a plain
 * left-click on a same-page link reloads it. Everything else (other pages,
 * #hash links, new-tab / modifier clicks) behaves exactly like next/link.
 */
export default function ReloadingLink({ onClick, ...props }: Props) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      (props.target && props.target !== "_self")
    ) {
      return;
    }
    const href = typeof props.href === "string" ? props.href : null;
    if (!href || href.startsWith("#")) return;
    const url = new URL(href, window.location.href);
    if (
      url.origin === window.location.origin &&
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      !url.hash
    ) {
      e.preventDefault();
      window.location.reload();
    }
  };

  return <NextLink {...props} onClick={handleClick} />;
}

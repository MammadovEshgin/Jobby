/**
 * A listing anchor holds whatever the board put in it: a placeholder, a scheme with no host, an
 * unencoded space. A `href` that is not a URL drops its own card rather than the whole page.
 */
export function vacancyUrl(href: string | undefined, baseUrl: string): string | undefined {
  if (href === undefined) {
    return undefined;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

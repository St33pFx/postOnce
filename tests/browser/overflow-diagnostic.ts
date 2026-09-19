import type { Page } from "@playwright/test";

export async function logHorizontalOverflow(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          tag: el.tagName,
          id: el.id,
          className: typeof el.className === "string" ? el.className : "",
          text: el.textContent?.trim().slice(0, 100),
          left: rect.left,
          right: rect.right,
          width: rect.width,
          position: style.position,
          display: style.display,
          whiteSpace: style.whiteSpace,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          transform: style.transform,
          overflowX: style.overflowX,
        };
      })
      .filter(item => item.right > viewport + 1 || item.left < -1)
      .sort((a, b) => Math.max(b.right - viewport, -b.left) - Math.max(a.right - viewport, -a.left))
      .slice(0, 20);
    return {
      innerWidth: viewport,
      scrollWidth: document.documentElement.scrollWidth,
      overflowBy: document.documentElement.scrollWidth - viewport,
      offenders,
    };
  });
  console.log(`POSTONCE_HORIZONTAL_OVERFLOW_${label}=${JSON.stringify(result)}`);
}

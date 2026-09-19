import type { Page } from "@playwright/test";

export async function logHorizontalOverflow(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const describe = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        className: typeof el.className === "string" ? el.className : "",
        text: el.textContent?.trim().slice(0, 100),
        left: rect.left,
        right: rect.right,
        width: rect.width,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        overflowBy: el.scrollWidth - el.clientWidth,
        position: style.position,
        display: style.display,
        whiteSpace: style.whiteSpace,
        overflowWrap: style.overflowWrap,
        wordBreak: style.wordBreak,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth,
        flexShrink: style.flexShrink,
        gridTemplateColumns: style.gridTemplateColumns,
        transform: style.transform,
        overflowX: style.overflowX,
      };
    };
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map(describe)
      .filter(item => item.right > viewport + 1 || item.left < -1)
      .sort((a, b) => Math.max(b.right - viewport, -b.left) - Math.max(a.right - viewport, -a.left))
      .slice(0, 20);
    const internalOverflow = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter(el => el.scrollWidth > el.clientWidth + 1)
      .map(describe)
      .slice(0, 40);
    const textOverflow: Array<{ tag: string; className: string; text: string; left: number; right: number; width: number }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim() ?? "";
      if (!text || !node.parentElement || getComputedStyle(node.parentElement).display === "none") continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.right > viewport + 1 || rect.left < -1) {
        textOverflow.push({
          tag: node.parentElement.tagName,
          className: typeof node.parentElement.className === "string" ? node.parentElement.className : "",
          text: text.slice(0, 100),
          left: rect.left,
          right: rect.right,
          width: rect.width,
        });
      }
    }
    const containers = [".editor-column", ".editor-heading", ".top-nav", ".destination-list", ".publish-grid"]
      .flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .flatMap(el => [el, ...Array.from(el.children).filter((child): child is HTMLElement => child instanceof HTMLElement)])
      .map(describe);
    const html = document.documentElement;
    const body = document.body;
    return {
      innerWidth: viewport,
      scrollWidth: html.scrollWidth,
      overflowBy: html.scrollWidth - viewport,
      html: { clientWidth: html.clientWidth, scrollWidth: html.scrollWidth, rect: describe(html) },
      body: { clientWidth: body.clientWidth, scrollWidth: body.scrollWidth, rect: describe(body) },
      offenders,
      internalOverflow,
      textOverflow,
      containers,
    };
  });
  console.log(`POSTONCE_HORIZONTAL_OVERFLOW_${label}=${JSON.stringify(result)}`);
}

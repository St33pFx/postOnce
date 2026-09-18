"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export function MotionProvider() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    const ctx = gsap.context(() => {
      const pageReveals = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      if (pageReveals.length) gsap.fromTo(pageReveals, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .62, ease: "power3.out", stagger: .06, clearProps: "transform" });
      gsap.utils.toArray<HTMLElement>("[data-section-reveal]").forEach(section => {
        const targets = section.querySelectorAll<HTMLElement>(".section-heading, .section-help");
        if (targets.length) gsap.fromTo(targets, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .55, ease: "power3.out", stagger: .05, clearProps: "transform,opacity", scrollTrigger: { trigger: section, start: "top 88%", once: true } });
      });
      gsap.utils.toArray<HTMLElement>("[data-media-reveal]").forEach(media => {
        if (media) gsap.fromTo(media, { clipPath: "inset(100% 0 0 0)", scale: 1.02 }, { clipPath: "inset(0 0 0 0)", scale: 1, duration: .65, ease: "power3.out", clearProps: "clipPath,transform", scrollTrigger: { trigger: media, start: "top 92%", once: true } });
      });
    });
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const lenis = finePointer ? new Lenis({ autoRaf: false }) : null;
    const onTick = (time: number) => lenis?.raf(time * 1000);
    if (lenis) { gsap.ticker.add(onTick); gsap.ticker.lagSmoothing(1000, 16); }
    return () => { if (lenis) gsap.ticker.remove(onTick); ctx.revert(); lenis?.destroy(); };
  }, []);
  return null;
}

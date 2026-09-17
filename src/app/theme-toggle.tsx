"use client";
import { useEffect, useState } from "react";
type Theme = "light"|"dark"|"system";
export function ThemeToggle(){
  const [theme,setTheme]=useState<Theme>("system");
  useEffect(()=>{const saved=localStorage.getItem("postonce-theme") as Theme|null;const value=saved&&["light","dark","system"].includes(saved)?saved:"system";setTheme(value);document.documentElement.dataset.theme=value;},[]);
  function update(value:Theme){setTheme(value);localStorage.setItem("postonce-theme",value);document.documentElement.dataset.theme=value;}
  return <label className="theme-control" aria-label="Tema"><span>Tema</span><select value={theme} onChange={e=>update(e.target.value as Theme)}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>;
}

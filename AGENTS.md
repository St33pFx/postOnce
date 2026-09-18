<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PostOnce Spec-Anchored Development

1. **SOURCE OF TRUTH**

   Orden de autoridad:

   `specs/constitution.md` → `specs/product.md` → `specs/features/*.md` → `specs/ui.md` → `specs/architecture.md` → `specs/implementation-plan.md` → implementación → tests.

   El código no redefine silenciosamente el comportamiento especificado.

2. **ANTES DE CAMBIAR CÓDIGO**

   Toda tarea que cambie comportamiento debe identificar la spec, REQ-ID y Acceptance Criteria relevantes. Si existe un requisito, implementar contra él. Si no existe, actualizar primero la spec. Si contradice la spec, reportar SPEC GAP o actualizar la spec antes de implementar.

3. **BUG FIXES**

   Un bug es una diferencia entre comportamiento especificado y real. Para bugs cubiertos por una spec, no modificar la spec para coincidir con el bug: corregir implementación y añadir regresión.

4. **TEST TRACEABILITY**

   Siempre que sea razonable, los tests de comportamiento deben incluir el REQ-ID. Mantener los tests E2E focalizados cuando sea posible.

5. **SPEC UPDATE RULE**

   Cuando una tarea cambie comportamiento de producto, spec, implementación y test de regresión deben viajar juntos. Cambios internos sin cambio externo no necesitan modificar specs.

6. **VALIDATION STRATEGY**

   Ejecutar en orden: test focalizado del requisito, checks del módulo, `npm run check` y `git diff --check`. La secuencia de cierre es: SPEC anchor → implementación → validación local focalizada → `npm run check` → checks de diff → commit → push → STOP. Después de un push no consultar ni esperar GitHub Actions; el usuario verifica CI por separado.

7. **COMPLETION**

   Una tarea requiere anchor identificado, Acceptance Criteria satisfecho, test de regresión cuando corresponda y checks locales verdes. Tras un commit y push exitosos, detenerse inmediatamente. No pollar GitHub Actions, esperar workflows, inspeccionar Actions ni reintentar por CI pendiente.

   El reporte de cierre debe indicar: `IMPLEMENTATION PUSHED: YES`, tests locales focalizados, `npm run check: PASS`, SHA del commit, `push: SUCCESS`, `working tree: clean` y `CI: NOT CHECKED — user will verify separately`.

8. **PROMPT BEHAVIOR**

   Los prompts pueden ser pequeños; el agente debe reconstruir el contexto leyendo las specs indicadas.

9. **USER-FACING UI WORK**

   Toda tarea de UI debe identificar el REQ-ID funcional aplicable y el REQ-UI-ID correspondiente de `specs/ui.md`. Las specs funcionales controlan qué ocurre; la spec UI controla cómo se presenta y anima. La implementación nunca redefine silenciosamente el comportamiento del producto.

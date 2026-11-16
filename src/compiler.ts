import { createTypstCompiler, type TypstCompiler } from '@myriaddreamin/typst.ts/dist/esm/compiler.mjs';
import { disableDefaultFontAssets, loadFonts } from '@myriaddreamin/typst.ts/dist/esm/options.init.mjs';
import { fontPlan, type FontPlan } from './fonts';
import compilerWasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';

const fontUrl = (f: string) => new URL(`${import.meta.env.BASE_URL}fonts/${f}`, location.href).href;

const compilers = new Map<string, Promise<TypstCompiler>>();

function getCompiler(plan: FontPlan): Promise<TypstCompiler> {
  let c = compilers.get(plan.key);
  if (!c) {
    const fonts = plan.files.map(fontUrl);
    c = (async () => {
      const compiler = createTypstCompiler();
      await compiler.init({ getModule: () => compilerWasm, beforeBuild: [disableDefaultFontAssets(), loadFonts(fonts)] });
      return compiler;
    })();
    c.catch(() => compilers.delete(plan.key));
    compilers.set(plan.key, c);
  }
  return c;
}

export const needsExtraFonts = (source: string) => fontPlan(source).extra;
export const isCompilerReady = (source: string) => compilers.has(fontPlan(source).key);

interface Diagnostic {
  range?: string;
  severity?: string;
  message?: string;
}

export async function compilePdf(mainContent: string, files: Record<string, Uint8Array> = {}): Promise<Uint8Array> {
  const compiler = await getCompiler(fontPlan(mainContent));
  compiler.resetShadow();
  for (const [path, bytes] of Object.entries(files)) compiler.mapShadow(path, bytes);
  compiler.addSource('/main.typ', mainContent);
  const result = await compiler.compile({ mainFilePath: '/main.typ', format: 1 as const, diagnostics: 'full' });
  const errors = ((result.diagnostics ?? []) as Diagnostic[]).filter((d) => d.severity === 'error');
  if (errors.length || !result.result) {
    const src = mainContent.split('\n');
    const msg = errors
      .map((d) => {
        const line = d.range ? parseInt(d.range, 10) : NaN;
        return `${d.message}` + (Number.isNaN(line) ? '' : `\n  → Typst line ${line + 1}: ${src[line]?.trim() ?? ''}`);
      })
      .join('\n');
    throw new Error(msg || 'Typst did not produce a PDF.');
  }
  return result.result;
}

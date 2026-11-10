import { createTypstCompiler, type TypstCompiler } from '@myriaddreamin/typst.ts/dist/esm/compiler.mjs';
import { disableDefaultFontAssets, loadFonts } from '@myriaddreamin/typst.ts/dist/esm/options.init.mjs';
import compilerWasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';

const fontUrl = (f: string) => new URL(`${import.meta.env.BASE_URL}fonts/${f}`, location.href).href;

const LATIN_FONTS = ['NotoSans_400Regular.ttf', 'NotoSans_400Regular_Italic.ttf', 'NotoSans_700Bold.ttf', 'NotoSans_700Bold_Italic.ttf'];
const CJK_FONTS = ['NotoSansKR_400Regular.ttf', 'NotoSansKR_700Bold.ttf'];

const CJK = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/;

const compilers = new Map<'latin' | 'cjk', Promise<TypstCompiler>>();

function getCompiler(kind: 'latin' | 'cjk'): Promise<TypstCompiler> {
  let c = compilers.get(kind);
  if (!c) {
    const fonts = (kind === 'cjk' ? [...LATIN_FONTS, ...CJK_FONTS] : LATIN_FONTS).map(fontUrl);
    c = (async () => {
      const compiler = createTypstCompiler();
      await compiler.init({ getModule: () => compilerWasm, beforeBuild: [disableDefaultFontAssets(), loadFonts(fonts)] });
      return compiler;
    })();
    c.catch(() => compilers.delete(kind));
    compilers.set(kind, c);
  }
  return c;
}

export const needsCjk = (source: string) => CJK.test(source);

interface Diagnostic {
  range?: string;
  severity?: string;
  message?: string;
}

export async function compilePdf(mainContent: string, files: Record<string, Uint8Array> = {}): Promise<Uint8Array> {
  const compiler = await getCompiler(needsCjk(mainContent) ? 'cjk' : 'latin');
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

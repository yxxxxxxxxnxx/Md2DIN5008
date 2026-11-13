import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const out = join(root, 'public', 'THIRD_PARTY_LICENSES.txt');
const fontLicense = join(root, 'public', 'fonts', 'OFL.txt');

const paths = execSync('npm ls --omit=dev --all --parseable', { encoding: 'utf8' })
  .split('\n')
  .map((p) => p.trim())
  .filter((p) => p && p !== root);

const seen = new Map();
for (const dir of paths) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)/i.test(f) || /^license_font/i.test(f));
  seen.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'UNKNOWN',
    homepage: pkg.homepage ?? pkg.repository?.url ?? pkg.repository ?? '',
    texts: files.map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8').trim() })),
    dir: relative(root, dir),
  });
}

const apacheText = [...seen.values()].find((p) => p.license === 'Apache-2.0' && p.texts.length)?.texts[0]?.text;

const sections = [...seen.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((p) => {
    let texts = p.texts;
    if (!texts.length && p.license === 'Apache-2.0' && apacheText) texts = [{ file: 'LICENSE (Apache-2.0)', text: apacheText }];
    const body = texts.length ? texts.map((t) => `--- ${t.file} ---\n${t.text}`).join('\n\n') : '(no license file shipped in the package)';
    return `==============================================================================\n${p.name} ${p.version}\nLicense: ${p.license}\n${p.homepage ? `Source: ${p.homepage}\n` : ''}==============================================================================\n\n${body}\n`;
  });

const header = `Md2DIN5008 includes the following third-party software and fonts.
Each component is distributed under its own license, reproduced below.

The Typst compiler (@myriaddreamin/typst-ts-web-compiler) is a WebAssembly build of
Typst (https://github.com/typst/typst, Apache-2.0) and the Rust crates it depends on.

Fonts in fonts/: Noto Sans, Noto Sans KR (SIL Open Font License 1.1), served unmodified.
Editor font: Source Code Pro (SIL Open Font License 1.1), via @fontsource/source-code-pro.
`;

writeFileSync(out, `${header}\n${sections.join('\n')}`);

const fontTexts = [...seen.values()]
  .filter((p) => p.name.startsWith('@expo-google-fonts/'))
  .flatMap((p) => p.texts.filter((t) => /font/i.test(t.file)).map((t) => `=== ${p.name.replace('@expo-google-fonts/', '')} ===\n\n${t.text}`));
const ofl = fontTexts.join('\n\n');
if (ofl) {
  if (!existsSync(join(root, 'public', 'fonts'))) mkdirSync(join(root, 'public', 'fonts'), { recursive: true });
  writeFileSync(fontLicense, `${ofl}\n`);
}

console.log(`Wrote ${relative(root, out)} (${seen.size} packages)${ofl ? ` and ${relative(root, fontLicense)}` : ''}`);

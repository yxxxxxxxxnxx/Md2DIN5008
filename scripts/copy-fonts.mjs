import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = process.cwd();
const out = join(root, 'public', 'fonts');
const expo = (pkg, weight, file) => join('node_modules', '@expo-google-fonts', pkg, weight, file);
const sources = [
  ...['400Regular', '400Regular_Italic', '700Bold', '700Bold_Italic'].map((w) => expo('inter', w, `Inter_${w}.ttf`)),
  ...['KR', 'JP', 'SC', 'TC'].flatMap((l) => ['400Regular', '700Bold'].map((w) => expo(`noto-sans-${l.toLowerCase()}`, w, `NotoSans${l}_${w}.ttf`))),
];

if (!existsSync(out)) mkdirSync(out, { recursive: true });
for (const src of sources) copyFileSync(join(root, src), join(out, basename(src)));

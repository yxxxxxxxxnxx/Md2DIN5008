const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const WIDE = /[⺀-鿿＀-￯]/;
const SIMPLIFIED = /[们这个国说时会来对发为学还没让给开关门见东车马鸟语话书钱长]/g;
const TRADITIONAL = /[們這個國說時會來對發為學還沒讓給開關門見東車馬鳥語話書錢長]/g;

const INTER = ['Inter_400Regular.ttf', 'Inter_400Regular_Italic.ttf', 'Inter_700Bold.ttf', 'Inter_700Bold_Italic.ttf'];

type Noto = 'KR' | 'JP' | 'SC' | 'TC';

const notoFiles = (lang: Noto) => [`NotoSans${lang}_400Regular.ttf`, `NotoSans${lang}_700Bold.ttf`];

export interface FontPlan {
  families: string[];
  files: string[];
  key: string;
  extra: boolean;
}

function pickNoto(text: string): Noto[] {
  const langs: Noto[] = [];
  if (KANA.test(text)) langs.push('JP');
  if (HANGUL.test(text)) langs.push('KR');
  if (langs.length || !WIDE.test(text)) return langs;
  const simplified = text.match(SIMPLIFIED)?.length ?? 0;
  const traditional = text.match(TRADITIONAL)?.length ?? 0;
  return [traditional > simplified ? 'TC' : 'SC'];
}

export function fontPlan(text: string): FontPlan {
  const langs = pickNoto(text);
  return {
    families: ['Inter', ...langs.map((l) => `Noto Sans ${l}`)],
    files: [...INTER, ...langs.flatMap(notoFiles)],
    key: langs.join('|'),
    extra: langs.length > 0,
  };
}

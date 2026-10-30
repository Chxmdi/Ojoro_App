// Anton stands in for the licensed display face (as in the app); Inter is the UI face. The files come
// from the same @expo-google-fonts packages the app uses.
import anton from '@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf?url';
import inter400 from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url';
import inter500 from '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf?url';
import inter600 from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf?url';
import inter700 from '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf?url';

export function fontFaceCss(): string {
  const face = (family: string, url: string, weight: number) =>
    `@font-face{font-family:'${family}';src:url('${url}') format('truetype');font-weight:${weight};font-style:normal;font-display:swap;}`;
  return [
    face('Anton', anton, 400),
    face('Inter', inter400, 400),
    face('Inter', inter500, 500),
    face('Inter', inter600, 600),
    face('Inter', inter700, 700),
  ].join('\n');
}

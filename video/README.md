# clawGS — wideo promocyjne

![poster](poster.jpg)

**Gotowy plik:** [`clawGS-promo.mp4`](clawGS-promo.mp4): 1920×1080, 30 fps, 85,2 s, H.264 + AAC
(muzyka i efekty, −16 LUFS).

Wideo to strona HTML animowana osią czasu GSAP. Skrypt `render.mjs` przewija ją klatka po klatce
w headless Chromium (Playwright) i koduje wynik ffmpegiem. Muzyka jest komponowana w kodzie
(`music/compose.mjs`) i zsynchronizowana z obrazem. Każdy render daje identyczny wynik,
więc zmiana jednego napisu to tylko edycja tekstu i ponowny render.

## Paleta (Goldman Sachs)

| | | | | | |
|---|---|---|---|---|---|
| `#7399C6` GS blue | `#00355F` navy | `#ACD4F1` sky | `#231F20` ink | `#58575A` gray | `#FFFFFF` white |

Wszystkie elementy UI korzystają wyłącznie z tych kolorów i ich mieszanek. Wyjątkiem są pazury
(`assets/claws.svg`), które celowo zostały w oryginalnych kolorach.
Kod wizualny dla „zablokowane” to rysy pazurów, a nie czerwień.

## Scenariusz

Każde cięcie wypada na początku taktu muzyki (100 BPM, takt = 2,4 s). Czasy cięć są w [`src/timing.js`](src/timing.js).

| Czas | Scena | Co pokazuje | Muzyka |
|---|---|---|---|
| 0:00–0:07 | Intro | Rysy pazurów rozdzierają ekran, łapy wpadają z boków, logo clawGS, naklejka „rawr.” | ambient, kotły na uderzeniu łap |
| 0:07–0:14 | Problem | Agent AI połączony ze wszystkim + zagrożenia (prompt injection, PII, jailbreaki…) → „Time to bring out the claws.” | napięcie, werbel i riser |
| 0:14–0:22 | 01 Drop-in gateway | Podmiana `base_url` na żywo; OpenAI / Anthropic / Gemini / SSE / modele lokalne | **drop**: wchodzi groove |
| 0:22–0:38 | 02 Hybrid guardrails | Pipeline: regex → keywords → decision model (AI) → LLM → output scan; 4 requesty: allow, PII, „grandma jailbreak” złapany przez model AI, wyciek klucza AWS w odpowiedzi | groove A → B |
| 0:38–0:46 | 03 Block responses | Ta sama odmowa w natywnym formacie OpenAI, Anthropic i Gemini | groove B + melodia |
| 0:46–0:53 | 04 MCP firewall | Whitelist narzędzi + polityka MCP pre-flight (`delete_repo`, `~/.ssh/id_rsa`) | groove B |
| 0:53–1:00 | 05 Budżety i rate limit | Budżet klucza dobija do limitu → `BLOCK_BUDGET`; 61. request w minucie → `BLOCK_RATE_LIMIT` | groove C |
| 1:00–1:10 | 06 Raportowanie | Dashboard, live audit, szczegóły requestu z ocenami polityk, webhook | groove C |
| 1:10–1:17 | 07 Standard | 8 kafelków: Models, MCP Servers, Provider Keys, Users, SSO Providers, Webhooks, System Audit, Data Export | refren |
| 1:17–1:25 | Outro | Pazury wracają: „The AI control layer with claws.” | F → G → C, finałowy akord na zaciśnięciu łap |

## Uruchomienie

Potrzebne: Node 20+, ffmpeg w `PATH`. Do muzyki dodatkowo FluidSynth i soundfont GM
(`apt install fluidsynth fluid-soundfont-gm`; inną ścieżkę soundfontu podasz przez `SOUNDFONT=...`).

```bash
cd video
npm install
npx playwright install chromium   # jednorazowo (albo ustaw CHROMIUM_PATH na istniejący Chrome/Chromium)

npm run preview                   # podgląd na żywo (bez dźwięku): http://127.0.0.1:5173
npm run music                     # soundtrack → assets/soundtrack.m4a (~15 s)
npm run render                    # pełny render → clawGS-promo.mp4 z soundtrackiem (~12 min na 4 rdzeniach)
npm run build                     # music + render
```

Podgląd w przeglądarce: spacja = pauza, ←/→ = ±1 s (z Shift ±5 s), `D` = licznik czasu, `R` = od początku.
Do konkretnego momentu skaczesz parametrem URL: `?t=24.5&debug`.

Przydatne opcje renderu:

```bash
node render.mjs --stills 3.5,24,52       # klatki PNG do out/stills/ (szybki podgląd zmian)
node render.mjs --from 18 --to 31 --out out/guardrails.mp4
node render.mjs --fps 60                 # płynniej, 2× dłużej
node render.mjs --audio muzyka.mp3       # inny podkład zamiast wygenerowanego (przycięty, 2 s wyciszenia)
node render.mjs --no-audio               # bez dźwięku
node music/compose.mjs --mux clawGS-promo.mp4   # nowa muzyka do gotowego wideo, bez ponownego renderu obrazu
```

## Muzyka

Korporacyjny, „uplifting” podkład w C-dur, 100 BPM, progresja C–G–Am–F. Instrumenty: fortepian,
smyczki, pizzicato, bas, dzwonki, pad i perkusja. Skrypt `music/compose.mjs`:

1. czyta z animacji listę cue (`window.__cues`): uderzenia łap, drapanie, blokady, kliknięcia,
   każde z dokładnym czasem po uwzględnieniu tempa scen;
2. pisze partyturę MIDI (`music/midi.mjs`) i renderuje ją FluidSynthem z soundfontem FluidR3 GM;
3. syntezuje efekty (`music/sfx.mjs`): whoosh na przejściach, drapanie pazurów, uderzenia,
   blipy przy ✓/✕, pisanie na klawiaturze, monety przy budżecie;
4. miksuje i normalizuje do −16 LUFS (dwuprzebiegowy `loudnorm`).

Zmiana czasu sceny w `src/timing.js` lub w `src/scenes.js` automatycznie przesuwa muzykę i efekty.
Wystarczy ponownie uruchomić `npm run build`.

## Edycja

- **Teksty:** wszystkie napisy są w [`src/copy.js`](src/copy.js). Fragment w `<em>` jest podświetlany na niebiesko.
  Tłumaczenie na polski to tylko edycja tego pliku. Fonty zawierają polskie znaki.
- **Sceny i timing:** [`src/scenes.js`](src/scenes.js) (jedna funkcja na scenę), kolejność, tempo scen
  (`pace`) i przejścia w [`src/main.js`](src/main.js), cięcia w [`src/timing.js`](src/timing.js).
- **Pazury:** `assets/claws.svg` (oryginał) i `assets/claws.png` (przezroczysty render używany w animacji,
  lewa i prawa łapa są wycinane z tego samego obrazka).

Liczby na dashboardzie i w przykładach (koszty, liczniki, latencje) są ilustracyjne.

## Licencje zależności

GSAP 3.15 (darmowa licencja GSAP, w tym pluginy TextPlugin, ScrambleText i DrawSVG), fonty Inter
i JetBrains Mono (OFL, z `@fontsource-variable`), ikony Lucide (ISC, wklejone do `src/icons.js`).
Muzyka jest oryginalna (skomponowana w `music/compose.mjs`), renderowana soundfontem FluidR3 GM (MIT).
Efekty są w pełni syntetyczne, bez sampli.

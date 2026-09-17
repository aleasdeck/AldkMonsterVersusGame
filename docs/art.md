# Арт: как делаем спрайты

Метод работы над HD-графикой (v0.34+): картинки генерирует нейронка по промпту из этого файла, обработку и подключение делает код. Цель — все герои и враги в одном стиле, без ручной подгонки каждого.

## Целевой формат

- Игра живёт в логическом кадре **960×540**, который `main.ts: fit()` масштабирует в окно целиком (на FullHD ×2). Ассеты рисуются в **2×** от логического размера, чтобы на FullHD быть 1:1.
- Герой в бою — 128 логических px (104 с союзниками), на экране героя 112, в блоке героя 44 (портрет). Стоит **слева, лицом вправо**; враги — справа, лицом влево.
- Рабочие файлы: кадр **256×256** PNG с прозрачным фоном, портрет **128×128**. Их делает скрипт из мастер-файлов (ниже), руками не рисуем.
- Мастер-файл — то, что отдаёт нейронка: **1024×1024**, чистый белый фон, пиксельная сетка 8 px. Хранится рядом, из него в любой момент пересобираются рабочие версии.

## Метод

1. **Эталон.** Первым сделан Воин (`docs/art/reference-warrior.png` — положить сюда утверждённый мастер). Всё остальное генерируется **с ним как референсом изображения** (image-to-image / reference, сила 0.3–0.5) и, если модель умеет, с тем же seed.
2. **Промпт = STYLE + FRAME + CHARACTER.** STYLE и FRAME копируются дословно и никогда не редактируются — это и есть «один стиль». Меняется только CHARACTER (и FRAME для врагов: `facing LEFT`).
3. **Одна поза сначала.** Пока idle-поза не утверждена, кадры анимации не генерируем. Утверждённая поза становится референсом для ленты.
4. **Проверка по чек-листу** (ниже). Не прошло — перегенерировать, а не «дорисуем потом».
5. **Мастер отдаётся в репо как есть** (1024, белый фон). Скрипт `tools/art/prepare.py` режет фон, уменьшает ×¼ без сглаживания до 256, вырезает портрет 128. Обработка одинаковая для всех — поэтому её не делают руками и не просят у нейронки.
6. **Idle.** Пока ленты нет — CSS-покачивание поверх одной позы (как сейчас у всех). Лента из 6 кадров — только если нейронка держит силуэт; иначе 3–4 кадра руками в Aseprite поверх позы.

## Промпт

Английский, три блока. Негатив — отдельным полем, если модель его принимает; иначе последней строкой промпта как `Avoid: …`.

```
=== STYLE (никогда не менять) ===
Dark fantasy HD pixel art game sprite. Strict pixel grid: every pixel is an 8x8 px square on a 1024x1024 canvas,
no sub-pixel detail. Dark outline (#1b1b2a) around the whole silhouette. Limited desaturated palette of ~14 colors,
muted earthy tones, one deep red accent (#b23a48). Flat cel shading with exactly one shadow step, light from top-left.
No anti-aliasing, no gradients, no glow, no magic effects, no texture noise. Grim, weathered, worn look — a survivor
of a lost war, never shiny or heroic.

=== FRAME (никогда не менять; у врагов facing LEFT) ===
Single character, full body, 3/4 side view facing RIGHT. Realistic proportions, about 6 heads tall.
Standing idle battle stance: feet planted apart on ONE horizontal baseline, weight centered.
Character height ~85% of the canvas, horizontally centered, feet 64 px above the bottom edge.
Pure flat white background (#FFFFFF), no floor, no ground shadow, no cast shadow, no scenery, no text, no border, no frame.
Canvas 1024x1024, PNG.

=== CHARACTER (свой у каждого) ===
<описание: телосложение, голова/шлем, броня и цвета, оружие в правой руке, щит/предмет в левой, характерные детали>
```

Негатив:
```
photo, 3D render, painterly, anime, cute, chibi, bright saturated colors, smooth shading, gradients, blur, glow, particles,
magic effects, background, scenery, floor, ground shadow, text, watermark, signature, multiple characters, cropped limbs,
facing left, front view, shiny clean armor, transparent checkerboard
```
(у врагов в негативе `facing right` вместо `facing left`).

### CHARACTER: Воин (эталон)

```
Grim veteran human WARRIOR, stocky build. Battered open-faced steel helmet with dents (#8d99ae), weathered chainmail
under a torn blood-stained dark red tabard (#b23a48) with a leather belt, pale scarred face (#f1c27d), dark blue-grey
trousers (#4a4e69) and worn brown leather boots. Short straight steel sword with a notched blade (#dcdcdc) held low
in the right hand, angled 45° down. Round battered wooden shield with a rusty steel rim and central boss on the left arm,
covering the torso.
```

### Портрет (128×128 делает скрипт из позы; отдельно генерировать только если поза плохо кадрируется)

```
Dark fantasy pixel art portrait, head and shoulders, same character as the reference. Same palette, outline
and 8px pixel style. Pure white background, no text, canvas 1024x1024.
```

### Idle-лента (только с утверждённой позой как референсом)

STYLE тот же, FRAME заменить на:
```
Sprite sheet strip, 6 frames in a row, each frame 1024x1024, total 6144x1024. The SAME character and pose as the
reference image in every frame: identical silhouette, identical feet position and baseline. Idle breathing loop:
frames 1-3 the chest and shoulders rise by 16 px and the sword tip drifts up slightly, frames 4-6 sink back,
frame 6 flows into frame 1. Shield does not move. Nothing else changes. Pure white background, no shadow.
```

## Чек-лист приёмки мастер-файла

- [ ] 1024×1024, PNG, фон чисто белый, без тени и пола, без текста и рамки.
- [ ] Один персонаж, полный рост, ничего не обрезано; смотрит в нужную сторону (герой — вправо, враг — влево).
- [ ] Ступни на одной линии, у нижнего края с отступом ~64 px; рост 80–90 % холста; центр по горизонтали.
- [ ] Пропорции ~6 голов, стойка idle (не атака, не бег).
- [ ] Видимая пиксельная сетка ~8 px, тёмный контур, без сглаживания и градиентов, одна ступень тени.
- [ ] Палитра приглушённая, единственный яркий цвет — красный акцент; никакого свечения и магии на самом спрайте (эффекты рисует `fx.ts`).
- [ ] Похож на эталон по «весу» линии и плотности деталей — рядом с Воином не выглядит из другой игры.

## Файлы

```
docs/art/reference-warrior.png        эталон стиля (мастер Воина)
art/masters/<id>.png                  мастера 1024 как отдал генератор (герои — id героя, враги — id врага)
art/masters/<id>-idle.png             лента 6144×1024, если есть
public/sprites/<id>.png               рабочий кадр 256 (делает скрипт)
public/sprites/<id>-idle.png          лента 1536×256 (делает скрипт)
public/sprites/<id>-portrait.png      портрет 128 (делает скрипт)
tools/art/prepare.py                  обработка: белый → прозрачность, ×¼ nearest, портрет
```

Подключение в игре: `SpriteSpec` получает вариант `{ type: 'sheet', frames, fps }`, `spriteImg` берёт `public/sprites/<id>.png`, если файл есть, иначе рисует старый процедурный спрайт — так HD-персонажи вводятся по одному, без остановки игры. Для HD-спрайтов `image-rendering: pixelated` остаётся (это пиксель-арт, только крупнее).

## Порядок ввода персонажей

Воин → остальные герои (Маг, Ассасин, Паладин, Берсерк, Лучник) → боссы шести локаций → элиты → рядовые. Враги идут пачками по локации, чтобы в одном бою не смешивались старые 16-px спрайты и новые.

## Фоны локаций

Второй трек той же работы (v0.41.1, первый фон — Лес): у локации вместо процедурной картинки из `backgrounds.ts` может быть нарисованная.

- **Мастер** — то, что отдал генератор, пропорция примерно **3:1** (у Леса 2157×729), хранится как есть в `art/<локация>-bg.png`.
- **Рабочие кадры** — два PNG 960×320 в `src/assets/backgrounds/<локация>-wide.png` и `-tall.png`. 960×320 — ровно тот прямоугольник, в который кадр забега кладёт и поле боя, и хаб: в логическом кадре 1:1, на FullHD ×2, поэтому `image-rendering: pixelated` не пересчитывает пиксели.
- **Варианты отличаются приближением, а не пропорцией:** `wide` — вся сцена под поле боя, `tall` — кусок в 1.5–2 раза крупнее, прижатый к земле, под карту и хабы (у Леса — фонарь у тропы).
- **Скрипт** `tools/location-bg.py`: уменьшает усреднением без сглаживания и квантует в 128 цветов (на глаз не отличается, файл втрое легче). Руками мастер не режем.

```bash
python tools/location-bg.py art/forest-bg.png --loc forest --zoom 1.6 --center 0.36
```

Подключение — строка в `PAINTED` (src/ui/backgrounds.ts); локации без арта рисует прежний `DRAWERS`, так что фоны вводятся по одному.

### Чего просить у генератора

Тот же STYLE, что у персонажей (тёмное фэнтези, пиксель-арт, приглушённая палитра, без сглаживания), плюс требования кадра:

- Горизонтальная сцена **3:1**, вид сбоку, глубина планами: передний план по краям кадра, средний — читаемый силуэт локации, дальний — небо или свод.
- **Нижняя четверть — сплошная полоса земли** во всю ширину (тропа, палуба, пол): на ней стоят герой слева и враги справа.
- **Середина кадра — спокойная и тёмная**: там будут спрайты, полоски HP и пилюли намерений. Яркое (луна, факелы, лава) — по краям и вверху.
- Никаких персонажей, текста, рамок и виньеток; поверх фона всегда ляжет затемнение 0.3–0.78, поэтому мастер может быть светлее, чем итог.

Чек-лист приёмки: земля идёт до обоих краёв без обрыва · середина не пестрит · в 960×320 читаются те же детали, что в мастере (мелкий узор превращается в кашу — просить крупнее) · рядом с Лесом смотрится как та же игра.

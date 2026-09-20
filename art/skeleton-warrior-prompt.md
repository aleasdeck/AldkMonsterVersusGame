# Скелет-воин: источник графики

Сгенерировано встроенным image_gen по пользовательскому референсу 2026-09-20.
Мастер: `art/skeleton-warrior-sheet.png`; рабочий файл: `src/assets/enemies/skeleton-warrior.webp` (пересборка: `sh tools/enemy-sheet.sh`, нужен `cwebp`).
8 колонок × 4 ряда: покой, удар, блок, получение урона. Рамки реальных фигур находятся в `src/ui/enemySprite.ts`: генератор не выдержал границы равномерной сетки на замахе.

## Исходный промпт

Use case: stylized-concept. Create a production 2D pixel-art animation spritesheet for the skeleton warrior from the attached REFERENCE IMAGE. Match its warm ivory bones, large readable skull with black sockets, rib cage, thin articulated limbs, brown round wooden shield and short steel sword, crisp pixel clusters and restrained warm shading. This is an ENEMY: every pose faces LEFT, towards the player, unlike the reference which faces right.
Output a wide 2048x1024 PNG with TRUE TRANSPARENT BACKGROUND, EXACTLY 8 columns and 4 rows of equal 256x256 cells. No borders, labels, text, floor, shadows or grid lines. One complete skeleton in every cell, same scale, same identity, feet baseline y=224 within every cell; idle body roughly 180px tall, generous margins for weapons, never cross cell boundaries. All cells share the same pivot at bottom center.
Row 1: 8 subtle looping idle frames, gentle breathing/sway and shield motion, first and last smoothly connect.
Row 2: 8 coherent sword attack frames: ready, slight recoil, wind-up sword raised, forward slash to LEFT, extension at frame5, follow through, recovery, back to ready. Shield stays equipped in every frame. Smooth consecutive motion.
Row 3: 8 shield block frames: raise round shield to LEFT, tuck head behind it, brace on impact, recover. Sword stays equipped.
Row 4: 8 hit reaction frames: small recoil backwards to RIGHT, skull tilts, torso recoils, knees bend, then recover fully. Character remains standing and alive, no disassembly.
Prioritize CONSISTENT anatomy, stable registration, clean alpha and readable silhouettes in every cell. No extra characters, no magic, no motion-smear backgrounds, no detached weapons.

## Уточнение

Edit the supplied spritesheet for production use. Preserve exactly 8 columns by 4 rows, same skeleton identity, warm ivory pixel art, brown wooden shield, steel sword, all facing left, same actions. FIX all red, green, yellow stray pixels and outlines outside the bone/wood/steel silhouette: absolutely NO red or green anywhere, clean dark brown outline only. True transparent alpha background, no colored fringe or scattered pixels. Give every 256x256 cell enough transparent margin on all sides, especially below feet. Exact equal grid 8x4. Every skeleton's feet align at 88 percent cell height. Keep scale identical across all 32 poses. Attack row 2 should be one continuous strike, not two wind-ups: frames 1 ready, 2 recoil, 3 sword raised, 4 swing, 5 extended left, 6 follow through, 7 lowering, 8 ready. Row1 subtle idle; row3 shield raise and recovery; row4 small hurt recoil and recovery. Clean polished game asset, pixel style matching input. Target 2048x1024 PNG transparent.

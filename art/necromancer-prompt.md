# Некромант — мастер анимаций

Встроенный ImageGen; референс — `art/necromancer-concepts/01-hood.png`.
Фактический мастер имеет 6 кадров в рядах 1–6 и 5 кадров гибели в последнем ряду; границы измеряются отдельно.

```text
Create a production game sprite animation atlas for the EXACT necromancer shown in the reference. Preserve his human gaunt face (NOT a skeleton face), large purple hood, purple tattered robe, skull clasp, brown belt and boots, wooden crooked staff with ivory skull and green fire. Same detailed chunky pixel art style, warm bone highlights and dark brown outlines. Character faces LEFT in every frame, three-quarter side view, staff in his forward hand and free casting hand. No redesign, no new armor, no beard.

ONE transparent PNG sheet, requested 2400x2800 pixels, STRICT uniform grid of 6 columns by 7 rows = 42 full-body frames, each cell 400x400. Transparent background with genuine alpha, no painted checkerboard, no text, labels, separators, scenery or ground shadows. Each entire figure AND staff/flames stay within their own cell, 30px safe margins. Every standing pose has same head scale, same feet positions and feet baseline at cell y=366. Character head-to-foot height about 250px, taller staff kept below y=30. No other characters, no actual summoned skeletons, no detached projectile (engine handles projectiles).

Read each row left to right, 6 sequential phases:
Row 1 IDLE: 1 neutral original standing; 2 slight inhale; 3 robe and free hand shift subtly; 4 exhale; 5 settle; 6 neutral identical to first. Feet planted, flame flickers.
Row 2 DARK BOLT: 1 neutral; 2 draw free hand back and gather small purple orb; 3 twist torso slightly with charged palm; 4 thrust palm LEFT at shoulder height, release pose, purple energy at fingertips only; 5 follow-through; 6 return neutral. Staff remains held, no detached projectile.
Row 3 RAISE SKELETON: 1 neutral; 2 lean forward lower free hand toward ground; 3 sweep free arm upward while lifting staff slightly; 4 free hand high calling upward, green glow; 5 lower arms; 6 neutral. No extra creatures or circles.
Row 4 CURSE: 1 neutral; 2 gather violet magic close to chest; 3 extend free clawed hand halfway toward LEFT; 4 point fully LEFT casting curse, violet wisps from fingers; 5 retract; 6 neutral.
Row 5 GUARD: 1 neutral; 2 pull staff across front of torso; 3 brace staff diagonally as protective green crescent appears close to chest; 4 hold braced guard; 5 lower staff; 6 neutral.
Row 6 HURT: 1 neutral; 2 recoil torso away from hit arriving from LEFT, head tilts right; 3 deeper recoil and bent knees, staff still held; 4 start straightening; 5 recover; 6 neutral. Feet remain planted.
Row 7 DEATH: 1 recoil; 2 knees buckle; 3 fall to knees with staff tipping; 4 slump toward right; 5 collapse, robe and staff on ground; 6 still collapsed lying on ground. Fully contained in cell. Death changes body position naturally but same scale.

IMPORTANT: exact 6 columns and 7 rows, complete 42 cells. Sufficient separation. Smooth readable sequences, no repeated casting during recovery. First and last frames of rows 1-6 must share same neutral standing pose for seamless transitions.
```

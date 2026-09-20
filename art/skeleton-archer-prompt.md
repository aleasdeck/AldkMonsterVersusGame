# Скелет-лучник — задание генератору

Создан встроенным imagegen. Референс стиля: `art/skeleton-warrior-sheet.png`.
Фактический результат: `art/skeleton-archer-sheet.png`, 1254×1254, RGBA, 4×4 позы.
Запрошенный размер ниже отличается от полученного; рендер использует измеренные границы.

```text
Create a NEW game sprite animation atlas for a SKELETON ARCHER matching the attached skeleton warrior's art style, skull shape, warm ivory bone palette, dark brown pixel outlines, detailed chunky pixel rendering and character proportions. The input is a STYLE reference only: replace sword and shield with a wooden recurve bow, thin visible bowstring, arrow, small brown back quiver and simple brown leather strap. The skeleton faces LEFT in every frame, same camera and same character throughout. No shield, no sword, no helmet, no clothing that hides the rib cage.
Deliver a single transparent PNG sprite sheet, exactly 4 columns and 4 rows, 16 complete full-body poses. Requested canvas 1536 by 1536, equal 384 by 384 cells. Each character fits entirely inside its own cell with at least 30px safety margin including bow, and feet on the same baseline at cell y=350. Character head-to-foot height about 260px. Consistent foot positions, height, skull and proportions across cells. No labels, no grid lines, no scenery, no shadows, no text, no watermark. Genuine alpha transparency, no checkerboard background.
Read frames left-to-right, top-to-bottom:
Row 1 (4 idle poses): neutral planted stance bow lowered diagonally left, gentle torso weight shifts and small head tilt, feet firmly planted, last pose returns to neutral.
Row 2 (first half of shooting action): 1 neutral bow low; 2 raise bow arm toward left, arrow nocked; 3 bow at shoulder height and pulling string halfway toward face with back hand; 4 fully drawn bow, draw hand at cheek, arrow perfectly horizontal pointing LEFT, bow bends under tension, feet stay planted.
Row 3 (second half shooting): 1 same fully drawn aiming pose; 2 release, rear fingers open near cheek and string returns forward, arrow just leaving to left BUT remains entirely within cell; 3 follow-through bow arm stays forward, arrow has left and is absent; 4 lower empty bow and return toward first idle pose.
Row 4 (hit reaction): 1 small flinch from impact arriving from left; 2 torso and skull tilt back to right with knees bent, bow still held; 3 recovering and straightening; 4 same neutral idle stance as first cell.
Make all 16 cells well separated and suitable to crop and sequence into a smooth GIF. Anatomically readable arm movement: front hand holds bow grip, rear hand pulls string, do not confuse arms with bow limbs. This must look like a sibling unit to the reference skeleton warrior, with the same production-quality game pixel art.
```

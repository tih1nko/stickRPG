Place sprite sheets here.

Expected file for current human sheet configuration:
  human_standard32.png

Specs:
  0-3   idle (4)
  4-11  walk (8)
 12-15  attack (4)
 16-19  cast (4)
 20-21  hurt (2)
 22-27  death (6)
 28-31  crit (4)

human_standard64.png
 - 8 columns x 4 rows = 32 frames
 - Each frame 64x96 px, transparent background
 - Animation index mapping:
   0-3   idle (breathing)
   4-11  walk (8 frames)
   12-15 attack melee (anticipation, windup, impact, recoil)
   16-19 cast/skill
   20-21 hurt (light, heavy)
   22-27 death (stagger→fall→ground)
   28-31 crit/special (windup, impact, flare, settle)
 - System auto-extracts tight bounding boxes and pivot (baseline) for variable layout.
Put additional sheets (e.g. armor overlays) alongside and register them in code.

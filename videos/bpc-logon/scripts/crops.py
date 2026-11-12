"""Recorta las capturas de las guías PDF (rasterizadas a 2x) para el video.
Uso: python3 -I scripts/crops.py <carpeta_png_raw> <carpeta_salida>
Las coordenadas están en px de la diapositiva (1456 o 1333 de ancho) y se multiplican x2.
Las cajas 'blur' difuminan datos personales (fotos, OneID)."""
import sys, os
from PIL import Image, ImageFilter

RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
C = {
  'sf_quick':      ('sf-2.png',  (60, 225, 1340, 585), []),
  'sf_search':     ('sf-3.png',  (115, 140, 700, 725), []),
  'sf_course':     ('sf-4.png',  (80, 110, 940, 340), []),
  'acc_support':   ('acc-02.png', (107, 172, 990, 462), []),
  'acc_roles':     ('acc-04.png', (108, 262, 823, 670), []),
  'acc_neo':       ('acc-05.png', (80, 270, 595, 637), []),
  'acc_quick':     ('acc-05.png', (960, 315, 1297, 525), []),
  'acc_arc':       ('acc-06.png', (110, 165, 630, 388), []),
  'acc_addsys':    ('acc-07.png', (105, 162, 960, 497), []),
  'acc_p52':       ('acc-08.png', (110, 222, 530, 668), []),
  'acc_p52sel':    ('acc-08.png', (715, 215, 1100, 680), []),
  'acc_addrole':   ('acc-09.png', (115, 178, 812, 330), []),
  'acc_rolesearch':('acc-10.png', (105, 200, 800, 410), []),
  'acc_roleavail': ('acc-10.png', (105, 465, 790, 670), []),
  'acc_usersys':   ('acc-12.png', (35, 355, 565, 490), []),
  'acc_group':     ('acc-12.png', (637, 215, 1000, 698), []),
  'acc_submit':    ('acc-13.png', (40, 410, 1302, 680), []),
  'an_start':      ('an-2.png',  (527, 117, 1257, 745), [(1158, 205, 1190, 235)]),
  'an_popup':      ('an-3.png',  (288, 215, 1168, 603), []),
  'an_portal':     ('an-4.png',  (0, 236, 1456, 756), [(1205, 240, 1255, 288)]),
  'an_results':    ('an-5.png',  (115, 245, 618, 738), []),
  'an_file':       ('an-6.png',  (20, 228, 1436, 590), []),
  'an_about':      ('an-7.png',  (115, 215, 1100, 740), [(255, 278, 870, 298)]),
  'con_folder':    ('con-2.png', (135, 518, 1004, 737), [(578, 552, 622, 574)]),
  'con_logon':     ('con-3.png', (135, 225, 1300, 755), []),
  'con_manager':   ('con-4.png', (105, 205, 870, 745), []),
  'epm_analysis':  ('epm-2.png', (605, 188, 1225, 730), [(1148, 255, 1178, 282)]),
  'epm_epm':       ('epm-3.png', (538, 205, 1170, 755), [(1086, 272, 1116, 300)]),
  'epm_ribbon':    ('epm-4.png', (35, 200, 1436, 615), []),
}
manifest = {}
for name, (f, box, blurs) in C.items():
    im = Image.open(os.path.join(RAW, f)).convert('RGB')
    for b in blurs:
        bb = tuple(v * 2 for v in b)
        im.paste(im.crop(bb).filter(ImageFilter.GaussianBlur(14)), bb[:2])
    crop = im.crop(tuple(v * 2 for v in box))
    crop.save(os.path.join(OUT, name + '.png'), optimize=True)
    manifest[name] = {'ox': box[0], 'oy': box[1], 'w': crop.size[0], 'h': crop.size[1], 'scale': 2}
    print(name, crop.size)
import json
manifest['epm_logon_dialog'] = {'ox': 0, 'oy': 0, 'w': 1600, 'h': 541, 'scale': 1}
with open(os.path.join(os.path.dirname(__file__), '..', 'src', 'shots.json'), 'w') as f: json.dump(manifest, f, indent=1)

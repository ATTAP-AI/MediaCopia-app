"""Generates the MediaCopia cornucopia logo (full) and the simplified browser-tab icon as SVG."""
import math, sys, os

OUT = sys.argv[1]

def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
            u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1])

def tangent(p0, p1, p2, p3, t):
    u = 1 - t
    dx = 3*u*u*(p1[0]-p0[0]) + 6*u*t*(p2[0]-p1[0]) + 3*t*t*(p3[0]-p2[0])
    dy = 3*u*u*(p1[1]-p0[1]) + 6*u*t*(p2[1]-p1[1]) + 3*t*t*(p3[1]-p2[1])
    l = math.hypot(dx, dy) or 1
    return dx/l, dy/l

def f(v): return f"{v:.1f}".rstrip('0').rstrip('.')

def horn(P, W0, tipw, n=64, ribs=(), rib_w=5, power=1.12):
    """Outline of a tapered horn along cubic P (mouth at t=0, tip at t=1)."""
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        c = bez(*P, t); tx, ty = tangent(*P, t)
        nx, ny = -ty, tx
        w = max(tipw, W0 * (1 - t) ** power) / 2
        left.append((c[0] + nx*w, c[1] + ny*w)); right.append((c[0] - nx*w, c[1] - ny*w))
    # rounded tip
    tip = bez(*P, 1); ttx, tty = tangent(*P, 1)
    tipc = (tip[0] + ttx*tipw*0.6, tip[1] + tty*tipw*0.6)
    d = f"M{f(left[0][0])} {f(left[0][1])}" + "".join(f"L{f(x)} {f(y)}" for x, y in left[1:])
    d += f"Q{f(tipc[0])} {f(tipc[1])} {f(right[-1][0])} {f(right[-1][1])}"
    d += "".join(f"L{f(x)} {f(y)}" for x, y in reversed(right[:-1])) + "Z"
    # highlight band along the upper edge, and shade along the lower edge
    hi = [(c[0], c[1]) for c in left]
    def band(edge, inner_frac, side):
        pts_o, pts_i = [], []
        for i in range(n + 1):
            t = i / n
            c = bez(*P, t); tx, ty = tangent(*P, t); nx, ny = -ty, tx
            w = max(tipw, W0 * (1 - t) ** power) / 2
            pts_o.append((c[0] + side*nx*w, c[1] + side*ny*w))
            pts_i.append((c[0] + side*nx*w*inner_frac, c[1] + side*ny*w*inner_frac))
        k = int(n * 0.93)
        s = f"M{f(pts_o[0][0])} {f(pts_o[0][1])}" + "".join(f"L{f(x)} {f(y)}" for x, y in pts_o[1:k])
        s += "".join(f"L{f(x)} {f(y)}" for x, y in reversed(pts_i[:k])) + "Z"
        return s
    hl = band(left, 0.45, 1)
    sh = band(right, 0.35, -1)
    rib_paths = []
    for t in ribs:
        c = bez(*P, t); tx, ty = tangent(*P, t); nx, ny = -ty, tx
        w = max(tipw, W0 * (1 - t) ** power) / 2
        a = (c[0] + nx*w*0.97, c[1] + ny*w*0.97); b = (c[0] - nx*w*0.97, c[1] - ny*w*0.97)
        ctrl = (c[0] + tx*w*0.42, c[1] + ty*w*0.42)
        rib_paths.append(f"M{f(a[0])} {f(a[1])}Q{f(ctrl[0])} {f(ctrl[1])} {f(b[0])} {f(b[1])}")
    m0, m1 = left[0], right[0]
    return d, hl, sh, rib_paths, (m0, m1)

# ---- glyphs, drawn in a 100x100 tile, white on the tile colour ----
def glyph(kind, col):
    W = '#fff'
    if kind == 'book':
        return (f'<path d="M20 31c11-5 22-4 30 3 8-7 19-8 30-3v41c-11-5-22-4-30 3-8-7-19-8-30-3z" fill="{W}"/>'
                f'<path d="M50 35v40" stroke="{col}" stroke-width="4" stroke-linecap="round"/>'
                f'<path d="M27 42c6-2 12-1 17 2M27 51c6-2 12-1 17 2M56 44c5-3 11-4 17-2M56 53c5-3 11-4 17-2" stroke="{col}" stroke-width="3" stroke-linecap="round" fill="none" opacity=".55"/>')
    if kind == 'film':
        return (f'<rect x="21" y="45" width="58" height="34" rx="6" fill="{W}"/>'
                f'<g transform="rotate(-15 21 43)"><rect x="21" y="28" width="58" height="13" rx="3" fill="{W}"/>'
                f'<path d="M33 28l-7 13M47 28l-7 13M61 28l-7 13M75 28l-7 13" stroke="{col}" stroke-width="4.5"/></g>'
                f'<path d="M21 56h58" stroke="{col}" stroke-width="3" opacity=".5"/>')
    if kind == 'note':
        return (f'<path d="M41 70V34l34-9v37" stroke="{W}" stroke-width="7" fill="none" stroke-linejoin="round"/>'
                f'<path d="M41 34l34-9v10l-34 9z" fill="{W}"/>'
                f'<ellipse cx="33" cy="71" rx="10.5" ry="8" transform="rotate(-22 33 71)" fill="{W}"/>'
                f'<ellipse cx="67" cy="63" rx="10.5" ry="8" transform="rotate(-22 67 63)" fill="{W}"/>')
    if kind == 'play':
        return f'<path d="M39 28l35 22-35 22z" fill="{W}" stroke="{W}" stroke-width="8" stroke-linejoin="round"/>'
    if kind == 'tv':
        return (f'<path d="M40 21l10 10 10-10" stroke="{W}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
                f'<rect x="17" y="31" width="66" height="45" rx="9" fill="{W}"/>'
                f'<rect x="24" y="38" width="52" height="31" rx="5" fill="{col}"/>'
                f'<path d="M45 46l12 7.5-12 7.5z" fill="{W}"/>'
                f'<path d="M37 82h26" stroke="{W}" stroke-width="5" stroke-linecap="round"/>')
    if kind == 'chat':
        return (f'<path d="M27 26h46a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10H50L36 85V74h-9a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10z" fill="{W}"/>'
                f'<path d="M50 64c-11-7-15-12-15-17.5a7 7 0 0 1 15-3 7 7 0 0 1 15 3C65 52 61 57 50 64z" fill="{col}"/>')
    if kind == 'game':
        return (f'<path d="M31 34h38c11 0 16 9 18 22s-2 21-10 19c-6-1-9-11-15-11H38c-6 0-9 10-15 11-8 2-12-6-10-19s7-22 18-22z" fill="{W}"/>'
                f'<path d="M33 43v14M26 50h14" stroke="{col}" stroke-width="5" stroke-linecap="round"/>'
                f'<circle cx="64" cy="46" r="4" fill="{col}"/><circle cx="72" cy="53" r="4" fill="{col}"/>')
    if kind == 'phones':
        return (f'<path d="M24 62v-8a26 26 0 0 1 52 0v8" stroke="{W}" stroke-width="7" fill="none" stroke-linecap="round"/>'
                f'<rect x="19" y="56" width="17" height="25" rx="7" fill="{W}"/><rect x="64" y="56" width="17" height="25" rx="7" fill="{W}"/>')
    raise ValueError(kind)

def tile(i, kind, col, cx, cy, s, rot, gloss=True):
    k = s / 100
    return (f'<g transform="translate({f(cx)} {f(cy)}) rotate({rot}) scale({k:.3f}) translate(-50 -50)" filter="url(#sh)">'
            f'<rect width="100" height="100" rx="26" fill="url(#t{i})"/>'
            + (f'<path d="M26 4h48a22 22 0 0 1 22 22v4C70 20 30 20 4 34v-8A22 22 0 0 1 26 4z" fill="#fff" opacity=".2"/>' if gloss else '')
            + glyph(kind, col) + '</g>')

def tile_grad(i, c1, c2):
    return f'<linearGradient id="t{i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>'

def star(x, y, r, col, op=1):
    q = r * 0.28
    return (f'<path d="M{f(x)} {f(y-r)}Q{f(x+q)} {f(y-q)} {f(x+r)} {f(y)}Q{f(x+q)} {f(y+q)} {f(x)} {f(y+r)}'
            f'Q{f(x-q)} {f(y+q)} {f(x-r)} {f(y)}Q{f(x-q)} {f(y-q)} {f(x)} {f(y-r)}Z" fill="{col}" opacity="{op}"/>')

# ---------------------------------------------------------------- full logo
P = ((280, 284), (212, 352), (58, 452), (88, 312))     # mouth → curling tip
d, hl, sh, ribs, (m0, m1) = horn(P, 186, 6, ribs=(0.12, 0.25, 0.38, 0.5, 0.62, 0.73, 0.83))
mc = ((m0[0]+m1[0])/2, (m0[1]+m1[1])/2)
mang = math.degrees(math.atan2(m1[1]-m0[1], m1[0]-m0[0]))
mlen = math.hypot(m1[0]-m0[0], m1[1]-m0[1]) / 2

ITEMS = [  # kind, light, base, angle° from the mouth, distance, size, rotation — a spray that widens as it leaves the horn
    ('book',   '#fcd34d', '#f59e0b', -138, 200, 78, -18),
    ('film',   '#fb7185', '#e11d48', -110, 205, 78, -9),
    ('note',   '#f9a8d4', '#db2777', -94, 124, 74, -6),
    ('play',   '#67e8f9', '#0891b2', -50, 198, 94, 10),
    ('tv',     '#93c5fd', '#2563eb', -8, 124, 74, 14),
    ('chat',   '#6ee7b7', '#059669', 28, 182, 78, 20),
    ('game',   '#c4b5fd', '#7c3aed', 60, 166, 78, -14),
    ('phones', '#fdba74', '#ea580c', -45, 6, 72, -8),   # still half inside the mouth
]
O = mc
OUT_DIR = math.radians(-45)
defs = [
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1660"/><stop offset=".55" stop-color="#1a0f3d"/><stop offset="1" stop-color="#0e0822"/></linearGradient>',
    f'<radialGradient id="glow" cx="{f(mc[0]+40)}" cy="{f(mc[1]-40)}" r="250" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f59e0b" stop-opacity=".55"/><stop offset=".45" stop-color="#e0479e" stop-opacity=".22"/><stop offset="1" stop-color="#5b4cf0" stop-opacity="0"/></radialGradient>',
    f'<radialGradient id="beam" cx="{f(mc[0])}" cy="{f(mc[1])}" r="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fde68a" stop-opacity=".42"/><stop offset=".55" stop-color="#fde68a" stop-opacity=".1"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient>',
    f'<linearGradient id="horn" x1="84" y1="400" x2="{f(mc[0])}" y2="{f(mc[1])}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6d28d9"/><stop offset=".5" stop-color="#e0479e"/><stop offset="1" stop-color="#fbbf24"/></linearGradient>',
    '<radialGradient id="mouth" cx=".42" cy=".5" r=".6"><stop offset="0" stop-color="#1c0716"/><stop offset=".7" stop-color="#3d0f2b"/><stop offset="1" stop-color="#7a1f45"/></radialGradient>',
    '<filter id="sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#05010f" flood-opacity=".55"/></filter>',
    '<filter id="hsh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#05010f" flood-opacity=".6"/></filter>',
    '<clipPath id="sq"><rect width="512" height="512" rx="112"/></clipPath>',
    '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>',
]
# what's visible of something coming out of the horn: the opening itself, plus everything on the far side of the rim
ux, uy = (m1[0]-m0[0]) / (2*mlen), (m1[1]-m0[1]) / (2*mlen)
ox, oy = math.cos(OUT_DIR), math.sin(OUT_DIR)
A = (m0[0]-ux*400, m0[1]-uy*400); B = (m1[0]+ux*400, m1[1]+uy*400)
C = (B[0]+ox*600, B[1]+oy*600); D = (A[0]+ox*600, A[1]+oy*600)
mry = mlen * 0.36
mouth_el = f'<ellipse cx="{f(mc[0])}" cy="{f(mc[1])}" rx="{f(mlen)}" ry="{f(mry)}" transform="rotate({f(mang)} {f(mc[0])} {f(mc[1])})"'
defs.append(f'<clipPath id="emerge">{mouth_el}/><path d="M{f(A[0])} {f(A[1])}L{f(B[0])} {f(B[1])}L{f(C[0])} {f(C[1])}L{f(D[0])} {f(D[1])}Z"/></clipPath>')
front_lip = f'<path d="M{f(-mlen)} 0A{f(mlen)} {f(mry)} 0 0 0 {f(mlen)} 0" transform="translate({f(mc[0])} {f(mc[1])}) rotate({f(mang)})" fill="none" stroke="#fde68a" stroke-width="8" stroke-linecap="round"/>'
# the beam of light out of the opening
far1 = (mc[0] + 340*math.cos(math.radians(-138)), mc[1] + 340*math.sin(math.radians(-138)))
far2 = (mc[0] + 340*math.cos(math.radians(62)), mc[1] + 340*math.sin(math.radians(62)))
beam = f'<path d="M{f(m0[0])} {f(m0[1])}L{f(far1[0])} {f(far1[1])}Q{f(mc[0]+420*ox)} {f(mc[1]+420*oy)} {f(far2[0])} {f(far2[1])}L{f(m1[0])} {f(m1[1])}Z" fill="url(#beam)" filter="url(#soft)"/>'
tiles, trails = [], []
for i, (kind, c1, c2, ang, dist, s, rot) in enumerate(ITEMS):
    defs.append(tile_grad(i, c1, c2))
    a = math.radians(ang)
    cx, cy = O[0] + dist*math.cos(a), O[1] + dist*math.sin(a)
    tiles.append(tile(i, kind, c2, cx, cy, s, rot))
    if dist > 60:
        # a comet trail in the tile's own colour, fading back into the mouth
        sx, sy = O[0] + 26*math.cos(a), O[1] + 26*math.sin(a)
        px, py = -(cy-sy), (cx-sx); pl = math.hypot(px, py); px, py = px/pl, py/pl
        w = s * 0.3
        defs.append(f'<linearGradient id="tr{i}" x1="{f(sx)}" y1="{f(sy)}" x2="{f(cx)}" y2="{f(cy)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{c1}" stop-opacity="0"/><stop offset=".55" stop-color="{c1}" stop-opacity=".22"/><stop offset="1" stop-color="{c1}" stop-opacity=".5"/></linearGradient>')
        trails.append(f'<path d="M{f(sx)} {f(sy)}L{f(cx+px*w)} {f(cy+py*w)}L{f(cx-px*w)} {f(cy-py*w)}Z" fill="url(#tr{i})"/>')
far, near = tiles[:-1], tiles[-1:]

sparkles = ''.join([star(118, 262, 13, '#fde68a', .95), star(300, 40, 9, '#fff', .9), star(488, 250, 8, '#fde68a', .9),
                    star(250, 452, 10, '#fff', .75), star(110, 70, 6, '#f9a8d4', .9), star(470, 470 - 150, 7, '#fff', .9), star(330, 250, 7, '#fff', .95)])
# confetti thrown out with the tiles: denser near the mouth
dots = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}" opacity="{o}"/>' for x, y, r, c, o in [
    (330, 226, 5, '#fcd34d', .95), (346, 252, 3.5, '#67e8f9', .95), (318, 206, 3.5, '#f9a8d4', .9), (352, 286, 4, '#c4b5fd', .9),
    (296, 200, 3, '#6ee7b7', .9), (372, 222, 3, '#fb7185', .85), (240, 196, 4, '#fcd34d', .8), (386, 330, 4, '#93c5fd', .8),
    (210, 150, 3, '#fb7185', .7), (430, 200, 3.5, '#fcd34d', .75), (300, 120, 3, '#93c5fd', .7)])

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="t">
<title id="t">MediaCopia</title>
<defs>{''.join(defs)}</defs>
<g clip-path="url(#sq)">
<rect width="512" height="512" fill="url(#bg)"/>
<rect width="512" height="512" fill="url(#glow)"/>
{beam}
{sparkles}
{''.join(trails)}
{''.join(far)}
<g filter="url(#hsh)">
<path d="{d}" fill="url(#horn)"/>
<path d="{sh}" fill="#1a0533" opacity=".28"/>
<path d="{hl}" fill="#fff" opacity=".2"/>
{''.join(f'<path d="{r}" fill="none" stroke="#2a0a3d" stroke-opacity=".35" stroke-width="7" stroke-linecap="round" transform="translate(2 3)"/><path d="{r}" fill="none" stroke="#fff3c4" stroke-opacity=".55" stroke-width="4.5" stroke-linecap="round"/>' for r in ribs)}
{mouth_el} fill="url(#mouth)" stroke="#fde68a" stroke-width="8"/>
</g>
{dots}
<g clip-path="url(#emerge)">{''.join(near)}</g>
{front_lip}
</g>
</svg>"""
open(os.path.join(OUT, 'logo.svg'), 'w').write(svg)

# ---------------------------------------------------------------- tab icon (64 grid, bold shapes, readable at 16px)
P2 = ((36, 37), (28, 45), (13, 55), (9, 40))
d2, hl2, sh2, ribs2, (n0, n1) = horn(P2, 27, 2.2, ribs=(0.3, 0.6), power=1.05)
nc = ((n0[0]+n1[0])/2, (n0[1]+n1[1])/2)
nang = math.degrees(math.atan2(n1[1]-n0[1], n1[0]-n0[0]))
nlen = math.hypot(n1[0]-n0[0], n1[1]-n0[1]) / 2
def sq(x, y, s, rot, c1, c2, inner=''):
    return (f'<g transform="translate({x} {y}) rotate({rot})"><rect x="{-s/2}" y="{-s/2}" width="{s}" height="{s}" rx="{s*0.28:.1f}" fill="url(#{c1})"/>{inner}</g>')
fav = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f1870"/><stop offset="1" stop-color="#130b30"/></linearGradient>
<linearGradient id="horn" x1="10" y1="52" x2="{f(nc[0])}" y2="{f(nc[1])}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7c3aed"/><stop offset=".5" stop-color="#ec4899"/><stop offset="1" stop-color="#fbbf24"/></linearGradient>
<linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#0891b2"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9a8d4"/><stop offset="1" stop-color="#db2777"/></linearGradient>
<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
<linearGradient id="e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ee7b7"/><stop offset="1" stop-color="#059669"/></linearGradient>
</defs>
<rect width="64" height="64" rx="15" fill="url(#bg)"/>
{sq(16, 18, 14, -14, 'c', 'c')}
{sq(31, 10, 14, 4, 'b', 'b')}
{sq(53, 44, 14, 16, 'e', 'e')}
<path d="{d2}" fill="url(#horn)"/>
<path d="{hl2}" fill="#fff" opacity=".22"/>
{''.join(f'<path d="{r}" fill="none" stroke="#fff3c4" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/>' for r in ribs2)}
<ellipse cx="{f(nc[0])}" cy="{f(nc[1])}" rx="{f(nlen)}" ry="{f(nlen*0.42)}" transform="rotate({f(nang)} {f(nc[0])} {f(nc[1])})" fill="#2a0b22" stroke="#fde68a" stroke-width="1.8"/>
<g transform="translate(49 22) rotate(10)"><rect x="-10" y="-10" width="20" height="20" rx="6" fill="url(#a)"/><path d="M-3 -5.4l8.2 5.4-8.2 5.4z" fill="#fff" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></g>
</svg>'''
open(os.path.join(OUT, 'favicon.svg'), 'w').write(fav)
print('ok', len(svg), len(fav))

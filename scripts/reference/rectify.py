"""Straighten a phone photo of the device screen into a flat 640 x 480 image.

    pip install numpy pillow
    python3 scripts/reference/rectify.py photo.jpg public/reference/phrase-screen.jpg
    python3 scripts/reference/rectify.py photo.jpg out.jpg --scale 2 --tl 292,472

Finds the lit screen's four edges (the dark-blue themes read as "lit" where
blue clearly beats red), fits a line to each, and maps the quad to 640 x 480
x scale. Glare can pull an edge: check that text starts at the same x on every
row of the result and nudge a corner with --tl/--tr/--bl/--br x,y (photo px).
public/reference/song-screen.jpg was made with
    --tl 292,472 --tr 1693.9,505.8 --bl 220.5,1503.1 --br 1661,1620.4
(glare on the left pulled the automatic top-left and bottom-left corners).
"""

import argparse

import numpy as np
from PIL import Image


def fit(xs, ys):
    a = np.vstack([xs, np.ones(len(xs))]).T
    return np.linalg.lstsq(a, np.array(ys, float), rcond=None)[0]


def robust(pairs):
    a = np.array(pairs, float)
    m, c = fit(a[:, 0], a[:, 1])
    for _ in range(4):
        res = np.abs(a[:, 1] - (m * a[:, 0] + c))
        keep = res < max(1.5, np.median(res) * 2.5)
        m, c = fit(a[keep, 0], a[keep, 1])
    return m, c


def run_start(values, n=6):
    count = 0
    for i, v in enumerate(values):
        count = count + 1 if v else 0
        if count >= n:
            return i - n + 1
    return None


def find_corners(img):
    rgb = np.asarray(img).astype(float)
    r, b = rgb[..., 0], rgb[..., 2]
    lit = (b > 40) & (b - r > 12)
    # The screen is the longest run of rows (then columns) that are mostly
    # lit; this ignores other blue things in the photo, such as an LED ring.
    def longest_run(mask):
        best, start = (0, 0, 0), None
        for i, v in enumerate(list(mask) + [False]):
            if v and start is None:
                start = i
            elif not v and start is not None:
                if i - start > best[0]:
                    best = (i - start, start, i - 1)
                start = None
        return best[1], best[2]
    y0, y1 = longest_run(lit.mean(axis=1) > 0.2)
    x0, x1 = longest_run(lit[y0:y1 + 1].mean(axis=0) > 0.3)
    top, bot, left, right = [], [], [], []
    for x in range(x0 + (x1 - x0) // 10, x1 - (x1 - x0) // 10, 8):
        y = run_start(lit[y0:y0 + (y1 - y0) // 3, x])
        if y is not None:
            top.append((x, y + y0))
        y = run_start(lit[y1:y1 - (y1 - y0) // 3:-1, x])
        if y is not None:
            bot.append((x, y1 - y))
    for y in range(y0 + (y1 - y0) // 10, y1 - (y1 - y0) // 10, 8):
        x = run_start(lit[y, x0:x0 + (x1 - x0) // 3])
        if x is not None:
            left.append((y, x + x0))
        x = run_start(lit[y, x1:x1 - (x1 - x0) // 3:-1])
        if x is not None:
            right.append((y, x1 - x))
    lines = {k: robust(v) for k, v in [('top', top), ('bot', bot), ('left', left), ('right', right)]}

    def meet(hl, vl):
        hm, hc = hl
        vm, vc = vl
        y = (hm * vc + hc) / (1 - hm * vm)
        return [vm * y + vc, y]

    return {
        'tl': meet(lines['top'], lines['left']),
        'tr': meet(lines['top'], lines['right']),
        'bl': meet(lines['bot'], lines['left']),
        'br': meet(lines['bot'], lines['right']),
    }


def rectify(img, corners, scale):
    w, h = 640 * scale, 480 * scale
    dst = [(0, 0), (w, 0), (0, h), (w, h)]
    src = [corners[k] for k in ('tl', 'tr', 'bl', 'br')]
    a, bvec = [], []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        bvec.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        bvec.append(v)
    coef = np.linalg.solve(np.array(a, float), np.array(bvec, float))
    return img.transform((int(w), int(h)), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('photo')
    p.add_argument('out')
    p.add_argument('--scale', type=int, default=2, help='output = 640 x 480 x scale (default 2)')
    for k in ('tl', 'tr', 'bl', 'br'):
        p.add_argument(f'--{k}', help=f'override the {k} corner, "x,y" in photo px')
    args = p.parse_args()
    img = Image.open(args.photo).convert('RGB')
    corners = find_corners(img)
    for k in ('tl', 'tr', 'bl', 'br'):
        if getattr(args, k):
            corners[k] = [float(v) for v in getattr(args, k).split(',')]
    print('corners (photo px):', {k: [round(v, 1) for v in c] for k, c in corners.items()})
    rectify(img, corners, args.scale).save(args.out, quality=90)
    print('wrote', args.out)


if __name__ == '__main__':
    main()

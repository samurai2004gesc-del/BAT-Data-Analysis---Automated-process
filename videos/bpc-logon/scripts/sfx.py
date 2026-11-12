"""Sintetiza los efectos de sonido y la música de fondo (sin muestras externas, sin licencias).
Uso: python3 scripts/sfx.py  ->  public/sfx/*.wav"""
import os, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sfx')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def save(name, x, stereo=None):
    if stereo is None:
        stereo = np.stack([x, x], axis=1)
    peak = np.max(np.abs(stereo)) or 1
    y = (stereo / peak * 0.89 * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())


def t(sec):
    return np.arange(int(SR * sec)) / SR


def lowpass(x, cutoff):
    """Filtro de un polo con corte variable (cutoff puede ser array)."""
    cutoff = np.broadcast_to(cutoff, x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def env(n, a, r):
    e = np.ones(n)
    na, nr = int(SR * a), int(SR * r)
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


# Whoosh: ruido filtrado con barrido
tt = t(0.7)
noise = rng.standard_normal(len(tt))
sweep = 300 + 5200 * np.sin(np.pi * tt / tt[-1]) ** 2
w = lowpass(noise, sweep) - lowpass(noise, sweep * 0.25)
w *= np.sin(np.pi * tt / tt[-1]) ** 1.6
pan = np.linspace(-0.7, 0.7, len(tt))
save('whoosh', w, np.stack([w * (1 - pan) / 2, w * (1 + pan) / 2], axis=1))

# Click de mouse
tt = t(0.06)
c = (rng.standard_normal(len(tt)) * np.exp(-tt * 140) + np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt * 90) * 0.6)
save('click', c)

# Pop suave (aparece un elemento)
tt = t(0.18)
f = 520 * np.exp(-tt * 9) + 380
p = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 22)
save('pop', p)

# Tecleo (para campos de texto)
tt = t(0.035)
k = rng.standard_normal(len(tt)) * np.exp(-tt * 260)
k = k - lowpass(k, 900)
save('key', k)

# Éxito: arpegio brillante
tt = t(1.4)
s = np.zeros(len(tt))
for i, fr in enumerate([523.25, 659.25, 783.99, 1046.5]):
    st = int(SR * 0.09 * i)
    seg = tt[: len(tt) - st]
    s[st:] += (np.sin(2 * np.pi * fr * seg) + 0.3 * np.sin(2 * np.pi * 2 * fr * seg)) * np.exp(-seg * 3.2) * 0.5
save('success', s)

# Obturador de cámara
tt = t(0.25)
sh = rng.standard_normal(len(tt)) * (np.exp(-tt * 60) + 0.6 * np.exp(-np.maximum(tt - 0.09, 0) * 70) * (tt > 0.09))
save('shutter', sh - lowpass(sh, 600))

# Impacto grave para el logo
tt = t(2.2)
f = 90 * np.exp(-tt * 3) + 38
b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 2.2)
shimmer = lowpass(rng.standard_normal(len(tt)), 7000) * np.exp(-tt * 1.5) * 0.25
save('impact', b + shimmer - lowpass(shimmer, 2500))

# ---------- Música de fondo: pad ambiental en loop (Cmaj9 - Am9 - Fmaj9 - G6/9) ----------
BPM = 96
beat = 60 / BPM
bar = beat * 4
chords = [
    [48, 55, 64, 71, 74],   # Cmaj9
    [45, 52, 60, 67, 71],   # Am9
    [41, 48, 57, 64, 67],   # Fmaj9
    [43, 50, 59, 64, 69],   # G6/9
]
total = bar * 2 * len(chords) * 2  # 16 compases (~40 s)
N = int(SR * total)
L = np.zeros(N); R = np.zeros(N)
mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
for rep in range(2):
    for ci, ch in enumerate(chords):
        start = (rep * len(chords) + ci) * bar * 2
        n0 = int(SR * start); dur = bar * 2 + 0.6
        tt = t(dur); n = min(len(tt), N - n0)
        e = env(len(tt), 0.9, 1.2)
        for j, m in enumerate(ch):
            fr = mtof(m)
            v = 0
            for d in (-0.08, 0.0, 0.08):  # leve desafinación = pad ancho
                v = v + np.sin(2 * np.pi * fr * (1 + d / 100) * tt + d * 3) + 0.25 * np.sin(2 * np.pi * 2 * fr * (1 + d / 100) * tt)
            v *= e * (0.22 if j == 0 else 0.13)
            pl = (j / (len(ch) - 1)) * 0.6 + 0.2
            L[n0:n0 + n] += v[:n] * (1 - pl); R[n0:n0 + n] += v[:n] * pl
        # Arpegio suave en corcheas
        arp = ch[1:] + ch[2:4][::-1]
        for k in range(16):
            m = arp[k % len(arp)] + 12
            st = start + k * beat / 2
            a0 = int(SR * st); tn = t(0.9); nn = min(len(tn), N - a0)
            if nn <= 0: continue
            note = np.sin(2 * np.pi * mtof(m) * tn) * np.exp(-tn * 5) * 0.07
            pl = 0.3 + 0.4 * ((k % 4) / 3)
            L[a0:a0 + nn] += note[:nn] * (1 - pl); R[a0:a0 + nn] += note[:nn] * pl
# Reverb sencilla (ecos atenuados) y suavizado
for d, g in ((0.113, 0.35), (0.197, 0.28), (0.293, 0.2), (0.417, 0.14)):
    k = int(SR * d)
    L[k:] += R[:-k] * g; R[k:] += L[:-k] * g
L = lowpass(L, 4200); R = lowpass(R, 4200)
# Fundido cruzado para que el loop no tenga salto
xf = int(SR * 2.0)
fade = np.linspace(0, 1, xf)
L[:xf] = L[:xf] * fade + L[-xf:] * (1 - fade); R[:xf] = R[:xf] * fade + R[-xf:] * (1 - fade)
L = L[:-xf]; R = R[:-xf]
save('music', None, np.stack([L, R], axis=1))
print('OK', sorted(os.listdir(OUT)))

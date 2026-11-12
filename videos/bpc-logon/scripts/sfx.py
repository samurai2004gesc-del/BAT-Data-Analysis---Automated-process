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

# ---------- Música de fondo: pad ambiental continuo ----------
# Se genera un ciclo de 40 s que es periódico por construcción (todo se escribe con
# índice módulo N: colas de acordes, arpegio, reverb y filtro), se repite hasta cubrir
# el video y se guarda como UNA pista larga: sin loop en el reproductor y sin costuras.
# Los acordes se cruzan con fundidos de potencia constante y al final un nivelador
# deja el volumen parejo (variación < 3 dB), para que no "respire" entre acordes.
import subprocess, sys

MUSIC_SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 else 400.0
D = 5.0            # segundos por acorde
T = 2.6            # duración del fundido cruzado entre acordes
chords = [
    [48, 55, 64, 71, 74],   # Cmaj9
    [45, 52, 60, 67, 71],   # Am9
    [41, 48, 57, 64, 67],   # Fmaj9
    [43, 50, 59, 62, 69],   # G6/9
    [40, 52, 59, 62, 67],   # Em7
    [45, 52, 60, 64, 71],   # Am9
    [38, 50, 57, 60, 65],   # Dm7
    [43, 50, 57, 62, 67],   # Gsus4
]
N = int(SR * D * len(chords))
L = np.zeros(N); R = np.zeros(N)
mtof = lambda m: 440 * 2 ** ((m - 69) / 12)


def add(buf, start, x):
    """Suma x en buf empezando en start, dando la vuelta al final (periódico)."""
    idx = (start + np.arange(len(x))) % N
    np.add.at(buf, idx, x)


for ci, ch in enumerate(chords):
    n0 = int(SR * (ci * D - T / 2))
    tt = t(D + T)
    e = np.ones(len(tt))
    k = int(SR * T)
    ramp = np.sin(np.linspace(0, np.pi / 2, k))
    e[:k] = ramp; e[-k:] = ramp[::-1]            # sin/cos: potencia constante en el cruce
    for j, m in enumerate(ch):
        fr = mtof(m)
        v = np.zeros(len(tt))
        for d in (-0.07, 0.0, 0.07):              # leve desafinación = pad ancho
            ph = rng.uniform(0, 2 * np.pi)
            v += np.sin(2 * np.pi * fr * (1 + d / 100) * tt + ph) + 0.22 * np.sin(2 * np.pi * 2 * fr * (1 + d / 100) * tt + ph)
        v *= e * (1.5 if j == 0 else 1.0) / np.sqrt(len(ch))
        pl = 0.2 + 0.6 * j / (len(ch) - 1)
        add(L, n0, v * (1 - pl)); add(R, n0, v * pl)
    # Arpegio muy suave en negras, con cola larga
    arp = ch[1:] + ch[2:4][::-1]
    step = D / 8
    for q in range(8):
        tn = t(1.8)
        note = np.sin(2 * np.pi * mtof(arp[q % len(arp)] + 12) * tn) * np.exp(-tn * 2.6) * np.minimum(1, tn / 0.012) * 0.16
        pl = 0.35 + 0.3 * ((q % 4) / 3)
        a0 = int(SR * (ci * D + q * step))
        add(L, a0, note * (1 - pl)); add(R, a0, note * pl)

# Reverb circular y filtro pasa-bajos en frecuencia (ambos periódicos)
L0, R0 = L.copy(), R.copy()
for d, g in ((0.113, 0.33), (0.197, 0.26), (0.293, 0.19), (0.417, 0.13), (0.631, 0.08)):
    k = int(SR * d)
    L += np.roll(R0, k) * g; R += np.roll(L0, k) * g
freqs = np.fft.rfftfreq(N, 1 / SR)
Hf = 1 / np.sqrt(1 + (freqs / 3800) ** 4)
L = np.fft.irfft(np.fft.rfft(L) * Hf, N); R = np.fft.irfft(np.fft.rfft(R) * Hf, N)

# Nivelador: volumen parejo en todo el ciclo
w = int(SR * 1.2)
kern = np.hanning(w); kern /= kern.sum()
p = (L ** 2 + R ** 2) / 2
pp = np.concatenate([p[-w:], p, p[:w]])
rms = np.sqrt(np.convolve(pp, kern, mode='same')[w:-w])
gain = np.clip(np.median(rms) / rms, 0.5, 2.0)
L *= gain; R *= gain

reps = int(np.ceil(MUSIC_SECONDS * SR / N))
Lf = np.tile(L, reps)[: int(MUSIC_SECONDS * SR)]; Rf = np.tile(R, reps)[: int(MUSIC_SECONDS * SR)]
fi = int(SR * 1.5)
Lf[:fi] *= np.linspace(0, 1, fi) ** 2; Rf[:fi] *= np.linspace(0, 1, fi) ** 2
st = np.stack([Lf, Rf], axis=1)
target = 10 ** (-18 / 20)                         # RMS de -18 dBFS
st *= target / np.sqrt(np.mean(st ** 2))
st = np.clip(st, -0.98, 0.98)
with wave.open(os.path.join(OUT, 'music.wav'), 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR); wv.writeframes((st * 32767).astype(np.int16).tobytes())

# Comprobación: variación del nivel en ventanas de 0.4 s
m = st.mean(1); win = int(SR * 0.4)
lv = np.array([20 * np.log10(np.sqrt(np.mean(m[i:i + win] ** 2)) + 1e-9) for i in range(int(SR * 2), len(m) - win, win)])
print('música: %.0f s, nivel %.1f dB, variación %.1f dB (ventanas de 0.4 s), pico %.2f' % (len(m) / SR, lv.mean(), lv.max() - lv.min(), np.abs(st).max()))
print('OK', sorted(os.listdir(OUT)))

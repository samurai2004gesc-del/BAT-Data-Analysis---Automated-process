"""Da un ritmo más pausado a la narración SIN cortar palabras.
Uso: python3 scripts/pace.py
Entrada:  public/voice/en/<escena>.mp3 + src/voice/en.json  (voz y tiempos de ElevenLabs)
Salida:   public/voice/en-paced/<escena>.mp3 + src/voice/en.paced.json

Para cada frontera entre segmentos busca el silencio real en la onda. Solo si hay una
pausa de verdad (>= MIN_SIL) corta en el centro de ese silencio (a nivel de muestra, con
microfundidos) e inserta una pausa extra. Si la frase sigue de corrido, no se toca."""
import json, os, subprocess, wave
import numpy as np

SR = 44100
ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public', 'voice', 'en')
DST = os.path.join(ROOT, 'public', 'voice', 'en-paced')
PAUSE_SENTENCE = 0.50   # pausa extra tras . ! ?
PAUSE_COMMA = 0.22      # pausa extra tras , :
MIN_SIL = 0.14          # silencio mínimo real para poder cortar
THRESH = 0.010          # ~ -40 dBFS
FADE = int(SR * 0.008)
HOP = int(SR * 0.005)

os.makedirs(DST, exist_ok=True)
V = json.load(open(os.path.join(ROOT, 'src', 'voice', 'en.json'), encoding='utf8'))
out = {}
report = {'cut': 0, 'kept': 0}
for sid, v in V.items():
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(SRC, sid + '.mp3'), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    env = np.array([np.sqrt(np.mean(x[i:i + 2 * HOP] ** 2)) for i in range(0, len(x) - 2 * HOP, HOP)])
    segs = v['segs']
    cuts = []  # (muestra de corte, pausa a insertar)
    shifts = [0.0]
    total = 0.0
    for a, b in zip(segs, segs[1:]):
        lo = max(0, int((a['end'] - 0.12) * SR / HOP)); hi = min(len(env), int((b['start'] + 0.12) * SR / HOP))
        quiet = env[lo:hi] < THRESH
        best = (0, 0); cur = 0
        for i, q in enumerate(quiet):
            cur = cur + 1 if q else 0
            if cur > best[0]: best = (cur, i)
        sil = best[0] * HOP / SR
        if sil >= MIN_SIL:
            center = (lo + best[1] - best[0] / 2 + 1) * HOP
            pause = PAUSE_COMMA if a['t'].rstrip()[-1] in ',:' else PAUSE_SENTENCE
            cuts.append((int(center), pause)); total += pause; report['cut'] += 1
        else:
            report['kept'] += 1
            print(f"  sin pausa (frase de corrido, silencio {sil:.2f}s): {sid}: …{a['t'][-26:]} | {b['t'][:22]}…")
        shifts.append(total)
    # Construir el audio
    parts = []; prev = 0
    for c, pause in cuts:
        piece = x[prev:c].copy()
        piece[-FADE:] *= np.linspace(1, 0, FADE)
        if prev > 0: piece[:FADE] *= np.linspace(0, 1, FADE)
        parts += [piece, np.zeros(int(pause * SR))]
        prev = c
    last = x[prev:].copy()
    if prev > 0: last[:FADE] *= np.linspace(0, 1, FADE)
    last[-FADE:] *= np.linspace(1, 0, FADE)
    parts += [last, np.zeros(int(0.2 * SR))]
    y = np.concatenate(parts)
    tmp = os.path.join(DST, sid + '.wav')
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(DST, sid + '.mp3')], check=True)
    os.remove(tmp)
    out[sid] = {
        'duration': round(len(x) / SR + total, 3),
        'segs': [{'t': s['t'], 'cue': s['cue'], 'start': round(s['start'] + sh, 3), 'end': round(s['end'] + sh, 3)} for s, sh in zip(segs, shifts)],
    }
    print(f"{sid}: {len(x) / SR:.1f}s -> {len(y) / SR:.1f}s  (+{total:.1f}s en {len(cuts)} pausas)")
json.dump(out, open(os.path.join(ROOT, 'src', 'voice', 'en.paced.json'), 'w', encoding='utf8'), indent=2, ensure_ascii=False)
print(f"Pausas insertadas en silencios reales: {report['cut']} · fronteras que se dejaron de corrido: {report['kept']}")

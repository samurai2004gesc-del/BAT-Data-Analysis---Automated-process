"""Masteriza el video renderizado: sube el volumen a -16 LUFS con UNA ganancia fija
(no el "loudnorm" dinámico, que sube y baja la música) y recomprime para compartir.
Uso: python3 scripts/master.py [entrada.mp4] [salida.mp4]"""
import json, re, subprocess, sys

src = sys.argv[1] if len(sys.argv) > 1 else 'out/BPC-Logon-Setup.mp4'
dst = sys.argv[2] if len(sys.argv) > 2 else 'out/BPC-Logon-Setup-final.mp4'
TARGET_I, MAX_TP = -16.0, -1.5

def measure(path, extra=''):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', (extra + ',' if extra else '') + 'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    return json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr, re.S).group(0))

m = measure(src)
I, TP = float(m['input_i']), float(m['input_tp'])
gain = TARGET_I - I
# Si la ganancia fija pasa del pico permitido, un limitador transparente recorta solo los picos
af = f'volume={gain:.2f}dB'
if TP + gain > MAX_TP:
    # 1.5 dB extra de margen: el códec AAC sube un poco los picos reales
    af += f',alimiter=limit={10 ** ((MAX_TP - 1.5) / 20):.3f}:attack=5:release=80:level=false'
print(f'medido: {I:.1f} LUFS, pico {TP:.1f} dBTP -> ganancia fija {gain:+.2f} dB' + (' + limitador de picos' if 'alimiter' in af else ''))
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-af', af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', dst], check=True)
m2 = measure(dst)
print(f"final: {float(m2['input_i']):.1f} LUFS, pico {float(m2['input_tp']):.1f} dBTP, LRA {float(m2['input_lra']):.1f} LU")

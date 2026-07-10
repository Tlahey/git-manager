/**
 * Layout editor — the sprite-sheet → JSON workflow:
 *
 *   1. le sheet du package (`assets/sprites.png`) et son layout
 *      (`assets/layout.json`) sont chargés au démarrage — l'état initial de
 *      l'éditeur EST le rig actuel (un autre PNG peut être chargé par-dessus),
 *   2. définis/ajuste des zones dessus (glisser pour tracer, nommer, typer),
 *   3. place chaque zone sur la scène 1000×1000 (drag, échelle, rotation,
 *      flip, opacité, avant/arrière via l'ordre de peinture, pivot + params
 *      d'animation), avec la référence de marque en surimpression alignée,
 *   4. exporte le JSON → `assets/layout.json`, puis
 *      `pnpm --filter @git-manager/mascot generate` régénère
 *      `src/generated/{sprites,layout}.ts` consommés par les apps.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ReferenceOverlay, SPRITES, Stage } from './rigUtils';
import layoutJson from '../assets/layout.json';
import defaultSheetUrl from '../assets/sprites.png';

const meta: Meta = { title: 'Mascot/Layout editor' };
export default meta;

/* ── document model (this is the exported JSON's shape) ─────────────────── */

interface Zone {
  id: string;
  role: 'tentacle' | 'head' | 'eye' | 'eyelid' | 'mouth' | 'other';
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Placement {
  zone: string;
  x: number;
  y: number;
  scale: number;
  rot: number;
  flip: boolean;
  opacity: number;
  pivot: { x: number; y: number };
  anim: { amp: number; dur: number; delay: number };
}

interface Doc {
  version: 1;
  sheet: { name: string | null; width: number; height: number; chroma: { color: string | null; t0: number; t1: number } };
  stage: { width: number; height: number };
  /** paint order: first = tout derrière, last = tout devant */
  placements: Placement[];
  zones: Zone[];
}

/** The committed layout (assets/layout.json) as the editor's starting document. */
function initialDoc(): Doc {
  return structuredClone(layoutJson) as Doc;
}

/* ── slicing (canvas crop + optional chroma-key) ────────────────────────── */

function sliceZone(img: HTMLImageElement, z: Zone, chroma: Doc['sheet']['chroma']): string {
  const canvas = document.createElement('canvas');
  canvas.width = z.w;
  canvas.height = z.h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, z.x, z.y, z.w, z.h, 0, 0, z.w, z.h);
  if (chroma.color) {
    const [br, bg, bb] = [1, 3, 5].map((i) => parseInt(chroma.color!.slice(i, i + 2), 16));
    const data = ctx.getImageData(0, 0, z.w, z.h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const d = Math.hypot(px[i] - br, px[i + 1] - bg, px[i + 2] - bb);
      const a = d <= chroma.t0 ? 0 : d >= chroma.t1 ? 255 : Math.round(((d - chroma.t0) / (chroma.t1 - chroma.t0)) * 255);
      if (a < 255) {
        const f = a / 255 || 1;
        px[i] = Math.min(255, Math.max(0, (px[i] - (1 - f) * br) / f));
        px[i + 1] = Math.min(255, Math.max(0, (px[i + 1] - (1 - f) * bg) / f));
        px[i + 2] = Math.min(255, Math.max(0, (px[i + 2] - (1 - f) * bb) / f));
      }
      px[i + 3] = Math.min(px[i + 3], a);
    }
    ctx.putImageData(data, 0, 0);
  }
  return canvas.toDataURL();
}

/* ── the editor ─────────────────────────────────────────────────────────── */

const panel: CSSProperties = {
  background: '#0d1b33',
  border: '1px solid #24406a',
  borderRadius: 10,
  padding: 12,
  color: '#cfe3f5',
  fontSize: 12,
};
const label: CSSProperties = { color: '#7d95b5', display: 'block', marginTop: 6 };
const num: CSSProperties = { width: 64, background: '#0a1426', color: '#cfe3f5', border: '1px solid #2a4a78', borderRadius: 4, padding: '2px 4px' };

function Editor() {
  const [doc, setDoc] = useState<Doc>(initialDoc);
  const [sheetImg, setSheetImg] = useState<HTMLImageElement | null>(null);
  const [slices, setSlices] = useState<Record<string, string>>({});
  const [selZone, setSelZone] = useState<string | null>(null);
  const [selPart, setSelPart] = useState<number | null>(null);
  const [refOpacity, setRefOpacity] = useState(0.35);
  const [pickBg, setPickBg] = useState(false);
  const [pivotMode, setPivotMode] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [importText, setImportText] = useState('');
  const [draftZone, setDraftZone] = useState<Zone | null>(null);
  const dragRef = useRef<{ idx: number; dx: number; dy: number } | null>(null);
  const partEls = useRef<Map<number, HTMLImageElement>>(new Map());

  const SHEET_W = 400;
  const STAGE_W = 540;
  const kSheet = SHEET_W / doc.sheet.width;
  const kStage = STAGE_W / doc.stage.width;

  const uriFor = (zoneId: string): string | null =>
    slices[zoneId] ?? (SPRITES as Record<string, { uri: string } | undefined>)[zoneId]?.uri ?? null;

  const reslice = (img = sheetImg, d = doc) => {
    if (!img) return;
    const next: Record<string, string> = {};
    for (const z of d.zones) next[z.id] = sliceZone(img, z, d.sheet.chroma);
    setSlices(next);
  };

  const loadSheet = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSheetImg(img);
      setDoc((d) => {
        const nd = { ...d, sheet: { ...d.sheet, name: file.name, width: img.width, height: img.height } };
        setTimeout(() => reslice(img, nd), 0);
        return nd;
      });
    };
    img.src = url;
  };

  /* the package's own sheet (assets/sprites.png) is loaded on mount */
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setSheetImg(img);
      reslice(img, doc);
    };
    img.src = defaultSheetUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  /* sway preview: mutates transforms directly, no re-render */
  useEffect(() => {
    if (!animate) {
      for (const [idx, el] of partEls.current) {
        const p = doc.placements[idx];
        if (p) el.style.transform = baseTransform(p);
      }
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      for (const [idx, el] of partEls.current) {
        const p = doc.placements[idx];
        if (!p) continue;
        const w = p.anim.amp ? p.anim.amp * Math.sin(((t - p.anim.delay) / p.anim.dur) * Math.PI * 2) : 0;
        const ox = p.pivot.x - p.x;
        const oy = p.pivot.y - p.y;
        el.style.transform = `translate(${ox}px,${oy}px) rotate(${w}deg) translate(${-ox}px,${-oy}px) ${baseTransform(p)}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, doc]);

  const baseTransform = (p: Placement) => `${p.flip ? 'scale(-1,1) ' : ''}rotate(${p.rot}deg)`;

  const patchPart = (idx: number, patch: Partial<Placement>) =>
    setDoc((d) => ({
      ...d,
      placements: d.placements.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));

  const movePart = (idx: number, dir: number) =>
    setDoc((d) => {
      const arr = [...d.placements];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      setSelPart(j);
      return { ...d, placements: arr };
    });

  const sel = selPart !== null ? doc.placements[selPart] : null;
  const exportJson = useMemo(() => JSON.stringify(doc, null, 2), [doc]);

  return (
    <div style={{ display: 'flex', gap: 14, padding: 14, background: '#060d1c', minHeight: '100vh', boxSizing: 'border-box', fontFamily: 'sans-serif', alignItems: 'flex-start' }}>
      {/* ── sheet + zones ── */}
      <div style={{ ...panel, width: SHEET_W }}>
        <strong>1. Sprite sheet & zones</strong>
        <input type="file" accept="image/*" style={{ display: 'block', margin: '8px 0' }} onChange={(e) => e.target.files?.[0] && loadSheet(e.target.files[0])} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setPickBg((v) => !v)} style={{ background: pickBg ? '#35e0c2' : '#16345c', color: pickBg ? '#062' : '#cfe3f5', border: 'none', borderRadius: 4, padding: '3px 8px' }}>
            pipette fond {doc.sheet.chroma.color && <i style={{ background: doc.sheet.chroma.color, display: 'inline-block', width: 10, height: 10, marginLeft: 4 }} />}
          </button>
          <label>
            seuils {doc.sheet.chroma.t0}/{doc.sheet.chroma.t1}
            <input type="range" min={10} max={120} value={doc.sheet.chroma.t0} onChange={(e) => setDoc((d) => ({ ...d, sheet: { ...d.sheet, chroma: { ...d.sheet.chroma, t0: +e.target.value } } }))} />
          </label>
          <button onClick={() => reslice()} disabled={!sheetImg} style={{ background: '#16345c', color: '#cfe3f5', border: 'none', borderRadius: 4, padding: '3px 8px' }}>
            redécouper
          </button>
        </div>
        <div
          style={{ position: 'relative', width: SHEET_W, height: (doc.sheet.height * SHEET_W) / doc.sheet.width, background: '#0a1426', marginTop: 8, cursor: pickBg ? 'crosshair' : 'default', touchAction: 'none' }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - r.left) / kSheet;
            const y = (e.clientY - r.top) / kSheet;
            if (pickBg && sheetImg) {
              const c = document.createElement('canvas');
              c.width = c.height = 1;
              const ctx = c.getContext('2d')!;
              ctx.drawImage(sheetImg, x, y, 1, 1, 0, 0, 1, 1);
              const [pr, pg, pb] = ctx.getImageData(0, 0, 1, 1).data;
              const hex = `#${[pr, pg, pb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
              setDoc((d) => ({ ...d, sheet: { ...d.sheet, chroma: { ...d.sheet.chroma, color: hex } } }));
              setPickBg(false);
              return;
            }
            setDraftZone({ id: `zone-${doc.zones.length + 1}`, role: 'other', x, y, w: 0, h: 0 });
          }}
          onPointerMove={(e) => {
            if (!draftZone) return;
            const r = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - r.left) / kSheet;
            const y = (e.clientY - r.top) / kSheet;
            setDraftZone({ ...draftZone, w: x - draftZone.x, h: y - draftZone.y });
          }}
          onPointerUp={() => {
            if (draftZone && Math.abs(draftZone.w) > 12 && Math.abs(draftZone.h) > 12) {
              const z = {
                ...draftZone,
                x: Math.round(Math.min(draftZone.x, draftZone.x + draftZone.w)),
                y: Math.round(Math.min(draftZone.y, draftZone.y + draftZone.h)),
                w: Math.round(Math.abs(draftZone.w)),
                h: Math.round(Math.abs(draftZone.h)),
              };
              setDoc((d) => ({ ...d, zones: [...d.zones, z] }));
              setSelZone(z.id);
            }
            setDraftZone(null);
          }}
        >
          {sheetImg && <img src={sheetImg.src} alt="sheet" style={{ width: '100%', pointerEvents: 'none' }} />}
          {!sheetImg && <p style={{ color: '#40608f', textAlign: 'center', paddingTop: 100 }}>charge un sheet — les zones ci-dessous utilisent en attendant les sprites embarqués</p>}
          {[...doc.zones, ...(draftZone ? [draftZone] : [])].map((z) => (
            <div
              key={z.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelZone(z.id);
              }}
              style={{
                position: 'absolute',
                left: z.x * kSheet,
                top: z.y * kSheet,
                width: Math.abs(z.w) * kSheet,
                height: Math.abs(z.h) * kSheet,
                border: `1.5px solid ${selZone === z.id ? '#35e0c2' : '#ff547088'}`,
                color: '#ffd166',
                fontSize: 10,
              }}
            >
              {z.id}
            </div>
          ))}
        </div>
        {selZone && (
          <ZoneInspector
            zone={doc.zones.find((z) => z.id === selZone)!}
            onChange={(patch) =>
              setDoc((d) => ({ ...d, zones: d.zones.map((z) => (z.id === selZone ? { ...z, ...patch } : z)) }))
            }
            onDelete={() => {
              setDoc((d) => ({ ...d, zones: d.zones.filter((z) => z.id !== selZone) }));
              setSelZone(null);
            }}
            onAddToStage={() => {
              const z = doc.zones.find((zz) => zz.id === selZone)!;
              setDoc((d) => ({
                ...d,
                placements: [
                  ...d.placements,
                  { zone: z.id, x: 400, y: 400, scale: 1, rot: 0, flip: false, opacity: 1, pivot: { x: 500, y: 450 }, anim: { amp: 0, dur: 3.5, delay: 0 } },
                ],
              }));
              setSelPart(doc.placements.length);
            }}
          />
        )}
      </div>

      {/* ── stage ── */}
      <div style={{ ...panel, width: STAGE_W + 24 }}>
        <strong>2. Scène</strong>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '6px 0', flexWrap: 'wrap' }}>
          <label>
            référence
            <input type="range" min={0} max={1} step={0.05} value={refOpacity} onChange={(e) => setRefOpacity(+e.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> animer
          </label>
          <button onClick={() => setPivotMode((v) => !v)} style={{ background: pivotMode ? '#ff5470' : '#16345c', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px' }}>
            {pivotMode ? 'clique la scène pour poser le pivot' : 'poser pivot'}
          </button>
        </div>
        <div
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            if (pivotMode && sel && selPart !== null) {
              const r = (e.currentTarget.firstChild as HTMLElement).getBoundingClientRect();
              patchPart(selPart, { pivot: { x: Math.round((e.clientX - r.left) / kStage), y: Math.round((e.clientY - r.top) / kStage) } });
              setPivotMode(false);
            }
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current;
            if (!drag) return;
            const r = (e.currentTarget.firstChild as HTMLElement).getBoundingClientRect();
            patchPart(drag.idx, {
              x: Math.round((e.clientX - r.left) / kStage - drag.dx),
              y: Math.round((e.clientY - r.top) / kStage - drag.dy),
            });
          }}
          onPointerUp={() => (dragRef.current = null)}
        >
          <Stage width={STAGE_W}>
            {doc.placements.map((p, idx) => {
              const uri = uriFor(p.zone);
              const z = doc.zones.find((zz) => zz.id === p.zone);
              // width must follow the image actually shown: sheet slice → zone
              // width; builtin fallback → that sprite's own (cropped) width.
              const builtin = (SPRITES as Record<string, { w: number } | undefined>)[p.zone];
              const w = slices[p.zone] && z ? z.w : (builtin?.w ?? z?.w ?? 300);
              if (!uri) return null;
              return (
                <img
                  key={`${p.zone}-${idx}`}
                  ref={(el) => {
                    if (el) partEls.current.set(idx, el);
                    else partEls.current.delete(idx);
                  }}
                  src={uri}
                  alt={p.zone}
                  onPointerDown={(e) => {
                    if (pivotMode) return;
                    e.stopPropagation();
                    setSelPart(idx);
                    const stageBox = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    dragRef.current = {
                      idx,
                      dx: (e.clientX - stageBox.left) / kStage - p.x,
                      dy: (e.clientY - stageBox.top) / kStage - p.y,
                    };
                  }}
                  style={{
                    position: 'absolute',
                    left: p.x,
                    top: p.y,
                    width: w * p.scale,
                    opacity: p.opacity,
                    transformOrigin: '0 0',
                    transform: baseTransform(p),
                    outline: selPart === idx ? '2px dashed #35e0c2' : 'none',
                    cursor: 'grab',
                  }}
                />
              );
            })}
            {sel && (
              <div
                style={{ position: 'absolute', left: sel.pivot.x - 7, top: sel.pivot.y - 7, width: 14, height: 14, borderRadius: '50%', border: '2px solid #ff5470', pointerEvents: 'none', zIndex: 9 }}
              />
            )}
            <ReferenceOverlay opacity={refOpacity} />
          </Stage>
        </div>
        <p style={{ color: '#7d95b5', margin: '6px 0 0' }}>glisse une pièce pour la déplacer · clique pour sélectionner</p>
      </div>

      {/* ── inspector + JSON ── */}
      <div style={{ ...panel, width: 300 }}>
        <strong>3. Pièce sélectionnée</strong>
        {sel && selPart !== null ? (
          <div>
            <p style={{ margin: '6px 0' }}>
              <code>{sel.zone}</code> — couche {selPart + 1}/{doc.placements.length}{' '}
              <button onClick={() => movePart(selPart, -1)} title="vers l'arrière">▼ arrière</button>{' '}
              <button onClick={() => movePart(selPart, +1)} title="vers l'avant">▲ avant</button>
            </p>
            {(
              [
                ['x', sel.x], ['y', sel.y], ['scale', sel.scale], ['rot', sel.rot], ['opacity', sel.opacity],
              ] as const
            ).map(([k, v]) => (
              <label key={k} style={label}>
                {k}{' '}
                <input style={num} type="number" step={k === 'scale' || k === 'opacity' ? 0.05 : 1} value={v} onChange={(e) => patchPart(selPart, { [k]: +e.target.value } as Partial<Placement>)} />
              </label>
            ))}
            <label style={label}>
              <input type="checkbox" checked={sel.flip} onChange={(e) => patchPart(selPart, { flip: e.target.checked })} /> flip
            </label>
            <label style={label}>
              pivot <input style={num} type="number" value={sel.pivot.x} onChange={(e) => patchPart(selPart, { pivot: { ...sel.pivot, x: +e.target.value } })} />{' '}
              <input style={num} type="number" value={sel.pivot.y} onChange={(e) => patchPart(selPart, { pivot: { ...sel.pivot, y: +e.target.value } })} />
            </label>
            <label style={label}>
              anim amp/dur/délai{' '}
              <input style={{ ...num, width: 44 }} type="number" step={0.2} value={sel.anim.amp} onChange={(e) => patchPart(selPart, { anim: { ...sel.anim, amp: +e.target.value } })} />
              <input style={{ ...num, width: 44 }} type="number" step={0.1} value={sel.anim.dur} onChange={(e) => patchPart(selPart, { anim: { ...sel.anim, dur: +e.target.value } })} />
              <input style={{ ...num, width: 44 }} type="number" step={0.05} value={sel.anim.delay} onChange={(e) => patchPart(selPart, { anim: { ...sel.anim, delay: +e.target.value } })} />
            </label>
            <button
              style={{ marginTop: 8, background: '#5c1626', color: '#ffb3c0', border: 'none', borderRadius: 4, padding: '3px 8px' }}
              onClick={() => {
                setDoc((d) => ({ ...d, placements: d.placements.filter((_, i) => i !== selPart) }));
                setSelPart(null);
              }}
            >
              supprimer la pièce
            </button>
          </div>
        ) : (
          <p style={{ color: '#7d95b5' }}>clique une pièce sur la scène (ou « ajouter à la scène » depuis une zone)</p>
        )}

        <hr style={{ border: 0, borderTop: '1px solid #24406a', margin: '12px 0' }} />
        <strong>4. JSON</strong>
        <textarea readOnly value={exportJson} style={{ width: '100%', height: 140, background: '#0a1426', color: '#9fe8d5', border: '1px solid #2a4a78', fontSize: 10, marginTop: 6 }} />
        <button
          style={{ background: '#16345c', color: '#cfe3f5', border: 'none', borderRadius: 4, padding: '3px 8px', marginTop: 4 }}
          onClick={() => navigator.clipboard.writeText(exportJson)}
        >
          copier l'export
        </button>
        <label style={label}>importer :</label>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="colle un JSON exporté ici" style={{ width: '100%', height: 60, background: '#0a1426', color: '#cfe3f5', border: '1px solid #2a4a78', fontSize: 10 }} />
        <button
          style={{ background: '#16345c', color: '#cfe3f5', border: 'none', borderRadius: 4, padding: '3px 8px', marginTop: 4 }}
          onClick={() => {
            try {
              const d = JSON.parse(importText) as Doc;
              if (d.version !== 1 || !Array.isArray(d.placements)) throw new Error('format inattendu');
              setDoc(d);
              setSelPart(null);
              setSelZone(null);
              if (sheetImg) setTimeout(() => reslice(sheetImg, d), 0);
            } catch (err) {
              alert(`Import impossible : ${String(err)}`);
            }
          }}
        >
          appliquer l'import
        </button>
      </div>
    </div>
  );
}

function ZoneInspector({
  zone,
  onChange,
  onDelete,
  onAddToStage,
}: {
  zone: Zone;
  onChange: (patch: Partial<Zone>) => void;
  onDelete: () => void;
  onAddToStage: () => void;
}) {
  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #24406a', paddingTop: 8 }}>
      <label style={label}>
        id <input style={{ ...num, width: 90 }} value={zone.id} onChange={(e) => onChange({ id: e.target.value })} />
      </label>
      <label style={label}>
        rôle{' '}
        <select value={zone.role} onChange={(e) => onChange({ role: e.target.value as Zone['role'] })} style={{ ...num, width: 100 }}>
          {['tentacle', 'head', 'eye', 'eyelid', 'mouth', 'other'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label style={label}>
        x/y/w/h{' '}
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <input key={k} style={{ ...num, width: 48 }} type="number" value={zone[k]} onChange={(e) => onChange({ [k]: +e.target.value } as Partial<Zone>)} />
        ))}
      </label>
      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
        <button onClick={onAddToStage} style={{ background: '#16345c', color: '#cfe3f5', border: 'none', borderRadius: 4, padding: '3px 8px' }}>
          ajouter à la scène
        </button>
        <button onClick={onDelete} style={{ background: '#5c1626', color: '#ffb3c0', border: 'none', borderRadius: 4, padding: '3px 8px' }}>
          supprimer
        </button>
      </div>
    </div>
  );
}

export const LayoutEditor: StoryObj = {
  name: 'Layout editor',
  render: () => <Editor />,
};

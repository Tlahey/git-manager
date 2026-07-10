/**
 * The rig, exploded: every layer of MASCOT_LAYOUT rendered as its own
 * hoverable element in exact paint order. Hover a row (or a part) to isolate
 * it on the stage; toggle layers off; show the sway pivots; ghost the brand
 * reference on top to check placements.
 */

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MASCOT_LAYOUT, ReferenceOverlay, SPRITES, Stage, partStyle } from './rigUtils';

const meta: Meta = { title: 'Mascot/Rig debugger' };
export default meta;

interface RigArgs {
  refOpacity: number;
  showPivots: boolean;
  stageWidth: number;
}

export const RigDebugger: StoryObj<RigArgs> = {
  name: 'Rig debugger',
  argTypes: {
    refOpacity: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    showPivots: { control: 'boolean' },
    stageWidth: { control: { type: 'range', min: 400, max: 1000, step: 20 } },
  },
  args: { refOpacity: 0, showPivots: false, stageWidth: 640 },
  render: ({ refOpacity, showPivots, stageWidth }) => (
    <RigView refOpacity={refOpacity} showPivots={showPivots} stageWidth={stageWidth} />
  ),
};

/** Layers in paint order (back → front), face on top like the shipped markup. */
function layerList(): { id: string; kind: 'limb' | 'head' | 'face' }[] {
  return [
    ...Object.keys(MASCOT_LAYOUT.limbs).map((id) => ({ id, kind: 'limb' as const })),
    { id: 'head', kind: 'head' as const },
    { id: 'face', kind: 'face' as const },
  ];
}

function RigView({ refOpacity, showPivots, stageWidth }: RigArgs) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);

  const layers = layerList();
  const dimmed = (id: string) => (hovered !== null && hovered !== id ? 0.15 : 1);
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { head, limbs, eyes, eyeWhiteR, pupilScale, lidScale, mouth } = MASCOT_LAYOUT;

  return (
    <div
      style={{
        display: 'flex',
        gap: 20,
        padding: 20,
        background: '#060d1c',
        minHeight: '100vh',
        boxSizing: 'border-box',
        fontFamily: 'sans-serif',
      }}
    >
      <div>
        <Stage width={stageWidth}>
          {layers.map(({ id, kind }) => {
            if (hidden.has(id)) return null;
            const common = {
              onPointerEnter: () => setHovered(id),
              onPointerLeave: () => setHovered(null),
            };
            if (kind === 'limb') {
              const l = limbs[id];
              return (
                <img
                  key={id}
                  src={l.sprite.uri}
                  alt={id}
                  {...common}
                  style={{ ...partStyle(l, l.sprite.w), opacity: dimmed(id), transition: 'opacity 0.1s' }}
                />
              );
            }
            if (kind === 'head') {
              return (
                <img
                  key={id}
                  src={head.sprite.uri}
                  alt="head"
                  {...common}
                  style={{
                    ...partStyle({ ...head, rot: 0 }, head.sprite.w),
                    opacity: dimmed(id),
                    transition: 'opacity 0.1s',
                  }}
                />
              );
            }
            return (
              <div key={id} {...common} style={{ opacity: dimmed(id), transition: 'opacity 0.1s' }}>
                {eyes.map((e, i) => (
                  <div key={i}>
                    <div
                      style={{
                        position: 'absolute',
                        left: e.cx - eyeWhiteR,
                        top: e.cy - eyeWhiteR,
                        width: eyeWhiteR * 2,
                        height: eyeWhiteR * 2,
                        borderRadius: '50%',
                        background: '#fdfefe',
                      }}
                    />
                    <img
                      src={SPRITES.eye.uri}
                      alt="pupil"
                      style={{
                        position: 'absolute',
                        left: e.cx - (SPRITES.eye.w * pupilScale) / 2,
                        top: e.cy - (SPRITES.eye.h * pupilScale) / 2,
                        width: SPRITES.eye.w * pupilScale,
                      }}
                    />
                  </div>
                ))}
                <img
                  src={SPRITES.eyelid.uri}
                  alt="mouth"
                  style={{
                    position: 'absolute',
                    left: mouth.cx - (SPRITES.eyelid.w * mouth.scale) / 2,
                    top: mouth.cy - (SPRITES.eyelid.h * mouth.scale) / 2,
                    width: SPRITES.eyelid.w * mouth.scale,
                  }}
                />
                {/* lids drawn faint so their alignment stays checkable */}
                {eyes.map((e, i) => (
                  <img
                    key={`lid-${i}`}
                    src={SPRITES.eyelid.uri}
                    alt="lid"
                    style={{
                      position: 'absolute',
                      left: e.cx - (SPRITES.eyelid.w * lidScale) / 2,
                      top: e.cy - (SPRITES.eyelid.h * lidScale) / 2,
                      width: SPRITES.eyelid.w * lidScale,
                      opacity: 0.15,
                    }}
                  />
                ))}
              </div>
            );
          })}

          {showPivots &&
            Object.entries(limbs).map(([id, l]) => (
              <div
                key={`pivot-${id}`}
                title={`${id} pivot`}
                style={{
                  position: 'absolute',
                  left: l.px - 7,
                  top: l.py - 7,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid #ff5470',
                  background: hovered === id ? '#ff5470' : 'transparent',
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
              />
            ))}

          <ReferenceOverlay opacity={refOpacity} />
        </Stage>
        <p style={{ color: '#7d95b5', fontSize: 12, maxWidth: stageWidth }}>
          Ordre des lignes = ordre de peinture (haut = arrière). Survoler isole une couche ;
          la case masque/affiche. Les pivots (rouges) sont les ancres d'ondulation.
        </p>
      </div>

      <table style={{ color: '#cfe3f5', fontSize: 13, borderCollapse: 'collapse', alignSelf: 'flex-start' }}>
        <thead>
          <tr style={{ color: '#7d95b5', textAlign: 'left' }}>
            <th style={{ padding: '4px 8px' }}>couche</th>
            <th style={{ padding: '4px 8px' }}>amp</th>
            <th style={{ padding: '4px 8px' }}>durée</th>
            <th style={{ padding: '4px 8px' }}>délai</th>
            <th style={{ padding: '4px 8px' }}>flip</th>
          </tr>
        </thead>
        <tbody>
          {layers.map(({ id, kind }) => {
            const l = kind === 'limb' ? MASCOT_LAYOUT.limbs[id] : undefined;
            return (
              <tr
                key={id}
                onPointerEnter={() => setHovered(id)}
                onPointerLeave={() => setHovered(null)}
                style={{
                  background: hovered === id ? '#16345c' : 'transparent',
                  cursor: 'default',
                }}
              >
                <td style={{ padding: '4px 8px' }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={!hidden.has(id)} onChange={() => toggle(id)} />
                    {id}
                  </label>
                </td>
                <td style={{ padding: '4px 8px' }}>{l ? `${l.amp}°` : '—'}</td>
                <td style={{ padding: '4px 8px' }}>{l ? `${l.dur}s` : '—'}</td>
                <td style={{ padding: '4px 8px' }}>{l ? `${l.delay}s` : '—'}</td>
                <td style={{ padding: '4px 8px' }}>{l?.flip ? 'oui' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

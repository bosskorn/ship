import { Button, color, font, space } from '@ship/mobile-ui';
import { useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const W = 320;
const H = 160;

/** Finger signature captured as SVG path data; uploaded as an SVG file for the POD. */
export function SignaturePad({ onChange }: { onChange: (svg: string | null) => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef<string>('');

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        current.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
        setPaths((p) => [...p, current.current]);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        current.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
        setPaths((p) => [...p.slice(0, -1), current.current]);
      },
      onPanResponderRelease: () => {
        setPaths((p) => {
          onChange(toSvg(p));
          return p;
        });
      },
    }),
  ).current;

  return (
    <View style={{ gap: space.sm, alignItems: 'center' }}>
      <View {...responder.panHandlers} style={{ width: W, height: H, borderWidth: 1, borderColor: color.border, borderStyle: 'dashed', backgroundColor: '#FAFAFA' }}>
        <Svg width={W} height={H}>
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={color.text} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {!paths.length && (
          <Text pointerEvents="none" style={[font.small, { color: color.placeholder, position: 'absolute', alignSelf: 'center', top: H / 2 - 9 }]}>
            ให้ผู้รับเซ็นชื่อที่นี่
          </Text>
        )}
      </View>
      <Button title="ล้างลายเซ็น" variant="text" size="small" block={false} onPress={() => { setPaths([]); onChange(null); }} />
    </View>
  );
}

function toSvg(paths: string[]): string | null {
  if (!paths.length) return null;
  const body = paths.map((d) => `<path d="${d}" stroke="#1F2329" stroke-width="2.5" fill="none" stroke-linecap="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import {
  NAppBar,
  NBottomBar,
  NButton,
  NDialog,
  NInput,
  NLoading,
  NPhotoGrid,
  NScreen,
  NSection,
  NServiceItem,
  NText,
} from '@/components';
import { SERVICES } from '@/data/catalog';
import { rankServices } from '@/domain/search';
import { track } from '@/lib/analytics';
import { pickPhoto } from '@/lib/media';
import { useApp } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

/**
 * AI / Photo diagnosis (spec §24). The assistant only *recommends* services —
 * copy must never present results as a certain diagnosis.
 */
export default function Diagnosis() {
  const { setDraft } = useApp();
  const [photos, setPhotos] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [state, setState] = useState<'input' | 'analyzing' | 'result'>('input');
  const [denied, setDenied] = useState(false);
  const results = state === 'result' ? rankServices(text || 'ตรวจระบบ', SERVICES, 3) : [];

  const add = async (source: 'camera' | 'library') => {
    const res = await pickPhoto(source);
    if ('uri' in res) setPhotos((p) => [...p, res.uri].slice(0, 4));
    else if ('denied' in res) setDenied(true);
  };

  const analyze = () => {
    setState('analyzing');
    setTimeout(() => setState('result'), 1200);
  };

  return (
    <NScreen
      background="page"
      footer={
        state === 'result' ? null : (
          <NBottomBar>
            <NButton theme="primary" block disabled={!photos.length && !text.trim()} loading={state === 'analyzing'} onPress={analyze}>
              ให้น้องช่างช่วยแนะนำ
            </NButton>
          </NBottomBar>
        )
      }
    >
      <NAppBar title="ถ่ายรูปปัญหา" />
      <NSection title="รูปปัญหา" style={{ marginTop: space.md }}>
        <View style={styles.block}>
          <NPhotoGrid uris={photos} onRemove={(u) => setPhotos((p) => p.filter((x) => x !== u))} />
          <View style={styles.row}>
            <NButton theme="outline" size="medium" icon="camera" style={{ flex: 1 }} onPress={() => add('camera')}>
              ถ่ายรูป
            </NButton>
            <NButton theme="default" size="medium" icon="image" style={{ flex: 1 }} onPress={() => add('library')}>
              เลือกจากเครื่อง
            </NButton>
          </View>
        </View>
      </NSection>

      <NSection title="อธิบายเพิ่มเติม">
        <NInput value={text} onChangeText={setText} placeholder="เช่น แอร์มีน้ำหยด" multiline style={{ minHeight: 88, textAlignVertical: 'top' }} />
      </NSection>

      {state === 'analyzing' ? <NLoading text="น้องช่างกำลังวิเคราะห์" /> : null}

      {state === 'result' ? (
        <NSection title="บริการที่แนะนำ" flush>
          <NText variant="caption" color="textSecondary" style={styles.disclaimer}>
            คำแนะนำนี้เป็นการประเมินเบื้องต้น ไม่ใช่การวินิจฉัยที่แน่นอน ช่างจะตรวจสอบหน้างานอีกครั้งก่อนเสนอราคา
          </NText>
          <View style={{ backgroundColor: color.bgContainer }}>
            {results.map(({ item }, i) => (
              <NServiceItem
                key={item.id}
                service={item}
                divider={i < results.length - 1}
                onPress={() => {
                  setDraft({ serviceId: item.id, quantity: 1, photoUris: photos, note: text || undefined });
                  track('select_service', { serviceId: item.id, source: 'diagnosis', rank: i + 1 });
                  router.replace(`/services/${item.id}`);
                }}
              />
            ))}
          </View>
        </NSection>
      ) : null}

      <NDialog
        visible={denied}
        title="ต้องการสิทธิ์เข้าถึง"
        content="อนุญาตให้น้องช่างใช้กล้องหรือรูปภาพได้ในการตั้งค่าของเครื่อง"
        cancelText="ไว้ทีหลัง"
        confirmText="เปิดการตั้งค่า"
        onCancel={() => setDenied(false)}
        onConfirm={() => {
          setDenied(false);
          Linking.openSettings();
        }}
      />
    </NScreen>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  disclaimer: { paddingHorizontal: layout.screenPadding, paddingBottom: space.xs },
});

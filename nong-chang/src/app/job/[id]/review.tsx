import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomBar, NButton, NChip, NEmpty, NInput, NPhotoGrid, NRating, NScreen, NSection, NTechnicianItem, NText, useToast } from '@/components';
import { pickPhoto } from '@/lib/media';
import { haptic } from '@/lib/haptics';
import { useApp, useJob, useTechnician } from '@/store/AppStore';
import { color, radius, space } from '@/theme/tokens';

const TAGS = ['ตรงเวลา', 'ฝีมือดี', 'สะอาดเรียบร้อย', 'สุภาพ มีมารยาท', 'ราคาตรงตามแจ้ง'];
const LABEL = ['', 'ต้องปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก', 'ยอดเยี่ยม'];

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);
  const { submitReview } = useApp();
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  if (!job || !tech) return <NEmpty title="ไม่พบงานนี้" />;

  return (
    <NScreen
      footer={
        <NBottomBar>
          <NButton
            theme="primary"
            block
            onPress={() => {
              submitReview(job.id, rating);
              haptic.success();
              toast('ขอบคุณสำหรับรีวิว', { theme: 'success' });
              router.dismissTo('/');
            }}
          >
            ส่งรีวิว
          </NButton>
        </NBottomBar>
      }
    >
      <NAppBar title="ให้คะแนนช่าง" onBack={() => router.dismissTo('/')} />
      <NSection style={{ marginTop: space.md }}>
        <View style={[styles.block, { alignItems: 'center' }]}>
          <NTechnicianItem technician={tech} compact />
          <NRating value={rating} onChange={setRating} size={36} gap={space.xs} />
          <NText variant="bodyStrong" color="primary">
            {LABEL[rating]}
          </NText>
        </View>
      </NSection>
      <NSection title="ประทับใจเรื่องอะไร">
        <View style={styles.chips}>
          {TAGS.map((t) => (
            <NChip key={t} label={t} selected={tags.includes(t)} onPress={() => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))} />
          ))}
        </View>
      </NSection>
      <NSection title="ความคิดเห็น">
        <NInput value={comment} onChangeText={setComment} multiline placeholder="เล่าประสบการณ์ให้ช่างและลูกค้าคนอื่นรู้" style={{ minHeight: 88, textAlignVertical: 'top' }} />
      </NSection>
      <NSection title="รูปภาพ">
        <NPhotoGrid
          uris={photos}
          onAdd={async () => {
            const r = await pickPhoto('library');
            if ('uri' in r) setPhotos((p) => [...p, r.uri]);
          }}
          onRemove={(u) => setPhotos((p) => p.filter((x) => x !== u))}
        />
      </NSection>
    </NScreen>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});

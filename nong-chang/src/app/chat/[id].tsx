import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAppBar, NEmpty, NIconButton, NText } from '@/components';
import { serviceById } from '@/data/catalog';
import { chatOpen } from '@/lib/chat';
import { formatTime } from '@/lib/format';
import { useJob, useTechnician } from '@/store/AppStore';
import { color, layout, radius, space, typography } from '@/theme/tokens';

interface Msg {
  id: string;
  from: 'me' | 'tech' | 'system';
  text: string;
  at: Date;
}

/** Order-bound chat (spec §42): every thread belongs to one job. */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { id: 's', from: 'system', text: `แชตนี้ผูกกับงาน ${id}`, at: new Date() },
    { id: 't1', from: 'tech', text: 'สวัสดีครับ ผมกำลังเดินทางไป มีที่จอดรถหน้าบ้านไหมครับ', at: new Date() },
  ]);

  if (!job || !tech) return <NEmpty title="ไม่พบแชตนี้" />;
  const open = chatOpen(job);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setMsgs((m) => [...m, { id: String(Date.now()), from: 'me', text: t, at: new Date() }]);
    setText('');
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <NAppBar
        title={tech.name}
        right={<NIconButton icon="phone" accessibilityLabel="โทร" onPress={() => Linking.openURL(`tel:${tech.phone}`)} />}
      />
      <View style={styles.context}>
        <NText variant="caption" color="textSecondary">
          {serviceById(job.serviceId)?.name} · งาน {job.id}
        </NText>
      </View>
      <FlatList
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) =>
          item.from === 'system' ? (
            <NText variant="caption" color="textPlaceholder" align="center">
              {item.text}
            </NText>
          ) : (
            <View style={[styles.bubble, item.from === 'me' ? styles.me : styles.them]}>
              <NText variant="body" style={{ color: item.from === 'me' ? color.textOnPrimary : color.textPrimary }}>
                {item.text}
              </NText>
              <NText variant="caption" style={{ color: item.from === 'me' ? 'rgba(255,255,255,0.7)' : color.textPlaceholder, alignSelf: 'flex-end' }}>
                {formatTime(item.at)}
              </NText>
            </View>
          )
        }
      />
      {open ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.xs) }]}>
          <NIconButton icon="camera" accessibilityLabel="ส่งรูป" />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="พิมพ์ข้อความ"
            placeholderTextColor={color.textPlaceholder}
            style={styles.input}
            multiline
          />
          <NIconButton icon="navigation" accessibilityLabel="ส่ง" iconColor={text.trim() ? color.primary : color.textPlaceholder} onPress={send} />
        </View>
      ) : (
        <View style={[styles.closed, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
          <NText variant="secondary" color="textSecondary" align="center">
            แชตนี้ปิดแล้ว หากมีปัญหากับงาน แจ้งน้องช่าง Support ได้เลย
          </NText>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  context: { paddingHorizontal: layout.screenPadding, paddingVertical: space.xs, backgroundColor: color.bgContainer, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.divider },
  list: { padding: layout.screenPadding, gap: space.sm },
  bubble: { maxWidth: '80%', borderRadius: radius.dialog, paddingHorizontal: space.sm, paddingVertical: space.xs, gap: 2 },
  me: { alignSelf: 'flex-end', backgroundColor: color.primary, borderBottomRightRadius: radius.sm },
  them: { alignSelf: 'flex-start', backgroundColor: color.bgContainer, borderBottomLeftRadius: radius.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xxs, paddingHorizontal: space.xs, paddingTop: space.xs, backgroundColor: color.bgContainer, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
  input: { ...typography.body, flex: 1, maxHeight: 120, minHeight: 40, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.input, backgroundColor: color.bgSecondary, color: color.textPrimary },
  closed: { padding: space.md, backgroundColor: color.bgContainer },
});

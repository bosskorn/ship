import { Button, color, font, space } from '@ship/mobile-ui';
import { useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';

/** Cross-platform text prompt (Alert.prompt is iOS-only). */
export function ReasonModal({
  visible,
  title,
  message,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: color.overlay, justifyContent: 'center', padding: space.xl }}>
        <View style={{ backgroundColor: color.surface, padding: space.lg, gap: space.md, borderRadius: 6 }}>
          <Text style={font.h2}>{title}</Text>
          {message && <Text style={[font.small, { color: color.text2 }]}>{message}</Text>}
          <TextInput value={text} onChangeText={setText} autoFocus placeholder="ระบุเหตุผล" placeholderTextColor={color.placeholder} style={[font.body, { borderWidth: 1, borderColor: color.border, borderRadius: 3, padding: space.sm, minHeight: 44 }]} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="ยกเลิก" variant="outline" block={false} style={{ flex: 1 }} onPress={() => { setText(''); onCancel(); }} />
            <Button title="ยืนยัน" block={false} style={{ flex: 1 }} disabled={text.trim().length < 3} onPress={() => { onSubmit(text.trim()); setText(''); }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

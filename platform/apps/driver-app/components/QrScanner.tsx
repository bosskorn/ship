import { Button, color, font, space } from '@ship/mobile-ui';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, Text, View } from 'react-native';

/** Scans the customer's pickup/drop-off QR ("<orderNo>:<code>"). */
export function QrScanner({ visible, onScanned, onClose }: { visible: boolean; onScanned: (data: string) => void; onClose: () => void }) {
  const [perm, request] = useCameraPermissions();
  const done = useRef(false);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => (done.current = false)}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {perm?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (done.current) return;
              done.current = true;
              onScanned(data);
            }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md }}>
            <Text style={[font.body, { color: '#fff', textAlign: 'center' }]}>ต้องการสิทธิ์กล้องเพื่อสแกน QR</Text>
            <Button title="อนุญาต" onPress={request} />
          </View>
        )}
        <View style={{ padding: space.lg, backgroundColor: color.surface }}>
          <Button title="ปิด" variant="outline" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

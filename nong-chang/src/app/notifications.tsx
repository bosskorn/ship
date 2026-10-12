import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { NAppBar, NBadge, NCell, NEmpty, NList, NScreen, NTabs } from '@/components';
import { formatShortDate, formatTime } from '@/lib/format';
import { useApp, type AppNotification } from '@/store/AppStore';

type Group = AppNotification['group'];

export default function Notifications() {
  const { state, markNotificationsRead } = useApp();
  const [tab, setTab] = useState<Group>('job');
  const list = state.notifications.filter((n) => n.group === tab);
  const unread = (g: Group) => state.notifications.filter((n) => n.group === g && !n.read).length || undefined;

  // Mark everything read when leaving, so unread dots stay visible while browsing.
  useEffect(() => () => markNotificationsRead(), [markNotificationsRead]);

  return (
    <NScreen scroll={false}>
      <NAppBar title="การแจ้งเตือน" />
      <NTabs
        items={[
          { value: 'job', label: 'งาน', badge: unread('job') },
          { value: 'system', label: 'ระบบ', badge: unread('system') },
          { value: 'promo', label: 'โปรโมชั่น', badge: unread('promo') },
        ]}
        value={tab}
        onChange={setTab}
      />
      <ScrollView>
        {list.length ? (
          <NList>
            {list.map((n) => {
              const d = new Date(n.at);
              const today = d.toDateString() === new Date().toDateString();
              return (
                <NCell
                  key={n.id}
                  title={n.title}
                  description={n.body}
                  note={today ? formatTime(d) : formatShortDate(d)}
                  right={!n.read ? <NBadge dot /> : undefined}
                  onPress={n.jobId ? () => router.push(`/job/${n.jobId}`) : undefined}
                />
              );
            })}
          </NList>
        ) : (
          <NEmpty icon="bell" title="ยังไม่มีการแจ้งเตือน" />
        )}
      </ScrollView>
    </NScreen>
  );
}
